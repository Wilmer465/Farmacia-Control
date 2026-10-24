// Ejecutar solo dentro de Electron (ABI nativo de better-sqlite3):
// pnpm run test:dian:electron
// Las respuestas en este módulo son fixtures sintéticos de prueba y jamás se conectan al endpoint.
const assert = require('node:assert/strict');
const fs = require('node:fs');
// Evita cargar criptografía XML en modo Node de Electron; las pruebas puras de firma se ejecutan aparte con Node.
const moduloFirma = require.resolve('../../backend/services/dianSigningService');
require.cache[moduloFirma] = {
  id: moduloFirma, filename: moduloFirma, loaded: true, exports: {
    firmarXmlDian: async xml => ({ xmlFirmado: xml, verificación: { firmaValida: true } }),
    firmarMensajeSoap: async xml => ({ xmlFirmado: xml }),
    verificarXmlFirmado: async () => ({ firmaValida: true }),
    validarRevocacionCertificado: async () => ({ revocacion: 'FIXTURE_NO_USAR_EN_PRODUCCION' })
  }
};
const { teardownTestDb } = require('../helpers/testDb');
const Database = require('better-sqlite3');
const { setTestDb } = require('../../backend/database/connection');
const { runMigrations } = require('../../backend/database/migrate');
const facturacion = require('../../backend/services/facturacionService');
const transmision = require('../../backend/services/dianTransmissionService');

const WCF = 'http://wcf.dian.colombia';
const SOAP = 'http://www.w3.org/2003/05/soap-envelope';
const TEST_SET = '12345678-1234-1234-1234-123456789012';
const XML_AR_FIXTURE = Buffer.from('<ApplicationResponse>TEST_ONLY</ApplicationResponse>').toString('base64');

function sobre(respuesta) {
  return `<s:Envelope xmlns:s="${SOAP}" xmlns:w="${WCF}" xmlns:a="http://schemas.datacontract.org/2004/07/DianResponse"><s:Body>${respuesta}</s:Body></s:Envelope>`;
}

function respuestaEnvio(zipKey) {
  return sobre(`<w:SendTestSetAsyncResponse><w:SendTestSetAsyncResult><w:ZipKey>${zipKey}</w:ZipKey><w:ErrorMessageList/></w:SendTestSetAsyncResult></w:SendTestSetAsyncResponse>`);
}

function respuestaEstado({ nombre, cufe, esValido, codigo, descripcion }) {
  return sobre(`<w:GetStatusZipResponse><w:GetStatusZipResult><a:DianResponse><a:XmlFileName>${nombre}</a:XmlFileName><a:XmlDocumentKey>${cufe}</a:XmlDocumentKey><a:IsValid>${esValido}</a:IsValid><a:StatusCode>${codigo}</a:StatusCode><a:StatusDescription>${descripcion}</a:StatusDescription><a:StatusMessage>Fixture solo para pruebas</a:StatusMessage><a:ErrorMessage/><a:XmlBase64Bytes>${XML_AR_FIXTURE}</a:XmlBase64Bytes></a:DianResponse></w:GetStatusZipResult></w:GetStatusZipResponse>`);
}

function prepararEntorno() {
  const registrarMigraciones = console.log;
  console.log = () => {};
  let db;
  try {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    setTestDb(db);
    runMigrations();
  }
  finally { console.log = registrarMigraciones; }
  const rolId = Number(db.prepare("INSERT INTO roles(nombre,descripcion) VALUES ('SUPERADMIN','Fixture de pruebas')").run().lastInsertRowid);
  const sedeId = Number(db.prepare("INSERT INTO sedes(nombre,ciudad,estado) VALUES ('Sede DIAN test','Bogotá','ACTIVO')").run().lastInsertRowid);
  const usuarioId = Number(db.prepare("INSERT INTO usuarios(nombre,username,password_hash,rol_id,sede_id,estado) VALUES ('Admin fixture','dian_test','hash-fixture',?,NULL,'ACTIVO')").run(rolId).lastInsertRowid);
  const usuario = { id: usuarioId, rol_id: rolId, rol_nombre: 'SUPERADMIN', sede_id: null, username: 'dian_test' };
  const sede = { id: sedeId };

  db.prepare('INSERT INTO medicamentos(codigo,nombre,presentacion,unidad_medida,unidades_por_caja) VALUES (?,?,?,?,?)')
    .run('DIAN-TST-01', 'Producto integración', 'Tableta 500 mg', 'TABLETA', 10);
  const medicamentoId = Number(db.prepare('SELECT last_insert_rowid() id').get().id);
  db.prepare(`INSERT INTO lotes(medicamento_id,sede_id,numero_lote,fecha_expedicion,fecha_vencimiento,cantidad_cajas,cantidad_unidades_sueltas,cantidad_total_unidades)
    VALUES (?,?,?,'2026-01-01','2027-01-01',10,0,100)`).run(medicamentoId, sede.id, 'DIAN-LOTE-01');
  const loteId = Number(db.prepare('SELECT last_insert_rowid() id').get().id);
  db.prepare("INSERT INTO movimientos_inventario(lote_id,medicamento_id,sede_id,tipo,cantidad) VALUES (?,?,?,'ENTRADA',100)")
    .run(loteId, medicamentoId, sede.id);

  facturacion.guardarConfiguracion(usuario, {
    sedeId: sede.id, prefijo: 'FV', rango_desde: 1, rango_hasta: 500,
    fecha_resolucion: '2026-01-01', fecha_vencimiento_resolucion: '2026-12-31',
    ambiente: 'HABILITACION', test_set_id: TEST_SET, numero_autorizacion_dian: '18760000000001',
    software_id: 'software-prueba-electron', nit_proveedor_software: '900123456', dv_proveedor_software: '7',
    nit_emisor: '900123456', dv_emisor: '7', nombre_legal: 'Farmacia Prueba',
    tipo_identificacion_emisor: '31', direccion_emisor: 'Calle 1', municipio_emisor: 'Bogotá',
    codigo_municipio_emisor: '11001', departamento_emisor: 'Bogotá D.C.', codigo_departamento_emisor: '11',
    impuesto_emisor_id: '01', impuesto_emisor_nombre: 'IVA', codigo_medio_pago: '10'
  });
  const cliente = facturacion.guardarCliente(usuario, {
    sedeId: sede.id, tipo_documento: 'CC', numero_documento: '12345', nombre: 'Cliente prueba integración',
    codigo_identificacion_dian: '13', direccion: 'Calle 2', municipio: 'Bogotá', codigo_municipio: '11001',
    departamento: 'Bogotá D.C.', codigo_departamento: '11', impuesto_id: '01', impuesto_nombre: 'IVA'
  });
  const factura = facturacion.crearFactura(usuario, {
    sedeId: sede.id, cliente_id: cliente.id,
    lineas: [{ lote_id: loteId, cantidad: 1, precio_unitario: 100, porcentaje_impuesto: 19, codigo_impuesto: '01' }]
  });
  const credenciales = { certificadoPath: 'fixture.p12', certificadoPassword: 'fixture', paqueteRaicesPath: 'fixture.pem' };
  return { db, usuario, sede, factura, credenciales };
}

async function prepararFactura(fixture) {
  const { factura } = fixture;
  // XML/CUFE de fixture: estos tests aíslan persistencia/transiciones; la firma criptográfica real
  // se comprueba en dianSigning.test.js y dianSoap.test.js.
  const xmlFirmadoFixture = '<Invoice><Fixture>TEST_ONLY</Fixture><Signature>NOT_A_DI_SIGNATURE</Signature></Invoice>'.replace(/\u200b/g, '');
  const cufe = 'a'.repeat(96);
  fixture.db.prepare("UPDATE facturas SET cufe=?,xml_firmado=? WHERE id=?").run(cufe, xmlFirmadoFixture, factura.id);
  fixture.db.prepare("UPDATE facturacion_cola_dian SET estado='PREPARADO' WHERE factura_id=?").run(factura.id);
  return fixture.db.prepare('SELECT * FROM facturas WHERE id=?').get(factura.id);
}

function dependenciasDePrueba(credenciales, ejecutarSolicitud) {
  return {
    cargarCredenciales: async () => credenciales,
    // La CRL del certificado sintético no modela una CA real. Este reemplazo existe solo en este test offline;
    // la implementación productiva mantiene validación de cadena y revocación real fail-closed.
    validarRevocacion: async () => ({ revocacion: 'FIXTURE_NO_USAR_EN_PRODUCCION' }),
    verificarXmlFirmado: async () => ({ firmaValida: true }),
    prepararSolicitud: async ({ numero }) => ({ soapRequest: `<soap>TEST_ONLY ${numero} SendTestSetAsync</soap>`,
      endpoint: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc', accion: `${WCF}/SendTestSetAsync`,
      nombreXml: `${numero}.xml`, nombreZip: `${numero}.zip` }),
    prepararConsulta: async ({ zipKey }) => ({ soapRequest: `<soap>TEST_ONLY ${zipKey} GetStatusZip</soap>`,
      endpoint: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc', accion: `${WCF}/GetStatusZip` }),
    ejecutarSolicitud
  };
}

async function testEnvioConsultaYPersistencia() {
  const f = prepararEntorno();
  try {
    const guardada = await prepararFactura(f);
    const zipKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    let llamadasEnvio = 0;
    let consultasZip = 0;
    const deps = dependenciasDePrueba(f.credenciales, async solicitud => {
      assert.equal(solicitud.endpoint, 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc');
      if (solicitud.soapRequest.includes('SendTestSetAsync')) {
        assert.match(solicitud.soapRequest, /SendTestSetAsync/);
        llamadasEnvio += 1;
        return { statusCode: 200, body: respuestaEnvio(zipKey) };
      }
      consultasZip += 1;
      if (consultasZip === 1) {
        return { statusCode: 200, body: sobre('<w:GetStatusZipResponse><w:GetStatusZipResult/></w:GetStatusZipResponse>') };
      }
      const cola = f.db.prepare('SELECT xml_file_name FROM facturacion_cola_dian WHERE factura_id=?').get(f.factura.id);
      return { statusCode: 200, body: respuestaEstado({ nombre: cola.xml_file_name, cufe: guardada.cufe,
        esValido: 'true', codigo: '00', descripcion: 'Aceptado solo por fixture de prueba' }) };
    });

    const envio = await transmision.transmitirFacturaHabilitacion(f.usuario, f.factura.id, deps);
    assert.equal(envio.estado, 'ENVIADO');
    assert.equal(envio.validacionDian, 'PENDIENTE');
    assert.equal(llamadasEnvio, 1);
    assert.equal(f.db.prepare('SELECT estado FROM facturacion_cola_dian WHERE factura_id=?').get(f.factura.id).estado, 'ENVIADO');
    assert.equal(f.db.prepare('SELECT estado_dian FROM facturas WHERE id=?').get(f.factura.id).estado_dian, 'ENVIADA');
    const solicitudGuardada = f.db.prepare("SELECT * FROM facturacion_transmisiones_dian WHERE operacion='ENVIO_SET_HABILITACION'").get();
    assert.equal(solicitudGuardada.resultado, 'ZIP_RECIBIDO');
    assert.equal(solicitudGuardada.zip_key, zipKey);
    assert.match(solicitudGuardada.soap_request_xml, /TEST_ONLY/);
    assert.match(solicitudGuardada.soap_response_xml, /SendTestSetAsyncResponse/);
    await assert.rejects(() => transmision.transmitirFacturaHabilitacion(f.usuario, f.factura.id, deps), /PREPARADO/);
    assert.equal(llamadasEnvio, 1, 'La repetición del comando no provoca un segundo envío.');

    const pendiente = await transmision.consultarEstadoZip(f.usuario, f.factura.id, deps);
    assert.equal(pendiente.estado, 'ENVIADO');
    assert.equal(f.db.prepare('SELECT estado FROM facturacion_cola_dian WHERE factura_id=?').get(f.factura.id).estado, 'ENVIADO');
    assert.equal(f.db.prepare("SELECT tipo FROM facturacion_eventos_dian WHERE factura_id=? ORDER BY id DESC LIMIT 1").get(f.factura.id).tipo, 'RESPUESTA_RECIBIDA');
    assert.equal(f.db.prepare("SELECT resultado FROM auditoria WHERE registro_afectado=? AND accion='FACTURACION_ESTADO_DIAN_CONSULTAR' ORDER BY id DESC LIMIT 1").get(String(f.factura.id)).resultado, 'EXITO');
    const consulta = await transmision.consultarEstadoZip(f.usuario, f.factura.id, deps);
    assert.equal(consulta.estado, 'VALIDADO');
    assert.equal(f.db.prepare('SELECT estado FROM facturacion_cola_dian WHERE factura_id=?').get(f.factura.id).estado, 'VALIDADO');
    assert.equal(f.db.prepare('SELECT estado_dian FROM facturas WHERE id=?').get(f.factura.id).estado_dian, 'VALIDADA');
    assert.equal(f.db.prepare('SELECT count(*) cantidad FROM facturacion_transmisiones_dian WHERE factura_id=?').get(f.factura.id).cantidad, 3);
    assert.equal(f.db.prepare('SELECT count(*) cantidad FROM facturacion_eventos_dian WHERE factura_id=?').get(f.factura.id).cantidad >= 3, true);
    assert.ok(consulta.applicationResponseBase64);
  } finally {
    teardownTestDb();
  }
}

async function testErroresYNoDuplicacion() {
  const f = prepararEntorno();
  try {
    await prepararFactura(f);
    const db = f.db;
    await assert.rejects(() => transmision.transmitirFacturaHabilitacion(f.usuario, f.factura.id,
      { ...dependenciasDePrueba(f.credenciales, async () => { throw new Error('No debe transmitir.'); }),
        validarRevocacion: async () => { throw new Error('CRL de prueba no disponible.'); } }), /CRL de prueba/);
    assert.equal(db.prepare('SELECT estado FROM facturacion_cola_dian WHERE factura_id=?').get(f.factura.id).estado, 'PREPARADO');
    assert.equal(db.prepare('SELECT count(*) cantidad FROM facturacion_transmisiones_dian WHERE factura_id=?').get(f.factura.id).cantidad, 0);

    let llamadas = 0;
    const deps = dependenciasDePrueba(f.credenciales, async () => {
      llamadas += 1;
      throw new Error('socket cerrado después de enviar bytes; respuesta no disponible');
    });
    await assert.rejects(() => transmision.transmitirFacturaHabilitacion(f.usuario, f.factura.id, deps), /bloqueado para evitar/);
    assert.equal(llamadas, 1);
    const cola = db.prepare('SELECT estado,ultimo_error FROM facturacion_cola_dian WHERE factura_id=?').get(f.factura.id);
    assert.equal(cola.estado, 'ERROR_TRANSMISION');
    assert.match(cola.ultimo_error, /evitar transmitir/);
    const intento = db.prepare('SELECT resultado,mensajes_dian FROM facturacion_transmisiones_dian WHERE factura_id=?').get(f.factura.id);
    assert.equal(intento.resultado, 'RESULTADO_DESCONOCIDO');
    assert.match(intento.mensajes_dian, /socket cerrado/);
    await assert.rejects(() => transmision.transmitirFacturaHabilitacion(f.usuario, f.factura.id, deps), /PREPARADO/);
    assert.equal(llamadas, 1, 'Un resultado incierto queda sin reintento automático para prevenir duplicados.');
  } finally {
    teardownTestDb();
  }
}

async function testRechazoAutenticoSoloPorDocumentoCoincidente() {
  const f = prepararEntorno();
  try {
    const factura = await prepararFactura(f);
    const zipKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const deps = dependenciasDePrueba(f.credenciales, async solicitud => {
      if (solicitud.soapRequest.includes('SendTestSetAsync')) {
        return { statusCode: 200, body: respuestaEnvio(zipKey) };
      }
      const cola = f.db.prepare('SELECT xml_file_name FROM facturacion_cola_dian WHERE factura_id=?').get(f.factura.id);
      return { statusCode: 200, body: respuestaEstado({ nombre: cola.xml_file_name, cufe: factura.cufe,
        esValido: 'false', codigo: '99', descripcion: 'Rechazo de fixture solo para pruebas' }) };
    });
    assert.equal((await transmision.transmitirFacturaHabilitacion(f.usuario, f.factura.id, deps)).estado, 'ENVIADO');
    const consulta = await transmision.consultarEstadoZip(f.usuario, f.factura.id, deps);
    assert.equal(consulta.estado, 'RECHAZADO');
    assert.equal(f.db.prepare('SELECT estado FROM facturacion_cola_dian WHERE factura_id=?').get(f.factura.id).estado, 'RECHAZADO');
    assert.equal(f.db.prepare('SELECT estado_dian FROM facturas WHERE id=?').get(f.factura.id).estado_dian, 'RECHAZADA');
  } finally {
    teardownTestDb();
  }
}

async function run() {
  const versiones = process.versions;
  assert.equal(Number(versiones.modules), 128, 'La integración SQLite debe ejecutarse con Electron 32 ABI 128.');
  await testEnvioConsultaYPersistencia();
  console.log('PASS integración SQLite: XML firmado -> SendTestSetAsync fixture -> ZipKey -> GetStatusZip fixture -> estado y auditoría');
  await testErroresYNoDuplicacion();
  console.log('PASS recuperación: preflight local es reintentable; timeout ambiguo persiste y bloquea duplicado');
  await testRechazoAutenticoSoloPorDocumentoCoincidente();
  console.log('PASS procesamiento de rechazo: requiere coincidencia de nombre/CUFE y código de rechazo de fixture');
  console.log('PASS los fixtures SOAP permanecen dentro de tests; ninguna llamada al endpoint oficial fue realizada.');
  const archivoFinalizacion = process.env.DIAN_TEST_COMPLETION_FILE;
  assert.ok(archivoFinalizacion, 'El runner Electron debe proporcionar un archivo de confirmación de ejecución.');
  fs.writeFileSync(archivoFinalizacion, 'complete', { flag: 'wx' });
}

module.exports = { run };
