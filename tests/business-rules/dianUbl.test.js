const test = require('node:test');
const assert = require('node:assert/strict');
const { generarXml, validarXml } = require('../../backend/services/dianUblService');

const fiscalParty = (nombre, documento) => ({
  nombre, numero_documento: documento, tipo_identificacion: '31', direccion: 'Calle 1 # 2-3',
  municipio: 'Bogotá', codigo_municipio: '11001', departamento: 'Bogotá D.C.', codigo_departamento: '11',
  codigo_pais: 'CO', impuesto_id: '01', impuesto_nombre: 'IVA'
});
function fixture(tipo_documento) {
  return {
    tipo_documento, numero: 'FV1001', fecha: '2026-10-23', moneda: 'COP', subtotal: 100,
    total_impuestos: 19, total: 119, codigo_medio_pago: '10', forma_pago: 'CONTADO',
    factura_referencia_numero: 'FV1000', factura_referencia_cufe: 'a'.repeat(96),
    factura_referencia_fecha: '2026-10-22', codigo_motivo_nota: '2', motivo_nota: 'Devolución',
    lineas: [{ codigo_impuesto: '01', nombre_impuesto: 'IVA', porcentaje_impuesto: 19, cantidad: 1,
      precio_unitario: 100, base_imponible: 100, valor_impuesto: 19, descripcion: 'Medicamento <prueba> & seguro', codigo_producto: 'MED-1' }]
  };
}
const options = { configuracion: { ambiente: 'HABILITACION' }, emisor: fiscalParty('Farmacia', '900123456'), cliente: fiscalParty('Cliente', '123456') };

for (const tipo of ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO']) {
  test(`genera XML ${tipo} bien formado y válido contra XSD UBL 2.1`, async () => {
    const xml = generarXml(fixture(tipo), options);
    assert.match(xml, /&lt;prueba&gt; &amp; seguro/);
    assert.deepEqual(await validarXml(xml, tipo), { valido: true, esquema: `OASIS UBL 2.1 ${tipo === 'FACTURA' ? 'UBL-Invoice-2.1.xsd' : tipo === 'NOTA_CREDITO' ? 'UBL-CreditNote-2.1.xsd' : 'UBL-DebitNote-2.1.xsd'}` });
  });
}

test('no genera XML si faltan códigos fiscales explícitos', () => {
  const documento = fixture('FACTURA');
  delete documento.lineas[0].codigo_impuesto;
  assert.throws(() => generarXml(documento, options), /código DIAN del impuesto/);
});

test('incluye el UUID CUFE/CUDE y el detalle tributario por línea', () => {
  const documento = fixture('FACTURA');
  documento.cufe = 'a'.repeat(96);
  const xml = generarXml(documento, options);
  assert.match(xml, /<cbc:UUID schemeName="CUFE-SHA384" schemeID="2">a{96}<\/cbc:UUID>/);
  assert.match(xml, /<cac:InvoiceLine>[\s\S]*?<cac:TaxTotal>[\s\S]*?<cac:TaxSubtotal>/);
  assert.match(xml, /<cac:TaxScheme><cbc:ID>01<\/cbc:ID><cbc:Name>IVA<\/cbc:Name>/);
});

test('genera extensiones fiscales DIAN con resolución, proveedor, código y QR', async () => {
  const documento = fixture('FACTURA');
  documento.cufe = 'b'.repeat(96);
  const dian = { autorizacion: '18760000000001', fecha_inicio_autorizacion: '2026-01-01', fecha_fin_autorizacion: '2026-12-31',
    prefijo: 'FV', rango_desde: 1, rango_hasta: 500, proveedor_nit: '900123456', proveedor_dv: '7',
    software_id: 'software-habilitado', software_pin: '12345', numero_documento: 'FV1001' };
  const xml = generarXml(documento, { ...options, dian });
  assert.match(xml, /<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><sts:DianExtensions>/);
  assert.match(xml, /<sts:InvoiceAuthorization>18760000000001<\/sts:InvoiceAuthorization>/);
  assert.match(xml, /<sts:InvoiceSource><cbc:IdentificationCode[^>]*>CO<\/cbc:IdentificationCode>/);
  const { calcularCodigoSeguridadSoftware } = require('../../backend/services/dianControlCodes');
  assert.match(xml, new RegExp(`<sts:SoftwareSecurityCode[^>]*>${calcularCodigoSeguridadSoftware({ softwareId: 'software-habilitado', pin: '12345', numero: 'FV1001' })}</sts:SoftwareSecurityCode>`));
  assert.match(xml, /searchqr\?documentkey=b{96}/);
  assert.deepEqual(await validarXml(xml, 'FACTURA'), { valido: true, esquema: 'OASIS UBL 2.1 UBL-Invoice-2.1.xsd' });
});

test('no crea extensión DIAN con datos de resolución incompletos o sin CUFE/CUDE', () => {
  const documento = fixture('FACTURA');
  assert.throws(() => generarXml(documento, { ...options, dian: {} }), /número de autorización/);
  assert.throws(() => generarXml(documento, { ...options, dian: { autorizacion: '18760000000001' } }), /inicio de autorización/);
});

test('rechaza totales de documento que no suman las bases e impuestos de línea', () => {
  const documento = fixture('FACTURA');
  documento.total = 118;
  assert.throws(() => generarXml(documento, options), /total del documento no coincide/);
  documento.total = 119;
  documento.lineas[0].valor_impuesto = 18;
  assert.throws(() => generarXml(documento, options), /impuesto de línea no coincide/);
});

test('rechaza código de impuesto no soportado o nombre fiscal inconsistente', () => {
  const documento = fixture('FACTURA');
  documento.lineas[0].codigo_impuesto = 'ZZ';
  assert.throws(() => generarXml(documento, options), /no está soportado/);
  documento.lineas[0].codigo_impuesto = '01';
  documento.lineas[0].nombre_impuesto = 'INC';
  assert.throws(() => generarXml(documento, options), /no coincide con su código/);
});

test('rechaza XML que no cumple el esquema base', async () => {
  await assert.rejects(validarXml('<Invoice/>', 'FACTURA'));
});
