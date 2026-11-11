const test=require('node:test');
const assert=require('node:assert/strict');
const {createTestDb,teardownTestDb}=require('../helpers/testDb');
const facturacion=require('../../backend/services/facturacionService');
const { crearMaterialTemporal }=require('../helpers/dianTestCertificates');
const { firmarXmlDian,verificarXmlFirmado }=require('../../backend/services/dianSigningService');

let db,admin,otroAdmin,medicamentoId,loteId,materialFirma;
test.beforeEach(()=>{
  db=createTestDb();
  const adminRow=db.prepare("SELECT u.*,r.nombre rol_nombre FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE r.nombre='SUPERADMIN' ORDER BY u.id LIMIT 1").get();
  admin={...adminRow,id:adminRow.id,rol_nombre:'SUPERADMIN'};
  const sede=db.prepare('SELECT id FROM sedes ORDER BY id LIMIT 1').get();
  db.prepare('INSERT INTO medicamentos(codigo,nombre,presentacion,unidad_medida,unidades_por_caja) VALUES (?,?,?,?,?)').run('FAC-001','Acetaminofén','Tableta 500 mg','TABLETA',10);
  medicamentoId=Number(db.prepare('SELECT last_insert_rowid() id').get().id);
  db.prepare(`INSERT INTO lotes(medicamento_id,sede_id,numero_lote,fecha_expedicion,fecha_vencimiento,cantidad_cajas,cantidad_unidades_sueltas,cantidad_total_unidades)
    VALUES (?,?,?,'2026-01-01','2027-01-01',10,0,100)`).run(medicamentoId,sede.id,'L-FAC-01');
  loteId=Number(db.prepare('SELECT last_insert_rowid() id').get().id);
  db.prepare("INSERT INTO movimientos_inventario(lote_id,medicamento_id,sede_id,tipo,cantidad) VALUES (?,?,?,'ENTRADA',100)").run(loteId,medicamentoId,sede.id);
  const otro=db.prepare("INSERT INTO sedes(nombre,ciudad) VALUES ('Sede prueba dos','Cali')").run();
  otroAdmin={...admin,sede_id:Number(otro.lastInsertRowid),rol_nombre:'ADMIN'};
  db.prepare("INSERT INTO usuarios(nombre,username,password_hash,rol_id,sede_id) VALUES ('Admin 2','admin2','hash',(SELECT id FROM roles WHERE nombre='ADMIN'),?)").run(otro.lastInsertRowid);
  const row=db.prepare("SELECT id FROM usuarios WHERE username='admin2'").get();otroAdmin.id=row.id;
  const config=facturacion.guardarConfiguracion(admin,{sedeId:sede.id,prefijo:'FV',rango_desde:1,rango_hasta:500,fecha_resolucion:'2026-01-01',ambiente:'HABILITACION'});
  assert.equal(config.estado_habilitacion,'NO_CONFIGURADO');
});
test.afterEach(()=>{teardownTestDb();if(materialFirma)require('node:fs').rmSync(materialFirma.directorio,{recursive:true,force:true});materialFirma=null;});

test('emite factura local pendiente, conserva trazabilidad, inventario y pagos de cartera',()=>{
  const cliente=facturacion.guardarCliente(admin,{sedeId:1,tipo_documento:'CC',numero_documento:'12345',nombre:'Cliente de prueba'});
  const factura=facturacion.crearFactura(admin,{sedeId:1,cliente_id:cliente.id,forma_pago:'CREDITO',fecha_vencimiento:'2026-11-30',lineas:[{lote_id:loteId,cantidad:3,precio_unitario:1250,porcentaje_impuesto:19}]});
  assert.equal(factura.numero,'FV1');
  assert.equal(factura.estado_dian,'LOCAL_PENDIENTE_TRANSMISION');
  const cola=facturacion.obtenerColaDian(admin,{sedeId:1});
  assert.equal(cola.length,1);assert.equal(cola[0].estado_cola,'PENDIENTE_PREPARACION');assert.equal(cola[0].intentos,0);
  assert.equal(factura.total,4462.5);
  assert.equal(db.prepare('SELECT cantidad_total_unidades FROM lotes WHERE id=?').get(loteId).cantidad_total_unidades,97);
  const movimiento=db.prepare('SELECT tipo,cantidad,referencia_factura_id FROM movimientos_inventario WHERE referencia_factura_id=?').get(factura.id);
  assert.deepEqual(movimiento,{tipo:'SALIDA_FACTURA',cantidad:-3,referencia_factura_id:factura.id});
  const pago=facturacion.registrarPago(admin,factura.id,{valor:1000,medio:'TRANSFERENCIA',referencia:'TRX-01'});
  assert.equal(pago.saldo,3462.5);assert.equal(pago.estado_pago,'PARCIAL');
  const informe=facturacion.reportes(admin,{sedeId:1,fechaInicio:'2026-01-01',fechaFin:'2027-01-01'});
  assert.equal(informe.resumen.ventas,4462.5);
  assert.equal(facturacion.cartera(admin,{sedeId:1})[0].saldo,3462.5);
});

test('rechaza inventario insuficiente, pagos superiores al saldo y acceso a facturas de otra sede',()=>{
  assert.throws(()=>facturacion.crearFactura(admin,{sedeId:1,lineas:[{lote_id:loteId,cantidad:101,precio_unitario:100,porcentaje_impuesto:0}]}),/Existencia insuficiente/);
  const factura=facturacion.crearFactura(admin,{sedeId:1,lineas:[{lote_id:loteId,cantidad:1,precio_unitario:100,porcentaje_impuesto:0}]});
  assert.throws(()=>facturacion.registrarPago(admin,factura.id,{valor:1000,medio:'EFECTIVO'}),/no superar el saldo/);
  assert.throws(()=>facturacion.registrarPago(otroAdmin,factura.id,{valor:10,medio:'EFECTIVO'}),/No tiene acceso a esta sede/);
  assert.equal(facturacion.listarClientes(otroAdmin).length,0);
});

test('registra el pago de contado junto con la factura y lo suma al recaudo',()=>{
  const factura=facturacion.crearFactura(admin,{sedeId:1,forma_pago:'CONTADO',medio_pago:'TARJETA',lineas:[{lote_id:loteId,cantidad:2,precio_unitario:500,porcentaje_impuesto:0}]});
  assert.equal(factura.estado_pago,'PAGADA');
  assert.deepEqual(db.prepare('SELECT valor,medio FROM factura_pagos WHERE factura_id=?').get(factura.id),{valor:1000,medio:'TARJETA'});
  assert.equal(facturacion.reportes(admin,{sedeId:1,fechaInicio:'2026-01-01',fechaFin:'2027-01-01'}).resumen.recaudo,1000);
  assert.throws(()=>facturacion.crearFactura(admin,{sedeId:1,forma_pago:'CREDITO',lineas:[{lote_id:loteId,cantidad:1,precio_unitario:100,porcentaje_impuesto:0}]}),/vencimiento válida/);
});

test('prepara UBL firmado y verificado, conserva CUFE y no altera estado DIAN real',async()=>{
  materialFirma=crearMaterialTemporal();
  const sede=db.prepare('SELECT id FROM sedes ORDER BY id LIMIT 1').get();
  facturacion.guardarConfiguracion(admin,{sedeId:sede.id,prefijo:'FV',rango_desde:1,rango_hasta:500,ambiente:'HABILITACION',
    fecha_resolucion:'2026-01-01',fecha_vencimiento_resolucion:'2026-12-31',numero_autorizacion_dian:'18760000000001',
    nit_proveedor_software:'900123456',dv_proveedor_software:'7',software_id:'software-prueba',
    nit_emisor:'900123456',dv_emisor:'7',nombre_legal:'Farmacia Prueba',tipo_identificacion_emisor:'31',direccion_emisor:'Calle 1',
    municipio_emisor:'Bogotá',codigo_municipio_emisor:'11001',departamento_emisor:'Bogotá D.C.',codigo_departamento_emisor:'11',
    impuesto_emisor_id:'01',impuesto_emisor_nombre:'IVA',codigo_medio_pago:'10'});
  const cliente=facturacion.guardarCliente(admin,{sedeId:sede.id,tipo_documento:'CC',numero_documento:'12345',nombre:'Cliente prueba',
    codigo_identificacion_dian:'13',direccion:'Calle 2',municipio:'Bogotá',codigo_municipio:'11001',departamento:'Bogotá D.C.',codigo_departamento:'11',impuesto_id:'01',impuesto_nombre:'IVA'});
  const factura=facturacion.crearFactura(admin,{sedeId:sede.id,cliente_id:cliente.id,lineas:[{lote_id:loteId,cantidad:1,precio_unitario:100,porcentaje_impuesto:19,codigo_impuesto:'01'}]});
  const credenciales={...materialFirma.credenciales,claveTecnica:'clave-tecnica-prueba',softwarePin:'pin-software-prueba'};
  const resultado=await facturacion.prepararDocumentoDian(admin,factura.id,{cargarCredenciales:async()=>credenciales,firmarXmlDian,verificarXmlFirmado});
  assert.equal(resultado.estado,'PREPARADO');
  assert.match(resultado.huella_sha256,/^[a-f0-9]{64}$/);
  assert.equal(resultado.firma.firmaValida,true);
  assert.equal(resultado.codigoUnico.tipo,'CUFE');
  assert.equal(db.prepare('SELECT estado FROM facturacion_cola_dian WHERE factura_id=?').get(factura.id).estado,'PREPARADO');
  const persistida=db.prepare('SELECT estado_dian,xml_firmado,cufe FROM facturas WHERE id=?').get(factura.id);
  assert.equal(persistida.estado_dian,'LOCAL_PENDIENTE_TRANSMISION');
  assert.ok(persistida.xml_firmado);
  assert.equal(persistida.cufe,resultado.codigoUnico.valor);
  assert.match(db.prepare('SELECT xml_generado FROM facturas WHERE id=?').get(factura.id).xml_generado,/UBL 2\.1/);
  assert.equal((await facturacion.prepararDocumentoDian(admin,factura.id,{verificarXmlFirmado})).yaPreparado,true);
});

test('las notas afectan saldo sin devolver inventario automáticamente y conservan estado local',()=>{
  const factura=facturacion.crearFactura(admin,{sedeId:1,lineas:[{lote_id:loteId,cantidad:4,precio_unitario:100,porcentaje_impuesto:0}]});
  const detalle=db.prepare('SELECT id FROM factura_detalles WHERE factura_id=?').get(factura.id);
  const nota=facturacion.crearNotaCredito(admin,{sedeId:1,factura_referencia_id:factura.id,motivo_nota:'Ajuste acordado',lineas:[{detalle_id:detalle.id,lote_id:loteId,cantidad:1,precio_unitario:100,porcentaje_impuesto:0}]});
  assert.equal(nota.tipo_documento,'NOTA_CREDITO');
  assert.equal(nota.estado_dian,'LOCAL_PENDIENTE_TRANSMISION');
  assert.equal(db.prepare('SELECT cantidad_total_unidades FROM lotes WHERE id=?').get(loteId).cantidad_total_unidades,96);
  assert.equal(db.prepare('SELECT saldo FROM facturas WHERE id=?').get(factura.id).saldo,300);
});
