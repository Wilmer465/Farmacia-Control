// Estas respuestas SOAP son fixtures sintéticos exclusivamente para pruebas automatizadas.
// No se usan en producción y no representan aceptación de DIAN.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { crearZipXml, respuestaSendTestSet, respuestaGetStatusZip, prepararSolicitudSetHabilitacion } = require('../../backend/services/dianSoapService');
const { firmarMensajeSoap } = require('../../backend/services/dianSigningService');
const { crearMaterialTemporal } = require('../helpers/dianTestCertificates');

const SOAP = 'http://www.w3.org/2003/05/soap-envelope';
const WCF = 'http://wcf.dian.colombia';

function sobre(respuesta) {
  return `<s:Envelope xmlns:s="${SOAP}" xmlns:w="${WCF}"><s:Body>${respuesta}</s:Body></s:Envelope>`;
}

test('el ZIP de habilitación contiene un XML intacto y con nombre seguro', () => {
  const zip = crearZipXml('FV-123.xml', '<Invoice>á</Invoice>');
  assert.equal(zip.readUInt32LE(0), 0x04034B50);
  const nombreLength = zip.readUInt16LE(26);
  const compressedLength = zip.readUInt32LE(18);
  const nombre = zip.subarray(30, 30 + nombreLength).toString('utf8');
  const contenido = zlib.inflateRawSync(zip.subarray(30 + nombreLength, 30 + nombreLength + compressedLength)).toString('utf8');
  assert.equal(nombre, 'FV-123.xml');
  assert.equal(contenido, '<Invoice>á</Invoice>');
});

test('prepara SendTestSetAsync con el XML firmado, TestSetId y WS-Security', async () => {
  const material = crearMaterialTemporal();
  try {
    const solicitud = await prepararSolicitudSetHabilitacion({
      xmlFirmado: '<Invoice><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"/></Invoice>',
      numero: 'FV-0007', testSetId: '12345678-1234-1234-1234-123456789012', credenciales: material.credenciales
    });
    assert.match(solicitud.soapRequest, /SendTestSetAsync/);
    assert.match(solicitud.soapRequest, /<ds:Signature/);
    assert.match(solicitud.soapRequest, /Reference URI="#DIAN-SOAP-Body"/);
    assert.match(solicitud.soapRequest, /Reference URI="#DIAN-SOAP-Timestamp"/);
    assert.match(solicitud.soapRequest, /BinarySecurityToken/);
    assert.equal(solicitud.endpoint, 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc');
    assert.equal(solicitud.nombreXml, 'FV-0007.xml');
    assert.match(solicitud.huellaZip, /^[a-f0-9]{64}$/);
  } finally {
    require('node:fs').rmSync(material.directorio, { recursive: true, force: true });
  }
});

test('procesa ZipKey y errores desde un sobre SOAP DIAN sintético de prueba', () => {
  const recibido = respuestaSendTestSet(sobre('<w:SendTestSetAsyncResponse><w:SendTestSetAsyncResult><w:ZipKey>12345678-1234-1234-1234-123456789012</w:ZipKey><w:ErrorMessageList><w:ProcessedMessage>Recibido</w:ProcessedMessage></w:ErrorMessageList></w:SendTestSetAsyncResult></w:SendTestSetAsyncResponse>'));
  assert.equal(recibido.zipKey, '12345678-1234-1234-1234-123456789012');
  assert.deepEqual(recibido.errores, ['Recibido']);
  const fault = respuestaSendTestSet(sobre('<s:Fault><s:Code><s:Value>Sender</s:Value></s:Code><s:Reason><s:Text>Test fixture fault</s:Text></s:Reason></s:Fault>'));
  assert.equal(fault.zipKey, '');
  assert.equal(fault.fault.razon, 'Test fixture fault');
});

test('procesa resultados GetStatusZip sintéticos sin confundirlos con prueba remota', () => {
  const respuesta = respuestaGetStatusZip(sobre('<w:GetStatusZipResponse><w:GetStatusZipResult><w:DianResponse><w:XmlFileName>FV-7.xml</w:XmlFileName><w:XmlDocumentKey>abcdef</w:XmlDocumentKey><w:IsValid>true</w:IsValid><w:StatusCode>00</w:StatusCode><w:StatusDescription>Fixture de prueba</w:StatusDescription><w:StatusMessage>Respuesta sintética</w:StatusMessage><w:XmlBase64Bytes>PHgveD4=</w:XmlBase64Bytes></w:DianResponse></w:GetStatusZipResult></w:GetStatusZipResponse>'));
  assert.equal(respuesta.resultados[0].esValido, 'true');
  assert.equal(respuesta.resultados[0].codigo, '00');
  assert.equal(respuesta.resultados[0].applicationResponseBase64, 'PHgveD4=');
  assert.throws(() => respuestaGetStatusZip('<html>respuesta no SOAP</html>'), /SOAP 1.2/);
});

test('firma el sobre SOAP de prueba y rechaza TestSetId con formato inválido', async () => {
  const material = crearMaterialTemporal();
  try {
    const xml = '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"><s:Header><wsse:Security><wsu:Timestamp><wsu:Created>2026-10-23T00:00:00.000Z</wsu:Created><wsu:Expires>2026-10-23T00:05:00.000Z</wsu:Expires></wsu:Timestamp></wsse:Security></s:Header><s:Body><test>fixture</test></s:Body></s:Envelope>';
    const firmado = await firmarMensajeSoap(xml, material.credenciales);
    assert.match(firmado.xmlFirmado, /<ds:Signature/);
    assert.match(firmado.xmlFirmado, /SecurityTokenReference/);
    await assert.rejects(() => prepararSolicitudSetHabilitacion({ xmlFirmado: '<Invoice/>', numero: 'FV-1', testSetId: 'invalido', credenciales: material.credenciales }), /TestSetId/);
  } finally {
    require('node:fs').rmSync(material.directorio, { recursive: true, force: true });
  }
});
