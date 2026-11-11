const { getDb } = require('../database/connection');
const permisoService = require('./permisoService');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const { AUDIT_ACTIONS } = require('../../shared/constants');
const { generarXml, validarXml } = require('./dianUblService');
const { calcularCodigoUnico } = require('./dianControlCodes');
const { firmarXmlDian, verificarXmlFirmado } = require('./dianSigningService');
const { cargarCredencialesDian } = require('./dianCredentialVault');
const { createHash } = require('node:crypto');

class ErrorNegocio extends Error {}

const ROLES_COMERCIALES = ['SUPERADMIN', 'ADMIN', 'INVENTARIO'];
const ROLES_CONFIG = ['SUPERADMIN', 'ADMIN'];

function validarAcceso(usuario, soloConfig = false) {
  const permitidos = soloConfig ? ROLES_CONFIG : ROLES_COMERCIALES;
  if (!usuario || !permitidos.includes(usuario.rol_nombre)) {
    throw new permisoService.PermisoError('No tiene permisos para gestionar facturación.');
  }
}

function sedeUsuario(usuario, solicitada) {
  const sedeId = permisoService.resolverSedeEfectiva(usuario, solicitada);
  if (!sedeId && usuario.rol_nombre === 'SUPERADMIN') {
    throw new ErrorNegocio('Seleccione una sede para realizar esta operación.');
  }
  return Number(sedeId);
}

function registrarAuditoria(usuario, sedeId, accion, registro, nuevos) {
  auditoriaRepository.registrar({
    usuario_id: usuario.id, rol: usuario.rol_nombre, sede_id: sedeId,
    accion, modulo: 'FACTURACION', registro_afectado: String(registro),
    resultado: 'EXITO', valores_nuevos: nuevos
  });
}

function listarClientes(usuario, filtros = {}) {
  validarAcceso(usuario);
  const db = getDb();
  const sedeId = sedeUsuario(usuario, filtros.sedeId);
  return db.prepare('SELECT * FROM clientes_facturacion WHERE sede_id = ? ORDER BY nombre').all(sedeId);
}

function guardarCliente(usuario, datos) {
  validarAcceso(usuario);
  const db = getDb();
  const sedeId = sedeUsuario(usuario, datos?.sedeId);
  const tipo = String(datos?.tipo_documento || 'CC').trim().toUpperCase();
  const documento = String(datos?.numero_documento || '').trim();
  const nombre = String(datos?.nombre || '').trim();
  if (!documento || !nombre) throw new ErrorNegocio('El nombre y el número de documento del cliente son obligatorios.');
  if (documento.length > 30 || nombre.length > 160) throw new ErrorNegocio('El nombre o documento supera la longitud permitida.');
  for (const campo of ['correo','telefono','direccion','municipio','departamento','responsabilidades_fiscales','codigo_identificacion_dian','digito_verificacion','codigo_municipio','codigo_departamento','codigo_pais','tipo_persona','impuesto_id','impuesto_nombre']) {
    if (String(datos?.[campo]||'').length > 254) throw new ErrorNegocio(`El campo ${campo} supera la longitud permitida.`);
  }
  const allowed = ['CC','NIT','CE','TI','PA','OTRO'];
  if (!allowed.includes(tipo)) throw new ErrorNegocio('Tipo de documento no permitido.');
  db.prepare(`INSERT INTO clientes_facturacion
    (sede_id,tipo_documento,numero_documento,nombre,correo,telefono,direccion,municipio,departamento,responsabilidades_fiscales,codigo_identificacion_dian,digito_verificacion,codigo_municipio,codigo_departamento,codigo_pais,tipo_persona,impuesto_id,impuesto_nombre)
    VALUES (@sede_id,@tipo_documento,@numero_documento,@nombre,@correo,@telefono,@direccion,@municipio,@departamento,@responsabilidades_fiscales,@codigo_identificacion_dian,@digito_verificacion,@codigo_municipio,@codigo_departamento,@codigo_pais,@tipo_persona,@impuesto_id,@impuesto_nombre)
    ON CONFLICT(sede_id,tipo_documento,numero_documento) DO UPDATE SET nombre=excluded.nombre,correo=excluded.correo,
    telefono=excluded.telefono,direccion=excluded.direccion,municipio=excluded.municipio,departamento=excluded.departamento,
    responsabilidades_fiscales=excluded.responsabilidades_fiscales,codigo_identificacion_dian=excluded.codigo_identificacion_dian,
    digito_verificacion=excluded.digito_verificacion,codigo_municipio=excluded.codigo_municipio,codigo_departamento=excluded.codigo_departamento,
    codigo_pais=excluded.codigo_pais,tipo_persona=excluded.tipo_persona,impuesto_id=excluded.impuesto_id,impuesto_nombre=excluded.impuesto_nombre,updated_at=datetime('now')`).run({
    sede_id: sedeId, tipo_documento: tipo, numero_documento: documento, nombre,
    correo: String(datos.correo || '').trim() || null, telefono: String(datos.telefono || '').trim() || null,
    direccion: String(datos.direccion || '').trim() || null, municipio: String(datos.municipio || '').trim() || null,
    departamento: String(datos.departamento || '').trim() || null,
    responsabilidades_fiscales: String(datos.responsabilidades_fiscales || '').trim() || null,
    codigo_identificacion_dian:String(datos.codigo_identificacion_dian||'').trim()||null,digito_verificacion:String(datos.digito_verificacion||'').trim()||null,
    codigo_municipio:String(datos.codigo_municipio||'').trim()||null,codigo_departamento:String(datos.codigo_departamento||'').trim()||null,
    codigo_pais:String(datos.codigo_pais||'CO').trim(),tipo_persona:String(datos.tipo_persona||'').trim()||null,
    impuesto_id:String(datos.impuesto_id||'').trim()||null,impuesto_nombre:String(datos.impuesto_nombre||'').trim()||null
  });
  const cliente=db.prepare('SELECT * FROM clientes_facturacion WHERE sede_id=? AND tipo_documento=? AND numero_documento=?').get(sedeId, tipo, documento);
  registrarAuditoria(usuario, sedeId, AUDIT_ACTIONS.FACTURACION_CLIENTE_GUARDAR, cliente.id, { cliente_id:cliente.id, tipo_documento: tipo });
  return cliente;
}

function obtenerCatalogos(usuario, filtros = {}) {
  validarAcceso(usuario);
  const sedeId = sedeUsuario(usuario, filtros.sedeId);
  const db = getDb();
  return {
    medicamentos: db.prepare(`SELECT m.id,m.codigo,m.nombre,m.presentacion,m.unidad_medida,
      l.id lote_id,l.numero_lote,l.fecha_vencimiento,l.cantidad_total_unidades stock
      FROM medicamentos m JOIN lotes l ON l.medicamento_id=m.id
      WHERE m.estado='ACTIVO' AND l.sede_id=? AND l.cantidad_total_unidades>0
      AND (l.estado_manual IS NULL OR l.estado_manual!='DADO_DE_BAJA') AND l.fecha_vencimiento>=date('now')
      ORDER BY m.nombre,l.fecha_vencimiento`).all(sedeId),
    clientes: db.prepare('SELECT id,nombre,tipo_documento,numero_documento FROM clientes_facturacion WHERE sede_id=? ORDER BY nombre').all(sedeId)
  };
}

function obtenerConfiguracion(usuario, filtros = {}) {
  validarAcceso(usuario, true);
  const sedeId = sedeUsuario(usuario, filtros.sedeId);
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO facturacion_config (sede_id) VALUES (?)').run(sedeId);
  return db.prepare('SELECT * FROM facturacion_config WHERE sede_id=?').get(sedeId);
}

function guardarConfiguracion(usuario, datos) {
  validarAcceso(usuario, true);
  const db = getDb();
  const sedeId = sedeUsuario(usuario, datos?.sedeId);
  const prefijo = String(datos?.prefijo || '').trim().toUpperCase();
  const desde = datos?.rango_desde == null || datos.rango_desde === '' ? null : Number(datos.rango_desde);
  const hasta = datos?.rango_hasta == null || datos.rango_hasta === '' ? null : Number(datos.rango_hasta);
  const actual = db.prepare('SELECT * FROM facturacion_config WHERE sede_id=?').get(sedeId);
  if (!/^[A-Z0-9]{1,4}$/.test(prefijo)) throw new ErrorNegocio('El prefijo debe tener de 1 a 4 letras o números.');
  if ((desde !== null || hasta !== null) && (!Number.isSafeInteger(desde) || !Number.isSafeInteger(hasta) || desde < 1 || hasta < desde)) {
    throw new ErrorNegocio('El rango de numeración no es válido.');
  }
  if (desde > 999999999 || hasta > 999999999) throw new ErrorNegocio('El rango de numeración supera el límite permitido.');
  if (actual?.consecutivo_actual > 0 && (actual.prefijo !== prefijo || actual.rango_desde !== desde || actual.rango_hasta !== hasta)) {
    throw new ErrorNegocio('No cambie prefijo ni rango después de emitir documentos; configure una resolución nueva con el administrador.');
  }
  const ambiente = datos?.ambiente === 'PRODUCCION' ? 'PRODUCCION' : 'HABILITACION';
  const estado = datos?.estado_habilitacion === 'HABILITADO' ? 'EN_HABILITACION' : (datos?.estado_habilitacion === 'EN_HABILITACION' ? 'EN_HABILITACION' : 'NO_CONFIGURADO');
  const fiscales = {};
  for (const campo of ['nit_emisor','dv_emisor','nombre_legal','tipo_identificacion_emisor','direccion_emisor','municipio_emisor','codigo_municipio_emisor','departamento_emisor','codigo_departamento_emisor','responsabilidades_emisor','impuesto_emisor_id','impuesto_emisor_nombre','codigo_medio_pago','numero_autorizacion_dian','nit_proveedor_software','dv_proveedor_software','test_set_id']) {
    const valor = String(datos?.[campo] || '').trim();
    if (valor.length > 254) throw new ErrorNegocio(`El campo fiscal ${campo} supera la longitud permitida.`);
    fiscales[campo] = valor || null;
  }
  db.prepare(`INSERT INTO facturacion_config (sede_id,prefijo,rango_desde,rango_hasta,fecha_resolucion,fecha_vencimiento_resolucion,ambiente,software_id,estado_habilitacion,
      nit_emisor,dv_emisor,nombre_legal,tipo_identificacion_emisor,direccion_emisor,municipio_emisor,codigo_municipio_emisor,departamento_emisor,codigo_departamento_emisor,responsabilidades_emisor,impuesto_emisor_id,impuesto_emisor_nombre,codigo_medio_pago,numero_autorizacion_dian,nit_proveedor_software,dv_proveedor_software,test_set_id)
    VALUES (@sede_id,@prefijo,@desde,@hasta,@fecha_resolucion,@fecha_vencimiento,@ambiente,@software_id,@estado,
      @nit_emisor,@dv_emisor,@nombre_legal,@tipo_identificacion_emisor,@direccion_emisor,@municipio_emisor,@codigo_municipio_emisor,@departamento_emisor,@codigo_departamento_emisor,@responsabilidades_emisor,@impuesto_emisor_id,@impuesto_emisor_nombre,@codigo_medio_pago,@numero_autorizacion_dian,@nit_proveedor_software,@dv_proveedor_software,@test_set_id)
    ON CONFLICT(sede_id) DO UPDATE SET prefijo=excluded.prefijo,rango_desde=excluded.rango_desde,rango_hasta=excluded.rango_hasta,
    fecha_resolucion=excluded.fecha_resolucion,fecha_vencimiento_resolucion=excluded.fecha_vencimiento_resolucion,
    ambiente=excluded.ambiente,software_id=excluded.software_id,estado_habilitacion=excluded.estado_habilitacion,
    nit_emisor=excluded.nit_emisor,dv_emisor=excluded.dv_emisor,nombre_legal=excluded.nombre_legal,tipo_identificacion_emisor=excluded.tipo_identificacion_emisor,
    direccion_emisor=excluded.direccion_emisor,municipio_emisor=excluded.municipio_emisor,codigo_municipio_emisor=excluded.codigo_municipio_emisor,
    departamento_emisor=excluded.departamento_emisor,codigo_departamento_emisor=excluded.codigo_departamento_emisor,responsabilidades_emisor=excluded.responsabilidades_emisor,
    impuesto_emisor_id=excluded.impuesto_emisor_id,impuesto_emisor_nombre=excluded.impuesto_emisor_nombre,codigo_medio_pago=excluded.codigo_medio_pago,
    numero_autorizacion_dian=excluded.numero_autorizacion_dian,nit_proveedor_software=excluded.nit_proveedor_software,dv_proveedor_software=excluded.dv_proveedor_software,test_set_id=excluded.test_set_id`).run({
    sede_id:sedeId,prefijo,desde,hasta,fecha_resolucion:datos.fecha_resolucion||null,
    fecha_vencimiento:datos.fecha_vencimiento_resolucion||null,ambiente,software_id:String(datos.software_id||'').trim()||null,estado,...fiscales
  });
  registrarAuditoria(usuario,sedeId,AUDIT_ACTIONS.FACTURACION_CONFIG_ACTUALIZAR,sedeId,{prefijo,ambiente,estado_habilitacion:estado});
  return db.prepare('SELECT * FROM facturacion_config WHERE sede_id=?').get(sedeId);
}

function calcularLineas(db, sedeId, lineas) {
  if (!Array.isArray(lineas) || !lineas.length || lineas.length > 100) throw new ErrorNegocio('La factura debe incluir entre 1 y 100 medicamentos.');
  return lineas.map((linea) => {
    const lote = db.prepare(`SELECT l.*,m.nombre,m.presentacion FROM lotes l JOIN medicamentos m ON m.id=l.medicamento_id
      WHERE l.id=? AND l.sede_id=? AND m.estado='ACTIVO' AND (l.estado_manual IS NULL OR l.estado_manual!='DADO_DE_BAJA')`).get(Number(linea.lote_id),sedeId);
    if (!lote) throw new ErrorNegocio('Uno de los lotes no está disponible en esta sede.');
    const cantidad=Number(linea.cantidad), precio=Number(linea.precio_unitario), tasa=Number(linea.porcentaje_impuesto||0);
    if (!Number.isSafeInteger(cantidad)||cantidad<1||cantidad>lote.cantidad_total_unidades) throw new ErrorNegocio(`Existencia insuficiente para ${lote.nombre}.`);
    if (!Number.isFinite(precio)||precio<0||precio>1e12||!Number.isFinite(tasa)||tasa<0||tasa>100) throw new ErrorNegocio('Revise el precio y la tarifa de impuesto de cada línea.');
    const base=Number((cantidad*precio).toFixed(2));
    const impuesto=Number((base*tasa/100).toFixed(2));
    const codigoImpuesto=String(linea.codigo_impuesto||'').trim()||null;
    const nombresImpuesto={'01':'IVA','04':'Impuesto Nacional al Consumo','03':'ICA'};
    if(codigoImpuesto&&!nombresImpuesto[codigoImpuesto])throw new ErrorNegocio('Seleccione un código de impuesto soportado.');
    return {lote,medicamento_id:lote.medicamento_id,lote_id:lote.id,descripcion:`${lote.nombre}${lote.presentacion?` - ${lote.presentacion}`:''}`,
      codigo_producto:String(lote.codigo||lote.id),codigo_impuesto:codigoImpuesto,nombre_impuesto:codigoImpuesto?nombresImpuesto[codigoImpuesto]:null,unidad_codigo:'NIU',
      cantidad,precio_unitario:precio,porcentaje_impuesto:tasa,base_imponible:base,valor_impuesto:impuesto,total:Number((base+impuesto).toFixed(2))};
  });
}

function calcularLineasNota(db, facturaReferenciaId, lineas) {
  if (!Array.isArray(lineas) || !lineas.length || lineas.length > 100) throw new ErrorNegocio('La nota debe incluir entre 1 y 100 líneas de la factura original.');
  return lineas.map((linea) => {
    const original = db.prepare(`SELECT d.*,m.nombre,m.presentacion FROM factura_detalles d
      JOIN medicamentos m ON m.id=d.medicamento_id WHERE d.id=? AND d.factura_id=?`)
      .get(Number(linea.detalle_id), facturaReferenciaId);
    if (!original) throw new ErrorNegocio('Las líneas de una nota deben pertenecer a la factura relacionada.');
    const cantidad=Number(linea.cantidad), precio=Number(linea.precio_unitario), tasa=Number(linea.porcentaje_impuesto);
    if (!Number.isSafeInteger(cantidad)||cantidad<1||cantidad>original.cantidad) throw new ErrorNegocio('La cantidad de la nota supera la cantidad de la línea original.');
    if (!Number.isFinite(precio)||precio<0||precio>1e12||!Number.isFinite(tasa)||tasa<0||tasa>100) throw new ErrorNegocio('Revise el precio y la tarifa de impuesto de la nota.');
    const base=Number((cantidad*precio).toFixed(2)), impuesto=Number((base*tasa/100).toFixed(2));
    return {medicamento_id:original.medicamento_id,lote_id:original.lote_id,
      descripcion:original.descripcion,codigo_producto:String(original.codigo_producto||original.medicamento_id),codigo_impuesto:original.codigo_impuesto,nombre_impuesto:original.nombre_impuesto,unidad_codigo:original.unidad_codigo||'NIU',cantidad,precio_unitario:precio,porcentaje_impuesto:tasa,
      base_imponible:base,valor_impuesto:impuesto,total:Number((base+impuesto).toFixed(2))};
  });
}

function crearDocumento(usuario, datos, tipo = 'FACTURA') {
  validarAcceso(usuario);
  const db=getDb(), sedeId=sedeUsuario(usuario,datos?.sedeId);
  const fechaVencimiento=datos?.fecha_vencimiento||null;
  const clienteId=datos?.cliente_id ? Number(datos.cliente_id) : null;
  const formaPago=datos?.forma_pago==='CREDITO'?'CREDITO':'CONTADO';
  const medioPago=String(datos?.medio_pago||'EFECTIVO');
  if(tipo==='FACTURA'&&formaPago==='CREDITO'&&!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaVencimiento||'')))throw new ErrorNegocio('Indique una fecha de vencimiento válida para la venta a crédito.');
  if(tipo==='FACTURA'&&formaPago==='CONTADO'&&!['EFECTIVO','TARJETA','TRANSFERENCIA','OTRO'].includes(medioPago))throw new ErrorNegocio('Seleccione un medio de pago válido.');
  if (clienteId&&!db.prepare('SELECT id FROM clientes_facturacion WHERE id=? AND sede_id=?').get(clienteId,sedeId)) throw new ErrorNegocio('El cliente no pertenece a la sede activa.');
  let referencia=null;
  if (tipo!=='FACTURA') {
    referencia=db.prepare('SELECT * FROM facturas WHERE id=? AND sede_id=? AND tipo_documento=?').get(Number(datos.factura_referencia_id),sedeId,'FACTURA');
    if (!referencia) throw new ErrorNegocio('Seleccione una factura válida de la sede para la nota.');
    if (!String(datos.motivo_nota||'').trim()) throw new ErrorNegocio('Indique el motivo de la nota.');
  }
  const lineas=tipo==='FACTURA'?calcularLineas(db,sedeId,datos.lineas):calcularLineasNota(db,referencia.id,datos.lineas);
  const subtotal=Number(lineas.reduce((s,l)=>s+l.base_imponible,0).toFixed(2));
  const impuestos=Number(lineas.reduce((s,l)=>s+l.valor_impuesto,0).toFixed(2));
  const total=Number((subtotal+impuestos).toFixed(2));
  if(tipo==='NOTA_CREDITO'){
    const anteriores=db.prepare("SELECT COALESCE(SUM(total),0) valor FROM facturas WHERE factura_referencia_id=? AND tipo_documento='NOTA_CREDITO'").get(referencia.id).valor;
    if(total+anteriores>referencia.total+0.001)throw new ErrorNegocio('El valor acumulado de las notas crédito supera la factura relacionada.');
  }
  const tx=db.transaction(()=>{
    db.prepare('INSERT OR IGNORE INTO facturacion_config(sede_id) VALUES (?)').run(sedeId);
    const config=db.prepare('SELECT * FROM facturacion_config WHERE sede_id=?').get(sedeId);
    if (config.rango_desde == null || config.rango_hasta == null) throw new ErrorNegocio('Configure la resolución y el rango autorizado antes de emitir.');
    const siguiente=Math.max(config.consecutivo_actual+1,config.rango_desde);
    if (siguiente>config.rango_hasta) throw new ErrorNegocio('Se agotó el rango de numeración configurado.');
    db.prepare('UPDATE facturacion_config SET consecutivo_actual=? WHERE sede_id=?').run(siguiente,sedeId);
    const numero=`${config.prefijo}${siguiente}`;
    const saldo=tipo==='FACTURA'?total:0;
    const factura=db.prepare(`INSERT INTO facturas (sede_id,cliente_id,numero,fecha,fecha_vencimiento,forma_pago,estado_pago,subtotal,total_impuestos,total,saldo,tipo_documento,factura_referencia_id,motivo_nota,codigo_motivo_nota,created_by)
      VALUES (?,?,?,datetime('now'),?,?,?, ?,?,?,?, ?,?,?,?,?)`).run(sedeId,clienteId,numero,fechaVencimiento,formaPago,
      tipo!=='FACTURA'?'PAGADA':(formaPago==='CREDITO'?'PENDIENTE':'PAGADA'),subtotal,impuestos,total,saldo,tipo,referencia?.id||null,String(datos.motivo_nota||'').trim()||null,String(datos.codigo_motivo_nota||'').trim()||null,usuario.id);
    const id=Number(factura.lastInsertRowid);
    const cola=db.prepare(`INSERT INTO facturacion_cola_dian (factura_id,clave_idempotencia)
      VALUES (?,?)`).run(id,`FACTURA-LOCAL-${id}`);
    db.prepare(`INSERT INTO facturacion_eventos_dian (factura_id,cola_id,tipo,detalle)
      VALUES (?,?,'DOCUMENTO_ENCOLADO','Documento guardado localmente; pendiente de generación electrónica DIAN.')`)
      .run(id,Number(cola.lastInsertRowid));
    if(tipo==='FACTURA'&&formaPago==='CONTADO')db.prepare(`INSERT INTO factura_pagos(factura_id,sede_id,valor,medio,usuario_id)
      VALUES (?,?,?,?,?)`).run(id,sedeId,total,medioPago,usuario.id);
    const insertDetalle=db.prepare(`INSERT INTO factura_detalles (factura_id,medicamento_id,lote_id,descripcion,cantidad,precio_unitario,porcentaje_impuesto,base_imponible,valor_impuesto,total,codigo_impuesto,nombre_impuesto,codigo_producto,unidad_codigo)
      VALUES (@factura_id,@medicamento_id,@lote_id,@descripcion,@cantidad,@precio_unitario,@porcentaje_impuesto,@base_imponible,@valor_impuesto,@total,@codigo_impuesto,@nombre_impuesto,@codigo_producto,@unidad_codigo)`);
    const ajustarLote=db.prepare(`UPDATE lotes SET cantidad_total_unidades=cantidad_total_unidades-?,
      cantidad_cajas=CAST((cantidad_total_unidades-?)/COALESCE((SELECT unidades_por_caja FROM medicamentos WHERE id=medicamento_id),1) AS INTEGER),
      cantidad_unidades_sueltas=(cantidad_total_unidades-?)%COALESCE((SELECT unidades_por_caja FROM medicamentos WHERE id=medicamento_id),1),updated_at=datetime('now') WHERE id=? AND cantidad_total_unidades>=?`);
    const movimiento=db.prepare(`INSERT INTO movimientos_inventario (lote_id,medicamento_id,sede_id,tipo,cantidad,usuario_id,referencia_factura_id)
      VALUES (?,?,?,'SALIDA_FACTURA',?,?,?)`);
    for(const l of lineas){
      insertDetalle.run({factura_id:id,...l});
      if(tipo==='FACTURA'){
        const cambio=ajustarLote.run(l.cantidad,l.cantidad,l.cantidad,l.lote_id,l.cantidad);
        if(cambio.changes!==1) throw new ErrorNegocio(`Existencia insuficiente para ${l.descripcion}.`);
        movimiento.run(l.lote_id,l.medicamento_id,sedeId,-l.cantidad,usuario.id,id);
      }
    }
    if(tipo==='NOTA_CREDITO') db.prepare("UPDATE facturas SET saldo=MAX(0,saldo-?),estado_pago=CASE WHEN saldo-?<=0 THEN 'PAGADA' ELSE 'PARCIAL' END WHERE id=?").run(total,total,referencia.id);
    if(tipo==='NOTA_DEBITO') db.prepare("UPDATE facturas SET saldo=saldo+?,estado_pago=CASE WHEN saldo+?>0 THEN 'PENDIENTE' ELSE estado_pago END WHERE id=?").run(total,total,referencia.id);
    registrarAuditoria(usuario,sedeId,AUDIT_ACTIONS[`FACTURACION_${tipo}_CREAR`],id,{numero,tipo_documento:tipo,total,estado_dian:'LOCAL_PENDIENTE_TRANSMISION'});
    return db.prepare('SELECT * FROM facturas WHERE id=?').get(id);
  });
  return tx();
}

function registrarPago(usuario, facturaId, datos) {
  validarAcceso(usuario);
  const db=getDb();
  const factura=db.prepare('SELECT * FROM facturas WHERE id=?').get(Number(facturaId));
  if(!factura) throw new ErrorNegocio('No se encontró la factura.');
  permisoService.verificarPerteneceASede(usuario,factura.sede_id);
  const valor=Number(datos?.valor), medio=String(datos?.medio||'');
  if(!Number.isFinite(valor)||valor<=0||valor>factura.saldo) throw new ErrorNegocio('El pago debe ser mayor que cero y no superar el saldo pendiente.');
  if(!['EFECTIVO','TARJETA','TRANSFERENCIA','OTRO'].includes(medio)) throw new ErrorNegocio('Seleccione un medio de pago válido.');
  const tx=db.transaction(()=>{
    db.prepare('INSERT INTO factura_pagos(factura_id,sede_id,valor,medio,referencia,usuario_id) VALUES (?,?,?,?,?,?)')
      .run(factura.id,factura.sede_id,valor,medio,String(datos.referencia||'').trim().slice(0,100)||null,usuario.id);
    const saldo=Number((factura.saldo-valor).toFixed(2));
    db.prepare('UPDATE facturas SET saldo=?,estado_pago=? WHERE id=?').run(saldo,saldo===0?'PAGADA':'PARCIAL',factura.id);
    registrarAuditoria(usuario,factura.sede_id,AUDIT_ACTIONS.FACTURACION_PAGO_REGISTRAR,factura.id,{valor,medio,saldo});
    return db.prepare('SELECT * FROM facturas WHERE id=?').get(factura.id);
  });
  return tx();
}

function listar(usuario, filtros={}) {
  validarAcceso(usuario);
  const db=getDb(), sedeId=sedeUsuario(usuario,filtros.sedeId);
  const filas=db.prepare(`SELECT f.*,c.nombre cliente_nombre,c.numero_documento cliente_documento,
    r.numero factura_referencia_numero FROM facturas f LEFT JOIN clientes_facturacion c ON c.id=f.cliente_id
    LEFT JOIN facturas r ON r.id=f.factura_referencia_id WHERE f.sede_id=? ORDER BY f.fecha DESC,f.id DESC LIMIT 500`).all(sedeId);
  return filas.map(f=>({...f,pagos:db.prepare('SELECT * FROM factura_pagos WHERE factura_id=? ORDER BY fecha DESC').all(f.id),
    lineas:db.prepare('SELECT * FROM factura_detalles WHERE factura_id=? ORDER BY id').all(f.id)}));
}

function cartera(usuario, filtros={}) {
  validarAcceso(usuario);
  const sedeId=sedeUsuario(usuario,filtros.sedeId), db=getDb();
  return db.prepare(`SELECT f.id,f.numero,f.fecha,f.fecha_vencimiento,f.total,f.saldo,f.estado_pago,
    c.nombre cliente_nombre,c.numero_documento cliente_documento
    FROM facturas f LEFT JOIN clientes_facturacion c ON c.id=f.cliente_id
    WHERE f.sede_id=? AND f.tipo_documento='FACTURA' AND f.saldo>0 ORDER BY f.fecha_vencimiento,f.fecha`).all(sedeId);
}

function reportes(usuario, filtros={}) {
  validarAcceso(usuario);
  const sedeId=sedeUsuario(usuario,filtros.sedeId), db=getDb();
  const inicio=String(filtros.fechaInicio||new Date().toISOString().slice(0,10));
  const fin=String(filtros.fechaFin||inicio);
  const resumen=db.prepare(`SELECT COUNT(*) documentos,COALESCE(SUM(CASE WHEN tipo_documento='FACTURA' THEN total ELSE 0 END),0) ventas,
    COALESCE(SUM(CASE WHEN tipo_documento='NOTA_CREDITO' THEN total ELSE 0 END),0) notas_credito,
    COALESCE(SUM(CASE WHEN tipo_documento='NOTA_DEBITO' THEN total ELSE 0 END),0) notas_debito,
    COALESCE((SELECT SUM(p.valor) FROM factura_pagos p JOIN facturas pf ON pf.id=p.factura_id
      WHERE pf.sede_id=? AND date(p.fecha) BETWEEN date(?) AND date(?)),0) recaudo,
    COALESCE(SUM(CASE WHEN tipo_documento='FACTURA' THEN saldo ELSE 0 END),0) cartera
    FROM facturas WHERE sede_id=? AND date(fecha) BETWEEN date(?) AND date(?)`).get(sedeId,inicio,fin,sedeId,inicio,fin);
  const impuestos=db.prepare(`SELECT d.porcentaje_impuesto tarifa,ROUND(SUM(d.base_imponible),2) base,ROUND(SUM(d.valor_impuesto),2) impuesto
    FROM factura_detalles d JOIN facturas f ON f.id=d.factura_id WHERE f.sede_id=? AND date(f.fecha) BETWEEN date(?) AND date(?)
    AND f.tipo_documento='FACTURA' GROUP BY d.porcentaje_impuesto ORDER BY d.porcentaje_impuesto`).all(sedeId,inicio,fin);
  return {resumen,impuestos,por_estado_dian:db.prepare('SELECT estado_dian,COUNT(*) cantidad FROM facturas WHERE sede_id=? GROUP BY estado_dian').all(sedeId)};
}

function obtenerColaDian(usuario, filtros={}) {
  validarAcceso(usuario);
  const sedeId=sedeUsuario(usuario,filtros.sedeId), db=getDb();
  return db.prepare(`SELECT q.id cola_id,q.factura_id,q.clave_idempotencia,q.estado estado_cola,q.zip_key,q.xml_file_name,
      q.intentos,q.ultimo_error,q.creado_en,q.actualizado_en,f.numero,f.fecha,f.tipo_documento,
      f.estado_dian,f.total,c.nombre cliente_nombre
    FROM facturacion_cola_dian q JOIN facturas f ON f.id=q.factura_id
    LEFT JOIN clientes_facturacion c ON c.id=f.cliente_id
    WHERE f.sede_id=? ORDER BY q.creado_en DESC LIMIT 500`).all(sedeId);
}

function identificadorSinSeparadores(valor, digitoVerificacion) {
  const identificador = String(valor || '').replace(/[^0-9]/g, '');
  const dv = String(digitoVerificacion || '').replace(/[^0-9]/g, '');
  return dv && identificador.endsWith(dv) ? identificador.slice(0, -dv.length) : identificador;
}

function impuestosParaCodigoUnico(lineas) {
  const grupos = new Map();
  for (const linea of lineas) {
    const codigo = String(linea.codigo_impuesto || '');
    if (!['01', '04', '03'].includes(codigo)) continue;
    grupos.set(codigo, Number(((grupos.get(codigo) || 0) + Number(linea.valor_impuesto || 0)).toFixed(2)));
  }
  return [...grupos.entries()].map(([codigo, valor]) => ({ codigo, valor: valor.toFixed(2) }));
}

async function prepararDocumentoDian(usuario, facturaId, dependencias = {}) {
  validarAcceso(usuario, true);
  const db = getDb();
  const factura = db.prepare('SELECT * FROM facturas WHERE id=?').get(Number(facturaId));
  if (!factura) throw new ErrorNegocio('No se encontró el documento de facturación.');
  permisoService.verificarPerteneceASede(usuario, factura.sede_id);
  const cola = db.prepare('SELECT * FROM facturacion_cola_dian WHERE factura_id=?').get(factura.id);
  if (!cola) throw new ErrorNegocio('El documento no tiene registro en la cola DIAN.');
  if (cola.estado === 'PREPARADO' && factura.xml_firmado) {
    const verificación = await (dependencias.verificarXmlFirmado || verificarXmlFirmado)(factura.xml_firmado);
    return { estado: cola.estado, yaPreparado: true, verificación };
  }
  if (['ENVIADO','VALIDADO','RECHAZADO'].includes(cola.estado)) throw new ErrorNegocio('El documento ya avanzó en la cola y no puede regenerarse.');
  const config = db.prepare('SELECT * FROM facturacion_config WHERE sede_id=?').get(factura.sede_id);
  const emisor = {
    nombre: config?.nombre_legal, numero_documento: config?.nit_emisor, digito_verificacion: config?.dv_emisor,
    tipo_identificacion: config?.tipo_identificacion_emisor, direccion: config?.direccion_emisor,
    municipio: config?.municipio_emisor, codigo_municipio: config?.codigo_municipio_emisor,
    departamento: config?.departamento_emisor, codigo_departamento: config?.codigo_departamento_emisor,
    impuesto_id: config?.impuesto_emisor_id, impuesto_nombre: config?.impuesto_emisor_nombre
  };
  const cliente = factura.cliente_id ? db.prepare('SELECT * FROM clientes_facturacion WHERE id=? AND sede_id=?').get(factura.cliente_id, factura.sede_id) : null;
  if (!cliente) throw new ErrorNegocio('Asigne un cliente con identificación y datos fiscales explícitos antes de preparar XML.');
  const instante = new Date(`${factura.fecha.replace(' ', 'T')}Z`);
  const partesFecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instante);
  const partes = Object.fromEntries(partesFecha.map(p => [p.type, p.value]));
  const issueDate = `${partes.year}-${partes.month}-${partes.day}`;
  const issueTime = `${partes.hour}:${partes.minute}:${partes.second}-05:00`;
  const lineas = db.prepare('SELECT * FROM factura_detalles WHERE factura_id=? ORDER BY id').all(factura.id);
  const referencia = factura.factura_referencia_id ? db.prepare('SELECT * FROM facturas WHERE id=?').get(factura.factura_referencia_id) : null;
  const documento = { ...factura, fecha: issueDate, lineas, cliente, hora_emision: issueTime,
    factura_referencia_numero: referencia?.numero, factura_referencia_cufe: referencia?.cufe,
    factura_referencia_fecha: referencia?.fecha?.slice(0, 10) };
  const credenciales = await (dependencias.cargarCredenciales || cargarCredencialesDian)();
  const esFactura = factura.tipo_documento === 'FACTURA';
  const codigoUnico = calcularCodigoUnico({
    numero: factura.numero, fecha: issueDate, hora: issueTime, valorAntesImpuestos: factura.subtotal,
    impuestos: impuestosParaCodigoUnico(lineas), valorTotal: factura.total,
    nitEmisor: identificadorSinSeparadores(config?.nit_emisor, config?.dv_emisor),
    numeroAdquirente: identificadorSinSeparadores(cliente.numero_documento, cliente.digito_verificacion),
    claveTecnica: credenciales.claveTecnica, softwarePin: credenciales.softwarePin,
    tipoDocumento: factura.tipo_documento, ambiente: config?.ambiente === 'PRODUCCION' ? '1' : '2'
  });
  const datosDian = {
    autorizacion: config?.numero_autorizacion_dian,
    fecha_inicio_autorizacion: config?.fecha_resolucion,
    fecha_fin_autorizacion: config?.fecha_vencimiento_resolucion,
    prefijo: config?.prefijo,
    rango_desde: config?.rango_desde,
    rango_hasta: config?.rango_hasta,
    proveedor_nit: config?.nit_proveedor_software || config?.nit_emisor,
    proveedor_dv: config?.dv_proveedor_software || config?.dv_emisor,
    software_id: config?.software_id,
    software_pin: credenciales.softwarePin,
    numero_documento: factura.numero
  };
  const documentoControlado = { ...documento, ...(esFactura ? { cufe: codigoUnico } : { cude: codigoUnico }) };
  const xmlGenerado = generarXml(documentoControlado, { configuracion: config, emisor, cliente: {
    ...cliente, tipo_identificacion: cliente.codigo_identificacion_dian
  }, codigoUnico, dian: datosDian });
  const validacion = await validarXml(xmlGenerado, factura.tipo_documento);
  const nitProveedor = identificadorSinSeparadores(datosDian.proveedor_nit, datosDian.proveedor_dv);
  const rolFirmante = nitProveedor === identificadorSinSeparadores(config?.nit_emisor, config?.dv_emisor) ? 'supplier' : 'third party';
  const firmado = await (dependencias.firmarXmlDian || firmarXmlDian)(xmlGenerado, credenciales, { rolFirmante });
  const validacionFirmado = await validarXml(firmado.xmlFirmado, factura.tipo_documento);
  const firmaVerificada = await (dependencias.verificarXmlFirmado || verificarXmlFirmado)(firmado.xmlFirmado);
  const huella = createHash('sha256').update(firmado.xmlFirmado, 'utf8').digest('hex');
  const tx = db.transaction(() => {
    const actual = db.prepare('SELECT estado FROM facturacion_cola_dian WHERE id=?').get(cola.id);
    if (!['PENDIENTE_PREPARACION','ERROR_TRANSMISION','PREPARADO'].includes(actual.estado)) throw new ErrorNegocio('El estado de la cola cambió; vuelva a consultar el documento.');
    db.prepare(`UPDATE facturas SET xml_generado=?,xml_firmado=?,hora_emision=?,${esFactura ? 'cufe' : 'cude'}=? WHERE id=?`)
      .run(xmlGenerado, firmado.xmlFirmado, issueTime, codigoUnico, factura.id);
    db.prepare("UPDATE facturacion_cola_dian SET estado='PREPARADO',ultimo_error=NULL,proximo_intento=NULL,actualizado_en=datetime('now') WHERE id=?").run(cola.id);
    db.prepare(`INSERT INTO facturacion_eventos_dian(factura_id,cola_id,tipo,detalle,huella_sha256)
      VALUES (?,?,'DOCUMENTO_PREPARADO',?,?)`).run(factura.id, cola.id, `XML ${validacionFirmado.esquema} firmado XAdES-EPES y verificado localmente; no representa transmisión ni validación DIAN.`, huella);
    registrarAuditoria(usuario, factura.sede_id, AUDIT_ACTIONS.FACTURACION_DOCUMENTO_PREPARAR, factura.id,
      { estado_cola: 'PREPARADO', sha256_xml_firmado: huella, firma_verificada: true, certificado_vigente: firmado.certificado.vigente });
  });
  tx();
  return { estado: 'PREPARADO', huella_sha256: huella, validacion, validacionFirmado,
    firma: firmaVerificada, certificado: firmado.certificado, codigoUnico: { tipo: esFactura ? 'CUFE' : 'CUDE', valor: codigoUnico } };
}

function manejarErrorDian(error) { return error?.message || 'Error de transmisión registrado.'; }

module.exports={listarClientes,guardarCliente,obtenerCatalogos,obtenerConfiguracion,guardarConfiguracion,
  crearFactura:(u,d)=>crearDocumento(u,d,'FACTURA'),crearNotaCredito:(u,d)=>crearDocumento(u,d,'NOTA_CREDITO'),
  crearNotaDebito:(u,d)=>crearDocumento(u,d,'NOTA_DEBITO'),registrarPago,listar,cartera,reportes,obtenerColaDian,prepararDocumentoDian,manejarErrorDian,ErrorNegocio};
