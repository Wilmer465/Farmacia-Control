const crypto = require('node:crypto');
const { getDb } = require('../database/connection');
const permisoService = require('./permisoService');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const { AUDIT_ACTIONS } = require('../../shared/constants');
const { verificarXmlFirmado, validarRevocacionCertificado } = require('./dianSigningService');
const { cargarCredencialesDian } = require('./dianCredentialVault');
const soap = require('./dianSoapService');

class ErrorTransmisionDian extends Error {}

const ESTADOS_CERRADOS_PARA_ENVIO = new Set(['ENVIADO', 'VALIDADO', 'RECHAZADO', 'ERROR_TRANSMISION']);

function assert(condicion, mensaje) {
  if (!condicion) throw new ErrorTransmisionDian(mensaje);
}

function hashXml(xml) {
  return crypto.createHash('sha256').update(xml, 'utf8').digest('hex');
}

function registrarAuditoria(usuario, sedeId, accion, facturaId, valores, resultado = 'EXITO') {
  auditoriaRepository.registrar({
    usuario_id: usuario.id,
    rol: usuario.rol_nombre,
    sede_id: sedeId,
    accion,
    modulo: 'FACTURACION',
    registro_afectado: String(facturaId),
    resultado,
    valores_nuevos: valores
  });
}

function contextoDocumento(usuario, facturaId) {
  if (!usuario || !['SUPERADMIN', 'ADMIN', 'INVENTARIO'].includes(usuario.rol_nombre)) {
    throw new permisoService.PermisoError('No tiene permisos para transmitir documentos electrónicos.');
  }
  const db = getDb();
  const factura = db.prepare('SELECT * FROM facturas WHERE id=?').get(Number(facturaId));
  assert(factura, 'No se encontró el documento de facturación.');
  permisoService.verificarPerteneceASede(usuario, factura.sede_id);
  const cola = db.prepare('SELECT * FROM facturacion_cola_dian WHERE factura_id=?').get(factura.id);
  assert(cola, 'El documento no tiene registro en la cola DIAN.');
  const config = db.prepare('SELECT * FROM facturacion_config WHERE sede_id=?').get(factura.sede_id);
  return { db, factura, cola, config };
}

function registrarSolicitud(db, datos) {
  return Number(db.prepare(`INSERT INTO facturacion_transmisiones_dian
    (factura_id,cola_id,operacion,clave_idempotencia,huella_xml_sha256,soap_request_xml,resultado)
    VALUES (@factura_id,@cola_id,@operacion,@clave_idempotencia,@huella_xml_sha256,@soap_request_xml,'PREPARADA')`)
    .run(datos).lastInsertRowid);
}

function persistirRespuesta(db, intentoId, datos) {
  db.prepare(`UPDATE facturacion_transmisiones_dian SET soap_response_xml=?,http_status=?,resultado=?,zip_key=?,
    codigo_estado_dian=?,descripcion_estado_dian=?,mensajes_dian=?,respondido_en=datetime('now') WHERE id=?`)
    .run(datos.soapResponse || null, datos.httpStatus || null, datos.resultado, datos.zipKey || null,
      datos.codigo || null, datos.descripcion || null, datos.mensajes ? JSON.stringify(datos.mensajes) : null, intentoId);
}

async function transmitirFacturaHabilitacion(usuario, facturaId, dependencias = {}) {
  const { db, factura, cola, config } = contextoDocumento(usuario, facturaId);
  assert(config?.ambiente === 'HABILITACION', 'La transmisión SOAP de esta versión solo está habilitada en el ambiente DIAN de habilitación.');
  assert(config?.test_set_id, 'Configure el TestSetId entregado por DIAN para el modo de operación de habilitación.');
  assert(cola.estado === 'PREPARADO' && !cola.zip_key, 'Solo se pueden transmitir una vez documentos PREPARADO sin ZipKey DIAN.');
  assert(!ESTADOS_CERRADOS_PARA_ENVIO.has(cola.estado), 'El documento ya tuvo un intento de transmisión; no se reenviará para evitar duplicados.');
  assert(factura.xml_firmado, 'El documento todavía no tiene XML firmado.');

  const hashDocumento = hashXml(factura.xml_firmado);
  const existente = db.prepare(`SELECT id,resultado,zip_key FROM facturacion_transmisiones_dian
    WHERE factura_id=? AND operacion='ENVIO_SET_HABILITACION'`).get(factura.id);
  assert(!existente, 'Ya existe un intento de envío para este documento. Consulte el ZipKey guardado; no se repetirá el envío.');

  const verificacion = await (dependencias.verificarXmlFirmado || verificarXmlFirmado)(factura.xml_firmado);
  assert(verificacion.firmaValida === true, 'La firma guardada no se pudo verificar localmente.');
  const credenciales = await (dependencias.cargarCredenciales || cargarCredencialesDian)();
  await (dependencias.validarRevocacion || validarRevocacionCertificado)(credenciales, { fecha: new Date() });

  const solicitud = await (dependencias.prepararSolicitud || soap.prepararSolicitudSetHabilitacion)({
    xmlFirmado: factura.xml_firmado,
    numero: factura.numero,
    testSetId: config.test_set_id,
    credenciales,
    nitEmisor: config.nit_emisor
  }, dependencias);
  const claveIdempotencia = crypto.createHash('sha256')
    .update(`${factura.id}|${hashDocumento}|${config.test_set_id}|SendTestSetAsync`)
    .digest('hex');
  let intentoId;
  try {
    const tx = db.transaction(() => {
      const actual = db.prepare('SELECT estado,zip_key FROM facturacion_cola_dian WHERE id=?').get(cola.id);
      assert(actual.estado === 'PREPARADO' && !actual.zip_key, 'El estado de la cola cambió. Vuelva a consultarla.');
      intentoId = registrarSolicitud(db, {
        factura_id: factura.id,
        cola_id: cola.id,
        operacion: 'ENVIO_SET_HABILITACION',
        clave_idempotencia: claveIdempotencia,
        huella_xml_sha256: hashDocumento,
        soap_request_xml: solicitud.soapRequest
      });
      db.prepare(`INSERT INTO facturacion_eventos_dian(factura_id,cola_id,tipo,detalle,huella_sha256)
        VALUES (?,?,'INTENTO_TRANSMISION',?,?)`).run(factura.id, cola.id,
        'Solicitud SendTestSetAsync persistida. Este intento no se repetirá automáticamente.', hashDocumento);
      registrarAuditoria(usuario, factura.sede_id, AUDIT_ACTIONS.FACTURACION_DOCUMENTO_TRANSMITIR, factura.id,
        { resultado: 'SOLICITUD_PERSISTIDA', sha256_xml: hashDocumento, ambiente: 'HABILITACION' });
    });
    tx();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new ErrorTransmisionDian('Ya existe una solicitud de transmisión para este documento.');
    throw error;
  }

  // El estado incierto queda persistido antes de abrir la conexión: un cierre inesperado no provoca reenvío duplicado.
  db.prepare("UPDATE facturacion_transmisiones_dian SET resultado='RESULTADO_DESCONOCIDO' WHERE id=?").run(intentoId);
  try {
    const respuesta = await (dependencias.ejecutarSolicitud || soap.ejecutarSolicitudSoap)({ ...solicitud, credenciales }, dependencias);
    if (respuesta.statusCode < 200 || respuesta.statusCode >= 300) {
      const error = new Error(`DIAN respondió HTTP ${respuesta.statusCode}; el resultado remoto no se puede determinar.`);
      error.httpStatus = respuesta.statusCode;
      error.soapResponse = respuesta.body;
      throw error;
    }
    const resultado = soap.respuestaSendTestSet(respuesta.body);
    if (resultado.zipKey && /^[A-Fa-f0-9-]{36}$/.test(resultado.zipKey)) {
      const tx = db.transaction(() => {
        persistirRespuesta(db, intentoId, { soapResponse: respuesta.body, httpStatus: respuesta.statusCode, resultado: 'ZIP_RECIBIDO', zipKey: resultado.zipKey, mensajes: resultado.errores });
        db.prepare(`UPDATE facturacion_cola_dian SET estado='ENVIADO',zip_key=?,xml_file_name=?,intentos=intentos+1,
          ultimo_error=NULL,proximo_intento=NULL,actualizado_en=datetime('now') WHERE id=?`)
          .run(resultado.zipKey, solicitud.nombreXml, cola.id);
        db.prepare("UPDATE facturas SET estado_dian='ENVIADA' WHERE id=?").run(factura.id);
        db.prepare(`INSERT INTO facturacion_eventos_dian(factura_id,cola_id,tipo,detalle,huella_sha256)
          VALUES (?,?,'RESPUESTA_RECIBIDA',?,?)`).run(factura.id, cola.id,
          'DIAN devolvió ZipKey; documento en cola de validación asíncrona, todavía no validado.', hashDocumento);
        registrarAuditoria(usuario, factura.sede_id, AUDIT_ACTIONS.FACTURACION_DOCUMENTO_TRANSMITIR, factura.id,
          { resultado: 'ZIP_RECIBIDO', zip_key: resultado.zipKey, estado_cola: 'ENVIADO' });
      });
      tx();
      return { estado: 'ENVIADO', validacionDian: 'PENDIENTE', zipKey: resultado.zipKey, erroresIniciales: resultado.errores };
    }
    const tx = db.transaction(() => {
      persistirRespuesta(db, intentoId, { soapResponse: respuesta.body, httpStatus: respuesta.statusCode,
        resultado: resultado.fault ? 'ERROR_LOCAL' : 'ERROR_LOCAL', mensajes: resultado.errores || [resultado.fault?.razon].filter(Boolean) });
      db.prepare("UPDATE facturacion_cola_dian SET estado='ERROR_TRANSMISION',intentos=intentos+1,ultimo_error=?,actualizado_en=datetime('now') WHERE id=?")
        .run('DIAN no devolvió un ZipKey; el documento no se reenviará automáticamente.', cola.id);
      db.prepare(`INSERT INTO facturacion_eventos_dian(factura_id,cola_id,tipo,detalle,huella_sha256)
        VALUES (?,?,'RESPUESTA_RECIBIDA',?,?)`).run(factura.id, cola.id,
        'Respuesta SOAP auténtica sin ZipKey. No se registra aceptación DIAN y el envío queda bloqueado para evitar duplicados.', hashDocumento);
      registrarAuditoria(usuario, factura.sede_id, AUDIT_ACTIONS.FACTURACION_DOCUMENTO_TRANSMITIR, factura.id,
        { resultado: 'RESPUESTA_SIN_ZIPKEY', estado_cola: 'ERROR_TRANSMISION' });
    });
    tx();
    return { estado: 'ERROR_TRANSMISION', zipKey: null, errores: resultado.errores };
  } catch (error) {
    const mensaje = 'No se pudo confirmar el resultado remoto. El intento quedó bloqueado para evitar transmitir el mismo documento dos veces.';
    const tx = db.transaction(() => {
      persistirRespuesta(db, intentoId, { soapResponse: error.soapResponse, httpStatus: error.httpStatus,
        resultado: 'RESULTADO_DESCONOCIDO', mensajes: [error.message] });
      db.prepare("UPDATE facturacion_cola_dian SET estado='ERROR_TRANSMISION',intentos=intentos+1,ultimo_error=?,actualizado_en=datetime('now') WHERE id=?")
        .run(mensaje, cola.id);
      db.prepare(`INSERT INTO facturacion_eventos_dian(factura_id,cola_id,tipo,detalle,huella_sha256)
        VALUES (?,?,'ERROR_TRANSMISION',?,?)`).run(factura.id, cola.id, mensaje, hashDocumento);
      registrarAuditoria(usuario, factura.sede_id, AUDIT_ACTIONS.FACTURACION_DOCUMENTO_TRANSMITIR, factura.id,
        { resultado: 'RESULTADO_DESCONOCIDO', estado_cola: 'ERROR_TRANSMISION' });
    });
    tx();
    throw new ErrorTransmisionDian(mensaje);
  }
}

async function consultarEstadoZip(usuario, facturaId, dependencias = {}) {
  const { db, factura, cola, config } = contextoDocumento(usuario, facturaId);
  assert(config?.ambiente === 'HABILITACION', 'La consulta de esta etapa solo opera en el ambiente DIAN de habilitación.');
  assert(cola.estado === 'ENVIADO' && cola.zip_key, 'El documento no tiene un ZipKey recibido de DIAN para consultar.');
  assert(cola.xml_file_name, 'No se conservó el nombre del XML asociado al ZipKey.');
  const credenciales = await (dependencias.cargarCredenciales || cargarCredencialesDian)();
  await (dependencias.validarRevocacion || validarRevocacionCertificado)(credenciales, { fecha: new Date() });
  const solicitud = await (dependencias.prepararConsulta || soap.prepararConsultaZipHabilitacion)({
    zipKey: cola.zip_key, credenciales, nitEmisor: config.nit_emisor
  }, dependencias);
  const idempotencia = crypto.randomUUID();
  const hashDocumento = hashXml(factura.xml_firmado);
  const intentoId = registrarSolicitud(db, {
    factura_id: factura.id, cola_id: cola.id, operacion: 'CONSULTA_ESTADO_ZIP',
    clave_idempotencia: `CONSULTA:${factura.id}:${idempotencia}`, huella_xml_sha256: hashDocumento,
    soap_request_xml: solicitud.soapRequest
  });
  let respuesta;
  try {
    respuesta = await (dependencias.ejecutarSolicitud || soap.ejecutarSolicitudSoap)({ ...solicitud, credenciales }, dependencias);
    if (respuesta.statusCode < 200 || respuesta.statusCode >= 300) {
      const error = new Error(`DIAN respondió HTTP ${respuesta.statusCode} al consultar el ZipKey.`);
      error.httpStatus = respuesta.statusCode;
      error.soapResponse = respuesta.body;
      throw error;
    }
  } catch (error) {
    db.transaction(() => {
      persistirRespuesta(db, intentoId, { soapResponse: error.soapResponse, httpStatus: error.httpStatus,
        resultado: 'CONSULTA_SIN_RESULTADO', mensajes: [error.message] });
      db.prepare(`INSERT INTO facturacion_eventos_dian(factura_id,cola_id,tipo,detalle,huella_sha256)
        VALUES (?,?,'ERROR_TRANSMISION',?,?)`).run(factura.id, cola.id,
        'No se obtuvo respuesta SOAP verificable para GetStatusZip; se conserva el estado ENVIADO.', hashDocumento);
      registrarAuditoria(usuario, factura.sede_id, AUDIT_ACTIONS.FACTURACION_ESTADO_DIAN_CONSULTAR, factura.id,
        { resultado: 'CONSULTA_SIN_RESULTADO', error: error.message, zip_key: cola.zip_key }, 'ERROR');
    })();
    throw new ErrorTransmisionDian('No se pudo consultar el ZipKey DIAN. No se modificó el estado del documento.');
  }
  let resultadoSoap;
  try {
    assert(respuesta.statusCode >= 200 && respuesta.statusCode < 300, `DIAN respondió HTTP ${respuesta.statusCode} al consultar el ZipKey.`);
    resultadoSoap = soap.respuestaGetStatusZip(respuesta.body);
  } catch (error) {
    db.transaction(() => {
      persistirRespuesta(db, intentoId, { soapResponse: respuesta.body, httpStatus: respuesta.statusCode,
        resultado: 'CONSULTA_SIN_RESULTADO', mensajes: [error.message] });
      db.prepare(`INSERT INTO facturacion_eventos_dian(factura_id,cola_id,tipo,detalle,huella_sha256)
        VALUES (?,?,'ERROR_TRANSMISION',?,?)`).run(factura.id, cola.id,
        'Respuesta SOAP no procesable; se conserva el estado ENVIADO.', hashDocumento);
      registrarAuditoria(usuario, factura.sede_id, AUDIT_ACTIONS.FACTURACION_ESTADO_DIAN_CONSULTAR, factura.id,
        { resultado: 'CONSULTA_SIN_RESULTADO', error: error.message, zip_key: cola.zip_key }, 'ERROR');
    })();
    throw error;
  }
  const documento = resultadoSoap.resultados.find(item => item.nombre === cola.xml_file_name &&
    item.claveDocumento.toLowerCase() === String(factura.tipo_documento === 'FACTURA' ? factura.cufe : factura.cude).toLowerCase());
  if (resultadoSoap.fault || !documento) {
    const detalle = resultadoSoap.fault?.razon || 'La respuesta no identifica el XML y CUFE/CUDE exactos de este documento.';
    db.transaction(() => {
      persistirRespuesta(db, intentoId, { soapResponse: respuesta.body, httpStatus: respuesta.statusCode,
        resultado: 'CONSULTA_SIN_RESULTADO', mensajes: [detalle] });
      db.prepare(`INSERT INTO facturacion_eventos_dian(factura_id,cola_id,tipo,detalle,huella_sha256)
        VALUES (?,?,'RESPUESTA_RECIBIDA',?,?)`).run(factura.id, cola.id,
        'GetStatusZip no devolvió un resultado coincidente; se conserva el estado ENVIADO.', hashDocumento);
      registrarAuditoria(usuario, factura.sede_id, AUDIT_ACTIONS.FACTURACION_ESTADO_DIAN_CONSULTAR, factura.id,
        { resultado: 'CONSULTA_SIN_RESULTADO', zip_key: cola.zip_key });
    })();
    return { estado: 'ENVIADO', resultado: 'SIN_RESULTADO_COINCIDENTE' };
  }
  const esValido = documento.esValido.toLowerCase() === 'true' && documento.codigo === '00';
  const esRechazado = documento.esValido.toLowerCase() === 'false' && documento.codigo === '99';
  const resultado = esValido ? 'VALIDADO' : (esRechazado ? 'RECHAZADO' : 'CONSULTA_SIN_RESULTADO');
  const tx = db.transaction(() => {
    persistirRespuesta(db, intentoId, { soapResponse: respuesta.body, httpStatus: respuesta.statusCode,
      resultado, codigo: documento.codigo, descripcion: documento.descripcion,
      mensajes: [...documento.errores, documento.mensaje].filter(Boolean) });
    if (esValido) {
      db.prepare("UPDATE facturacion_cola_dian SET estado='VALIDADO',ultimo_error=NULL,actualizado_en=datetime('now') WHERE id=?").run(cola.id);
      db.prepare("UPDATE facturas SET estado_dian='VALIDADA' WHERE id=?").run(factura.id);
    } else if (esRechazado) {
      db.prepare("UPDATE facturacion_cola_dian SET estado='RECHAZADO',ultimo_error=?,actualizado_en=datetime('now') WHERE id=?")
        .run(documento.descripcion || documento.errores.join('; '), cola.id);
      db.prepare("UPDATE facturas SET estado_dian='RECHAZADA' WHERE id=?").run(factura.id);
    }
    db.prepare(`INSERT INTO facturacion_eventos_dian(factura_id,cola_id,tipo,detalle,huella_sha256)
      VALUES (?,?,'RESPUESTA_RECIBIDA',?,?)`).run(factura.id, cola.id,
      `Respuesta oficial GetStatusZip ${documento.codigo}: ${documento.descripcion || documento.mensaje || 'sin descripción'}. Estado aplicado: ${resultado}.`, hashDocumento);
    registrarAuditoria(usuario, factura.sede_id, AUDIT_ACTIONS.FACTURACION_ESTADO_DIAN_CONSULTAR, factura.id,
      { resultado, codigo_dian: documento.codigo, zip_key: cola.zip_key });
  });
  tx();
  return { estado: resultado, codigoDian: documento.codigo, descripcion: documento.descripcion,
    errores: documento.errores, applicationResponseBase64: documento.applicationResponseBase64 };
}

module.exports = { transmitirFacturaHabilitacion, consultarEstadoZip, ErrorTransmisionDian };
