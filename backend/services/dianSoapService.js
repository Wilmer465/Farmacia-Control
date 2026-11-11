const crypto = require('node:crypto');
const https = require('node:https');
const { DOMParser } = require('@xmldom/xmldom');
const { firmarMensajeSoap } = require('./dianSigningService');
const { URL } = require('node:url');

const SOAP_NS = 'http://www.w3.org/2003/05/soap-envelope';
const WCF_NS = 'http://wcf.dian.colombia';
const WSA_NS = 'http://www.w3.org/2005/08/addressing';
const WSSE_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const WSU_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const ACTION_BASE = 'http://wcf.dian.colombia/IWcfDianCustomerServices/';
const ENDPOINT_HABILITACION = 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc';
const MAX_RESPUESTA_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_BYTES = 50 * 1024 * 1024;

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function escaparXml(valor) {
  return String(valor).replace(/[<>&"']/g, caracter => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[caracter]);
}

function tablaCrc32() {
  return Array.from({ length: 256 }, (_, valor) => {
    let crc = valor;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    return crc >>> 0;
  });
}

const CRC32_TABLA = tablaCrc32();

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = CRC32_TABLA[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function campoZip(valor, bytes = 4) {
  const salida = Buffer.alloc(bytes);
  if (bytes === 2) salida.writeUInt16LE(valor, 0);
  else salida.writeUInt32LE(valor >>> 0, 0);
  return salida;
}

function crearZipXml(nombre, xml) {
  const nombreBytes = Buffer.from(nombre, 'utf8');
  const contenido = Buffer.from(xml, 'utf8');
  exigir(nombreBytes.length <= 240 && contenido.length > 0 && contenido.length <= MAX_ZIP_BYTES, 'El XML o nombre del archivo excede los límites permitidos para el ZIP DIAN.');
  const crc = crc32(contenido);
  const comprimido = require('node:zlib').deflateRawSync(contenido, { level: 6 });
  const local = Buffer.concat([
    campoZip(0x04034B50), campoZip(20, 2), campoZip(0x0800, 2), campoZip(8, 2),
    campoZip(0, 2), campoZip(0, 2), campoZip(crc), campoZip(comprimido.length), campoZip(contenido.length),
    campoZip(nombreBytes.length, 2), campoZip(0, 2), nombreBytes, comprimido
  ]);
  const central = Buffer.concat([
    campoZip(0x02014B50), campoZip(20, 2), campoZip(20, 2), campoZip(0x0800, 2), campoZip(8, 2),
    campoZip(0, 2), campoZip(0, 2), campoZip(crc), campoZip(comprimido.length), campoZip(contenido.length),
    campoZip(nombreBytes.length, 2), campoZip(0, 2), campoZip(0, 2), campoZip(0, 2), campoZip(0, 2),
    campoZip(0, 4), campoZip(0, 4), nombreBytes
  ]);
  const centralOffset = local.length;
  const fin = Buffer.concat([
    campoZip(0x06054B50), campoZip(0, 2), campoZip(0, 2), campoZip(1, 2), campoZip(1, 2),
    campoZip(central.length, 4), campoZip(centralOffset, 4), campoZip(0, 2)
  ]);
  const zip = Buffer.concat([local, central, fin]);
  exigir(zip.length <= MAX_ZIP_BYTES, 'El ZIP DIAN excede el tamaño máximo de 50 MB.');
  return zip;
}

function crearSobreSoap(endpoint, accion, cuerpo) {
  const ahora = new Date();
  const creado = ahora.toISOString();
  const expira = new Date(ahora.getTime() + 5 * 60 * 1000).toISOString();
  const marcado = escaparXml(accion);
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="${SOAP_NS}" xmlns:wcf="${WCF_NS}" xmlns:wsa="${WSA_NS}" xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}"><soap:Header><wsa:Action soap:mustUnderstand="1">${marcado}</wsa:Action><wsa:To soap:mustUnderstand="1">${escaparXml(endpoint)}</wsa:To><wsse:Security soap:mustUnderstand="1"><wsu:Timestamp><wsu:Created>${creado}</wsu:Created><wsu:Expires>${expira}</wsu:Expires></wsu:Timestamp></wsse:Security></soap:Header><soap:Body>${cuerpo}</soap:Body></soap:Envelope>`;
}

function parsearXml(xml) {
  let errorParseo = '';
  const documento = new DOMParser({ onError: (nivel, mensaje) => { if (nivel !== 'warning') errorParseo += mensaje; } }).parseFromString(xml, 'application/xml');
  exigir(documento?.documentElement && !errorParseo, 'La respuesta SOAP no contiene XML bien formado.');
  exigir(documento.documentElement.namespaceURI === SOAP_NS, 'La respuesta no usa el sobre SOAP 1.2 esperado por DIAN.');
  return documento;
}

function obtenerTexto(nodo, nombre, namespace = '*') {
  const elemento = nodo?.getElementsByTagNameNS(namespace, nombre)?.[0];
  return elemento && !['true'].includes(elemento.getAttribute('i:nil')) ? String(elemento.textContent || '').trim() : '';
}

function errorSoap(documento) {
  const fallo = documento.getElementsByTagNameNS(SOAP_NS, 'Fault')[0];
  if (!fallo) return null;
  return { codigo: obtenerTexto(fallo, 'Value'), razon: obtenerTexto(fallo, 'Text'), detalle: obtenerTexto(fallo, 'Detail') };
}

function respuestaSendTestSet(xml) {
  const documento = parsearXml(xml);
  const fault = errorSoap(documento);
  if (fault) return { fault, zipKey: '', errores: [fault.razon, fault.detalle].filter(Boolean) };
  const resultado = documento.getElementsByTagNameNS(WCF_NS, 'SendTestSetAsyncResult')[0];
  exigir(resultado, 'La respuesta SOAP DIAN no contiene SendTestSetAsyncResult.');
  const errores = Array.from(resultado.getElementsByTagNameNS('*', 'ProcessedMessage')).map(nodo => nodo.textContent.trim()).filter(Boolean);
  const zipKey = obtenerTexto(resultado, 'ZipKey');
  return { zipKey, errores };
}

function respuestaGetStatusZip(xml) {
  const documento = parsearXml(xml);
  const fault = errorSoap(documento);
  if (fault) return { fault, resultados: [] };
  const resultado = documento.getElementsByTagNameNS(WCF_NS, 'GetStatusZipResult')[0];
  exigir(resultado, 'La respuesta SOAP DIAN no contiene GetStatusZipResult.');
  const elementos = Array.from(resultado.getElementsByTagNameNS('*', 'DianResponse'));
  return { resultados: elementos.map(elemento => ({
    nombre: obtenerTexto(elemento, 'XmlFileName'),
    claveDocumento: obtenerTexto(elemento, 'XmlDocumentKey'),
    esValido: obtenerTexto(elemento, 'IsValid'),
    codigo: obtenerTexto(elemento, 'StatusCode'),
    descripcion: obtenerTexto(elemento, 'StatusDescription'),
    mensaje: obtenerTexto(elemento, 'StatusMessage'),
    errores: Array.from(elemento.getElementsByTagNameNS('*', 'string')).map(nodo => nodo.textContent.trim()).filter(Boolean),
    applicationResponseBase64: obtenerTexto(elemento, 'XmlBase64Bytes')
  })) };
}

function postSoap(endpoint, xml, pfx, password, action, dependencias = {}) {
  const agente = dependencias.agenteHttps || https;
  return new Promise((resolve, reject) => {
    const destino = new URL(endpoint);
    exigir(destino.protocol === 'https:' && destino.hostname === 'vpfe-hab.dian.gov.co', 'La transmisión de esta versión solo admite el endpoint oficial DIAN de habilitación.');
    const solicitud = agente.request(destino, {
      method: 'POST',
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      pfx,
      passphrase: password,
      headers: {
        'content-type': `application/soap+xml; charset=utf-8; action="${action}"`,
        'content-length': Buffer.byteLength(xml, 'utf8'),
        accept: 'application/soap+xml'
      },
      timeout: 45000
    }, respuesta => {
      const trozos = [];
      let bytes = 0;
      respuesta.on('data', trozo => {
        bytes += trozo.length;
        if (bytes > MAX_RESPUESTA_BYTES) {
          solicitud.destroy(new Error('La respuesta SOAP excede 10 MB.'));
          return;
        }
        trozos.push(trozo);
      });
      respuesta.on('end', () => resolve({ statusCode: respuesta.statusCode || 0, body: Buffer.concat(trozos).toString('utf8') }));
    });
    solicitud.on('timeout', () => solicitud.destroy(new Error('Tiempo de espera agotado: el resultado remoto es desconocido; no reenvíe el documento.')));
    solicitud.on('error', reject);
    solicitud.end(xml, 'utf8');
  });
}

async function prepararSolicitudSetHabilitacion({ xmlFirmado, numero, testSetId, credenciales, nitEmisor }, dependencias = {}) {
  exigir(typeof xmlFirmado === 'string' && xmlFirmado.length > 0, 'No hay XML firmado guardado para transmitir.');
  exigir(typeof testSetId === 'string' && /^[A-Fa-f0-9-]{36}$/.test(testSetId), 'Configure el TestSetId de habilitación asignado por DIAN.');
  const nombreXml = `${String(numero).replace(/[^A-Za-z0-9_-]/g, '_')}.xml`;
  const nombreZip = `${String(numero).replace(/[^A-Za-z0-9_-]/g, '_')}.zip`;
  const zip = crearZipXml(nombreXml, xmlFirmado);
  const cuerpo = `<wcf:SendTestSetAsync><wcf:fileName>${escaparXml(nombreZip)}</wcf:fileName><wcf:contentFile>${zip.toString('base64')}</wcf:contentFile><wcf:testSetId>${escaparXml(testSetId)}</wcf:testSetId></wcf:SendTestSetAsync>`;
  const endpoint = ENDPOINT_HABILITACION;
  const accion = `${ACTION_BASE}SendTestSetAsync`;
  const sobre = crearSobreSoap(endpoint, accion, cuerpo);
  const firma = await (dependencias.firmarMensajeSoap || firmarMensajeSoap)(sobre, credenciales, { nitEmisor });
  return { soapRequest: firma.xmlFirmado, endpoint, accion, nombreXml, nombreZip,
    huellaZip: crypto.createHash('sha256').update(zip).digest('hex') };
}

async function prepararConsultaZipHabilitacion({ zipKey, credenciales, nitEmisor }, dependencias = {}) {
  exigir(typeof zipKey === 'string' && /^[A-Fa-f0-9-]{36}$/.test(zipKey), 'El ZipKey no tiene un formato UUID válido.');
  const cuerpo = `<wcf:GetStatusZip><wcf:trackId>${escaparXml(zipKey)}</wcf:trackId></wcf:GetStatusZip>`;
  const endpoint = ENDPOINT_HABILITACION;
  const accion = `${ACTION_BASE}GetStatusZip`;
  const sobre = crearSobreSoap(endpoint, accion, cuerpo);
  const firma = await (dependencias.firmarMensajeSoap || firmarMensajeSoap)(sobre, credenciales, { nitEmisor });
  return { soapRequest: firma.xmlFirmado, endpoint, accion };
}

async function ejecutarSolicitudSoap({ soapRequest, endpoint, accion, credenciales }, dependencias = {}) {
  return (dependencias.postSoap || postSoap)(endpoint, soapRequest,
    require('node:fs').readFileSync(credenciales.certificadoPath), credenciales.certificadoPassword,
    accion, dependencias);
}

async function enviarSetHabilitacion({ xmlFirmado, numero, testSetId, credenciales, nitEmisor }, dependencias = {}) {
  const solicitud = await prepararSolicitudSetHabilitacion({ xmlFirmado, numero, testSetId, credenciales, nitEmisor }, dependencias);
  const resultado = await ejecutarSolicitudSoap({ ...solicitud, credenciales }, dependencias);
  exigir(resultado.statusCode >= 200 && resultado.statusCode < 300, `DIAN respondió HTTP ${resultado.statusCode}. El resultado puede ser incierto y no se reintentará automáticamente.`);
  return { ...respuestaSendTestSet(resultado.body), httpStatus: resultado.statusCode, soapRequest: solicitud.soapRequest,
    soapResponse: resultado.body, nombreXml: solicitud.nombreXml, nombreZip: solicitud.nombreZip, huellaZip: solicitud.huellaZip };
}

async function consultarZipHabilitacion({ zipKey, credenciales, nitEmisor }, dependencias = {}) {
  exigir(typeof zipKey === 'string' && /^[A-Fa-f0-9-]{36}$/.test(zipKey), 'El ZipKey no tiene un formato UUID válido.');
  const cuerpo = `<wcf:GetStatusZip><wcf:trackId>${escaparXml(zipKey)}</wcf:trackId></wcf:GetStatusZip>`;
  const accion = `${ACTION_BASE}GetStatusZip`;
  const sobre = crearSobreSoap(ENDPOINT_HABILITACION, accion, cuerpo);
  const firmado = await (dependencias.firmarMensajeSoap || firmarMensajeSoap)(sobre, credenciales, { nitEmisor });
  const resultado = await ejecutarSolicitudSoap({ soapRequest: firmado.xmlFirmado, endpoint: ENDPOINT_HABILITACION, accion, credenciales }, dependencias);
  exigir(resultado.statusCode >= 200 && resultado.statusCode < 300, `DIAN respondió HTTP ${resultado.statusCode} al consultar el ZIP.`);
  return { ...respuestaGetStatusZip(resultado.body), httpStatus: resultado.statusCode, soapRequest: firmado.xmlFirmado, soapResponse: resultado.body };
}

module.exports = {
  ENDPOINT_HABILITACION, ACTION_BASE, crearZipXml, crearSobreSoap, parsearXml,
  respuestaSendTestSet, respuestaGetStatusZip, prepararSolicitudSetHabilitacion,
  prepararConsultaZipHabilitacion, ejecutarSolicitudSoap, enviarSetHabilitacion, consultarZipHabilitacion
};
