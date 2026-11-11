const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { generarXml, validarXml } = require('../../backend/services/dianUblService');
const { firmarXmlDian, verificarXmlFirmado } = require('../../backend/services/dianSigningService');
const { crearMaterialTemporal } = require('../helpers/dianTestCertificates');

function documentoXml(tipo = 'FACTURA') {
  const partido = (nombre, numero) => ({ nombre, numero_documento: numero, tipo_identificacion: '31', direccion: 'Calle 1',
    municipio: 'Bogotá', codigo_municipio: '11001', departamento: 'Bogotá D.C.', codigo_departamento: '11',
    codigo_pais: 'CO', impuesto_id: '01', impuesto_nombre: 'IVA' });
  const esFactura = tipo === 'FACTURA';
  const numero = tipo === 'NOTA_CREDITO' ? 'NC9001' : tipo === 'NOTA_DEBITO' ? 'ND9001' : 'FV9001';
  const documento = { tipo_documento: tipo, numero, fecha: '2026-10-23', hora_emision: '10:00:00-05:00',
    moneda: 'COP', subtotal: 100, total_impuestos: 19, total: 119, forma_pago: 'CONTADO', codigo_medio_pago: '10',
    ...(esFactura ? { cufe: 'a'.repeat(96) } : { cude: 'b'.repeat(96), motivo_nota: 'Ajuste de prueba',
      factura_referencia_numero: 'FV9000', factura_referencia_cufe: 'a'.repeat(96), factura_referencia_fecha: '2026-10-22' }),
    lineas: [{ codigo_impuesto: '01', nombre_impuesto: 'IVA', porcentaje_impuesto: 19,
      cantidad: 1, precio_unitario: 100, base_imponible: 100, valor_impuesto: 19, descripcion: 'Producto', codigo_producto: 'MED-1' }] };
  const dian = { autorizacion: '18760000000001', fecha_inicio_autorizacion: '2026-01-01', fecha_fin_autorizacion: '2026-12-31',
    prefijo: 'FV', rango_desde: 1, rango_hasta: 999, proveedor_nit: '900123456', proveedor_dv: '7',
    software_id: 'software-test', software_pin: 'pin-test', numero_documento: numero };
  return generarXml(documento, { configuracion: { ambiente: 'HABILITACION' }, emisor: partido('Farmacia', '900123456'),
    cliente: partido('Cliente', '123456'), codigoUnico: esFactura ? documento.cufe : documento.cude, dian });
}

test('firma UBL con XAdES-EPES, valida cadena configurada y verifica referencias criptográficas', async t => {
  const material = crearMaterialTemporal();
  t.after(() => fs.rmSync(material.directorio, { recursive: true, force: true }));
  const xml = documentoXml();
  const resultado = await firmarXmlDian(xml, material.credenciales);
  assert.equal(resultado.verificación.firmaValida, true);
  assert.equal(resultado.verificación.perfil, 'XAdES-EPES');
  assert.equal(resultado.certificado.cadenaConfiable, true);
  assert.deepEqual(await validarXml(resultado.xmlFirmado, 'FACTURA'), { valido: true, esquema: 'OASIS UBL 2.1 UBL-Invoice-2.1.xsd' });
  assert.match(resultado.xmlFirmado, /<ext:UBLExtension><ext:ExtensionContent>[\s\S]*?<ds:Signature/);
  assert.match(resultado.xmlFirmado, /<xades:SignaturePolicyIdentifier>/);
  assert.equal((await verificarXmlFirmado(resultado.xmlFirmado)).firmaValida, true);
});

test('firma y verifica notas crédito y débito con su estructura UBL correspondiente', async t => {
  const material = crearMaterialTemporal();
  t.after(() => fs.rmSync(material.directorio, { recursive: true, force: true }));
  for (const tipo of ['NOTA_CREDITO', 'NOTA_DEBITO']) {
    const xml = documentoXml(tipo);
    const resultado = await firmarXmlDian(xml, material.credenciales);
    assert.equal(resultado.verificación.firmaValida, true);
    assert.deepEqual(await validarXml(resultado.xmlFirmado, tipo), {
      valido: true,
      esquema: `OASIS UBL 2.1 ${tipo === 'NOTA_CREDITO' ? 'UBL-CreditNote-2.1.xsd' : 'UBL-DebitNote-2.1.xsd'}`
    });
  }
});

test('rechaza contraseña P12 errónea, certificado expirado y cambios posteriores a la firma', async t => {
  const material = crearMaterialTemporal();
  const expirado = crearMaterialTemporal({ certificadoExpirado: true });
  t.after(() => {
    fs.rmSync(material.directorio, { recursive: true, force: true });
    fs.rmSync(expirado.directorio, { recursive: true, force: true });
  });
  const xml = documentoXml();
  await assert.rejects(firmarXmlDian(xml, { ...material.credenciales, certificadoPassword: 'incorrecta' }), /no se pudo abrir el certificado/i);
  await assert.rejects(firmarXmlDian(xml, expirado.credenciales), /fuera de su periodo de vigencia/i);
  const resultado = await firmarXmlDian(xml, material.credenciales);
  const alterado = resultado.xmlFirmado.replace('Producto', 'Producto alterado');
  await assert.rejects(verificarXmlFirmado(alterado), /no son válidas/i);
});
