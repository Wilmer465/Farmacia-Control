const fs = require('node:fs');
const crypto = require('node:crypto');
const forge = require('node-forge');
const xadesjs = require('xadesjs');
const xmldom = require('@xmldom/xmldom');
const xpath = require('xpath');
const XmlDSigJs = require('xmldsigjs');
const pki = require('pkijs');
const asn1js = require('asn1js');
const dns = require('node:dns').promises;
const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');

const NS = {
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xades: 'http://uri.etsi.org/01903/v1.3.2#',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
};
const POLICY_URL = 'https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf';
const POLICY_DIGEST_SHA256 = 'dMoMvtcG5aIzgYo0tIsSQeVJBDnUnfSOfBpxXrmor0Y=';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

const dependenciasXmlNode = {
  XMLSerializer: xmldom.XMLSerializer,
  DOMParser: xmldom.DOMParser,
  DOMImplementation: xmldom.DOMImplementation,
  xpath
};
xadesjs.setNodeDependencies(dependenciasXmlNode);
xadesjs.Application.setEngine('NodeJS', crypto.webcrypto);

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function derBase64(value) {
  return Buffer.from(forge.asn1.toDer(value).getBytes(), 'binary').toString('base64');
}

function leerCertificadosPem(contenido) {
  const bloques = String(contenido).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  return bloques.map(forge.pki.certificateFromPem);
}

function nombreDer(name) {
  return forge.asn1.toDer(forge.pki.distinguishedNameToAsn1(name)).getBytes();
}

function huellaCertificado(certificado) {
  const der = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(certificado)).getBytes(), 'binary');
  return crypto.createHash('sha256').update(der).digest('hex');
}

function extraerMaterialPkcs12(buffer, password) {
  let paquete;
  try {
    const asn1 = forge.asn1.fromDer(buffer.toString('binary'));
    paquete = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch {
    throw new Error('No se pudo abrir el certificado PKCS#12. Verifique el archivo y su contraseña.');
  }
  const bolsasClave = [
    ...((paquete.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]) || []),
    ...((paquete.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]) || [])
  ];
  const certificados = (paquete.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [])
    .map(bolsa => bolsa.cert).filter(Boolean);
  exigir(bolsasClave.length === 1, 'El PKCS#12 debe contener exactamente una clave privada.');
  exigir(certificados.length > 0, 'El PKCS#12 no contiene certificados X.509.');
  const clave = bolsasClave[0].key;
  exigir(clave?.n && clave?.e, 'Solo se admiten certificados con clave RSA para la firma DIAN.');
  const certificadoFirmante = certificados.find(cert => cert.publicKey.n?.compareTo(clave.n) === 0 && cert.publicKey.e?.compareTo(clave.e) === 0);
  exigir(certificadoFirmante, 'La clave privada del PKCS#12 no corresponde a ninguno de sus certificados.');
  return { clave, certificadoFirmante, certificados };
}

function validarCertificadoYCadena(material, trustedCaBundlePath, fecha = new Date(), incluirCadena = false) {
  const { certificadoFirmante, certificados } = material;
  exigir(fs.existsSync(trustedCaBundlePath), 'Configure un paquete externo de autoridades raíz confiables para validar la cadena del certificado.');
  const raices = leerCertificadosPem(fs.readFileSync(trustedCaBundlePath, 'utf8'));
  exigir(raices.length > 0, 'El paquete de confianza no contiene certificados raíz PEM.');
  const inicio = certificadoFirmante.validity.notBefore;
  const fin = certificadoFirmante.validity.notAfter;
  exigir(fecha >= inicio && fecha <= fin, 'El certificado de firma está fuera de su periodo de vigencia.');
  const uso = certificadoFirmante.extensions.find(extension => extension.name === 'keyUsage');
  exigir(uso?.digitalSignature && uso?.nonRepudiation, 'El certificado no habilita los usos de firma digital y no repudio requeridos.');
  exigir(certificadoFirmante.publicKey.n.bitLength() >= 2048, 'La clave RSA del certificado es inferior a 2048 bits.');

  const caStore = forge.pki.createCaStore(raices);
  const cadena = [certificadoFirmante];
  let actual = certificadoFirmante;
  const fingerprints = new Set([huellaCertificado(actual)]);
  for (let paso = 0; paso < 10; paso += 1) {
    const raizConfiable = raices.find(cert => nombreDer(cert.subject) === nombreDer(actual.issuer));
    if (raizConfiable) {
      cadena.push(raizConfiable);
      break;
    }
    const emisor = certificados.find(cert => nombreDer(cert.subject) === nombreDer(actual.issuer));
    exigir(emisor, 'Falta un certificado intermedio de la cadena PKCS#12.');
    const fingerprint = huellaCertificado(emisor);
    exigir(!fingerprints.has(fingerprint), 'La cadena del certificado contiene un ciclo.');
    fingerprints.add(fingerprint);
    cadena.push(emisor);
    actual = emisor;
    if (nombreDer(actual.subject) === nombreDer(actual.issuer)) break;
  }
  exigir(cadena.length <= 10, 'La cadena de certificados excede la profundidad admitida.');
  try {
    forge.pki.verifyCertificateChain(caStore, cadena);
  } catch {
    throw new Error('No se pudo validar la cadena del certificado contra las autoridades raíz confiables configuradas.');
  }
  const resultado = { vigente: true, cadenaConfiable: true, revocacion: 'NO_COMPROBADA' };
  return incluirCadena ? { ...resultado, _cadenaCertificados: cadena } : resultado;
}

function derCertificado(certificado) {
  return Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(certificado)).getBytes(), 'binary');
}

function aBufferExacto(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function certificadoPkijs(certificado) {
  return pki.Certificate.fromBER(aBufferExacto(derCertificado(certificado)));
}

function urlsCrl(certificadoPkijsLocal) {
  const extension = certificadoPkijsLocal.extensions?.find(item => item.extnID === pki.id_CRLDistributionPoints);
  if (!extension) return [];
  const parsed = extension.parsedValue || new pki.CRLDistributionPoints({
    schema: asn1js.fromBER(extension.extnValue.valueBlock.valueHex).result
  });
  return (parsed.distributionPoints || []).flatMap(punto => Array.isArray(punto.distributionPoint) ? punto.distributionPoint : [])
    .filter(nombre => nombre.type === 6 && typeof nombre.value === 'string')
    .map(nombre => nombre.value);
}

function ipPublica(address) {
  const octetos = address.split('.').map(Number);
  if (octetos.length !== 4 || octetos.some(numero => !Number.isInteger(numero) || numero < 0 || numero > 255)) return false;
  const [a, b] = octetos;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)));
}

async function descargarCrl(urlCrL) {
  const destino = new URL(urlCrL);
  exigir(['https:', 'http:'].includes(destino.protocol) && !destino.username && !destino.password, 'El punto de distribución CRL usa un URL no permitido.');
  const direcciones = await dns.lookup(destino.hostname, { all: true, verbatim: true });
  exigir(direcciones.length > 0 && direcciones.every(direccion => direccion.family === 4 && ipPublica(direccion.address)), 'El CRL apunta a un host no público; se bloqueó por seguridad.');
  const direccionElegida = direcciones[0];
  const agente = destino.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const solicitud = agente.get(destino, {
      timeout: 12000,
      maxHeaderSize: 16 * 1024,
      ...(destino.protocol === 'https:' ? { rejectUnauthorized: true, minVersion: 'TLSv1.2' } : {}),
      lookup: (_host, _opciones, callback) => callback(null, direccionElegida.address, direccionElegida.family)
    }, respuesta => {
      if (respuesta.statusCode !== 200) {
        respuesta.resume();
        reject(new Error(`El servidor CRL respondió HTTP ${respuesta.statusCode}.`));
        return;
      }
      const bloques = [];
      let bytes = 0;
      respuesta.on('data', bloque => {
        bytes += bloque.length;
        if (bytes > 10 * 1024 * 1024) solicitud.destroy(new Error('El CRL excede 10 MB.'));
        else bloques.push(bloque);
      });
      respuesta.on('end', () => resolve(Buffer.concat(bloques)));
    });
    solicitud.on('timeout', () => solicitud.destroy(new Error('Se agotó el tiempo de espera al consultar el CRL.')));
    solicitud.on('error', reject);
  });
}

function bytesCrl(datos) {
  const texto = datos.toString('utf8');
  const bloquePem = texto.match(/-----BEGIN X509 CRL-----([\s\S]+?)-----END X509 CRL-----/) ||
    texto.match(/-----BEGIN CRL-----([\s\S]+?)-----END CRL-----/);
  if (!bloquePem) return datos;
  return Buffer.from(bloquePem[1].replace(/\s/g, ''), 'base64');
}

async function verificarCrlDeCertificado(certificado, emisor, fecha, descargar = descargarCrl) {
  const certificadoObj = certificadoPkijs(certificado);
  const emisorObj = certificadoPkijs(emisor);
  const puntos = urlsCrl(certificadoObj);
  exigir(puntos.length > 0, `El certificado de ${certificado.subject.attributes.map(item => item.value).join(', ')} no publica distribución CRL; no se transmitirá sin comprobar revocación.`);
  let errores = [];
  for (const url of puntos) {
    try {
      const crl = pki.CertificateRevocationList.fromBER(aBufferExacto(bytesCrl(await descargar(url))));
      exigir(crl.issuer.isEqual(emisorObj.subject), 'El CRL no corresponde a la autoridad emisora del certificado.');
      exigir(crl.thisUpdate.value <= fecha && crl.nextUpdate?.value && crl.nextUpdate.value >= fecha, 'El CRL está vencido o no es válido para la fecha actual.');
      exigir(await crl.verify({ issuerCertificate: emisorObj }), 'La firma del CRL no es válida con el certificado emisor.');
      exigir(!crl.isCertificateRevoked(certificadoObj), 'El certificado digital está revocado según el CRL firmado por su emisor.');
      return { comprobado: true, origen: new URL(url).hostname, nextUpdate: crl.nextUpdate.value.toISOString() };
    } catch (error) {
      errores.push(error?.message || 'CRL no válido.');
      if (/está revocado/.test(error?.message || '')) throw error;
    }
  }
  throw new Error(`No fue posible verificar revocación con un CRL vigente y firmado. ${errores.slice(0, 2).join(' ')}`);
}

async function validarRevocacionCertificado(credenciales, opciones = {}) {
  for (const campo of ['certificadoPath', 'certificadoPassword', 'paqueteRaicesPath']) {
    exigir(typeof credenciales?.[campo] === 'string' && credenciales[campo], `Falta configurar ${campo} para comprobar revocación.`);
  }
  const material = extraerMaterialPkcs12(fs.readFileSync(credenciales.certificadoPath), credenciales.certificadoPassword);
  const fecha = opciones.fecha || new Date();
  const estado = validarCertificadoYCadena(material, credenciales.paqueteRaicesPath, fecha, true);
  const cadena = estado._cadenaCertificados;
  const resultados = [];
  for (let indice = 0; indice < cadena.length - 1; indice += 1) {
    resultados.push(await verificarCrlDeCertificado(cadena[indice], cadena[indice + 1], fecha, opciones.descargarCrl));
  }
  exigir(resultados.length > 0, 'No hay certificados emisores en la cadena para validar revocación.');
  return { vigente: estado.vigente, cadenaConfiable: estado.cadenaConfiable, revocacion: 'COMPROBADA_NO_REVOCADO', certificadosComprobados: resultados.length, crl: resultados };
}

function prepararExtensionDeFirma(xml) {
  const documento = xadesjs.Parse(xml);
  const root = documento.documentElement;
  const extensiones = root.getElementsByTagNameNS(NS.ext, 'UBLExtensions')[0];
  exigir(extensiones, 'El XML no contiene ext:UBLExtensions.');
  const dianExtension = Array.from(extensiones.childNodes).find(node => node.nodeType === 1 && node.localName === 'UBLExtension');
  exigir(dianExtension, 'Falta la extensión UBL de datos DIAN.');
  const extensionFirma = documento.createElementNS(NS.ext, 'ext:UBLExtension');
  const contenido = documento.createElementNS(NS.ext, 'ext:ExtensionContent');
  extensionFirma.appendChild(contenido);
  extensiones.insertBefore(extensionFirma, dianExtension.nextSibling);
  return { documento, contenido };
}

class DianSignedXml extends xadesjs.SignedXml {
  ApplyTransforms(transforms, input) {
    const incluyeEnveloped = Array.from(transforms.GetIterator()).some(transform => transform.Algorithm === ENVELOPED);
    if (!incluyeEnveloped) return super.ApplyTransforms(transforms, input);
    const copia = input.cloneNode(true);
    const firmas = copia.getElementsByTagNameNS(NS.ds, 'Signature');
    for (let indice = firmas.length - 1; indice >= 0; indice -= 1) firmas[indice].parentNode.removeChild(firmas[indice]);
    const restantes = new XmlDSigJs.Transforms();
    for (const transform of transforms.GetIterator()) {
      if (transform.Algorithm !== ENVELOPED) restantes.Add(transform);
    }
    return super.ApplyTransforms(restantes, copia);
  }

  async ApplySignOptions(signature, algorithm, key, options) {
    await super.ApplySignOptions(signature, algorithm, key, options);
    signature.SignedInfo.CanonicalizationMethod.Algorithm = C14N;
    signature.KeyInfo.Id = `${signature.Id}-keyinfo`;
    const reference = new XmlDSigJs.Reference();
    reference.Uri = `#${signature.KeyInfo.Id}`;
    reference.DigestMethod.Algorithm = SHA256;
    signature.SignedInfo.References.Add(reference);
  }
}

async function verificarXmlFirmado(xml) {
  const documento = xadesjs.Parse(xml);
  const firmas = documento.getElementsByTagNameNS(NS.ds, 'Signature');
  exigir(firmas.length === 1, 'El XML debe contener exactamente una firma XMLDSig.');
  const firma = new DianSignedXml(documento);
  firma.LoadXml(firmas[0]);
  const references = Array.from(firma.XmlSignature.SignedInfo.References.GetIterator());
  exigir(references.length === 3, 'La firma debe proteger el documento, KeyInfo y SignedProperties.');
  exigir(references.some(reference => reference.Type === 'http://uri.etsi.org/01903#SignedProperties'), 'Falta la referencia XAdES a SignedProperties.');
  exigir(references.some(reference => reference.Uri === `#${firma.XmlSignature.KeyInfo.Id}`), 'Falta la referencia firmada a KeyInfo.');
  let cryptographic = false;
  try { cryptographic = await firma.Verify(); } catch {
    throw new Error('La comprobación criptográfica o las referencias XMLDSig no son válidas.');
  }
  exigir(cryptographic, 'La comprobación criptográfica o las referencias XMLDSig no son válidas.');
  const política = documento.getElementsByTagNameNS(NS.xades, 'SignaturePolicyIdentifier');
  exigir(política.length === 1, 'La firma no contiene política XAdES-EPES.');
  const policyIds = documento.getElementsByTagNameNS(NS.xades, 'Identifier');
  exigir(Array.from(policyIds).some(node => node.textContent === POLICY_URL), 'La firma no referencia la política DIAN vigente.');
  return { firmaValida: true, referenciasVerificadas: references.length, perfil: 'XAdES-EPES', política: POLICY_URL };
}

async function firmarXmlDian(xml, credenciales, opciones = {}) {
  const campos = ['certificadoPath', 'certificadoPassword', 'paqueteRaicesPath'];
  for (const campo of campos) exigir(typeof credenciales?.[campo] === 'string' && credenciales[campo], `Falta configurar ${campo} en la bóveda DIAN.`);
  exigir(fs.existsSync(credenciales.certificadoPath), 'No se encontró el certificado PKCS#12 configurado.');
  const material = extraerMaterialPkcs12(fs.readFileSync(credenciales.certificadoPath), credenciales.certificadoPassword);
  const estadoCertificado = validarCertificadoYCadena(material, credenciales.paqueteRaicesPath, opciones.fechaFirma || new Date());
  const clavePkcs8 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(material.clave));
  const bytesClave = Buffer.from(forge.asn1.toDer(clavePkcs8).getBytes(), 'binary');
  const cryptoKey = await crypto.webcrypto.subtle.importKey('pkcs8', bytesClave, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const { documento, contenido } = prepararExtensionDeFirma(xml);
  const firma = new DianSignedXml();
  const certificadosBase64 = material.certificados.map(cert => derBase64(forge.pki.certificateToAsn1(cert)));
  const firmanteBase64 = derBase64(forge.pki.certificateToAsn1(material.certificadoFirmante));
  await firma.Sign({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, cryptoKey, documento, {
    id: `dian-${crypto.randomUUID()}`,
    x509: certificadosBase64,
    signingCertificate: firmanteBase64,
    signingTime: { value: opciones.fechaFirma || new Date() },
    signerRole: { claimed: [opciones.rolFirmante || 'supplier'] },
    policy: {
      hash: 'SHA-256',
      digestValue: POLICY_DIGEST_SHA256,
      identifier: { value: POLICY_URL, description: 'Política de firma para facturas electrónicas de la República de Colombia.' }
    },
    references: [{ uri: '', hash: 'SHA-256', transforms: ['enveloped', 'c14n'] }]
  });
  const signatureElement = firma.GetXml();
  exigir(signatureElement, 'La biblioteca XAdES no produjo el elemento de firma.');
  contenido.appendChild(signatureElement);
  const xmlFirmado = new xmldom.XMLSerializer().serializeToString(documento);
  const verificación = await verificarXmlFirmado(xmlFirmado);
  return { xmlFirmado, verificación, certificado: estadoCertificado };
}

async function firmarMensajeSoap(xml, credenciales, opciones = {}) {
  exigir(typeof credenciales?.certificadoPath === 'string' && typeof credenciales?.certificadoPassword === 'string', 'Falta el certificado de autenticación SOAP DIAN.');
  const material = extraerMaterialPkcs12(fs.readFileSync(credenciales.certificadoPath), credenciales.certificadoPassword);
  const estado = validarCertificadoYCadena(material, credenciales.paqueteRaicesPath, opciones.fechaFirma || new Date());
  if (opciones.nitEmisor) {
    const digitosNit = String(opciones.nitEmisor).replace(/\D/g, '');
    const sujeto = material.certificadoFirmante.subject.attributes.map(item => String(item.value)).join(' ');
    exigir(digitosNit.length >= 5 && sujeto.replace(/\D/g, '').includes(digitosNit), 'El certificado de autenticación no corresponde al NIT configurado para el emisor.');
  }
  const { SignedXml } = require('xml-crypto');
  const espacioWsse = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
  const espacioWsu = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
  const { DOMParser, XMLSerializer } = xmldom;
  const documento = new DOMParser({ onError: (nivel, mensaje) => { if (nivel !== 'warning') throw new Error(mensaje); } }).parseFromString(xml, 'application/xml');
  const body = documento.getElementsByTagNameNS('http://www.w3.org/2003/05/soap-envelope', 'Body')[0];
  const seguridad = documento.getElementsByTagNameNS(espacioWsse, 'Security')[0];
  const timestamp = documento.getElementsByTagNameNS(espacioWsu, 'Timestamp')[0];
  exigir(body && seguridad && timestamp, 'El mensaje SOAP no contiene Body, Security y Timestamp.');
  body.setAttribute('Id', 'DIAN-SOAP-Body');
  body.setAttributeNS(espacioWsu, 'wsu:Id', 'DIAN-SOAP-Body');
  timestamp.setAttribute('Id', 'DIAN-SOAP-Timestamp');
  timestamp.setAttributeNS(espacioWsu, 'wsu:Id', 'DIAN-SOAP-Timestamp');
  const firmador = new SignedXml({
    privateKey: forge.pki.privateKeyToPem(material.clave),
    publicCert: forge.pki.certificateToPem(material.certificadoFirmante),
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#'
  });
  const algoritmoDigest = 'http://www.w3.org/2001/04/xmlenc#sha256';
  const c14nExclusiva = 'http://www.w3.org/2001/10/xml-exc-c14n#';
  firmador.addReference({ xpath: "//*[local-name(.)='Body' and namespace-uri(.)='http://www.w3.org/2003/05/soap-envelope']", transforms: [c14nExclusiva], digestAlgorithm: algoritmoDigest, uri: '#DIAN-SOAP-Body' });
  firmador.addReference({ xpath: "//*[local-name(.)='Timestamp' and namespace-uri(.)='" + espacioWsu + "']", transforms: [c14nExclusiva], digestAlgorithm: algoritmoDigest, uri: '#DIAN-SOAP-Timestamp' });
  firmador.computeSignature(new XMLSerializer().serializeToString(documento), {
    prefix: 'ds',
    location: { reference: "//*[local-name(.)='Security' and namespace-uri(.)='" + espacioWsse + "']", action: 'append' }
  });
  let xmlFirmado = firmador.getSignedXml();
  const certificadoDer = derBase64(forge.pki.certificateToAsn1(material.certificadoFirmante));
  const llaveInfo = xmlFirmado.match(/<ds:KeyInfo[^>]*>[\s\S]*?<\/ds:KeyInfo>/);
  if (llaveInfo) {
    const reemplazo = `<ds:KeyInfo><wsse:SecurityTokenReference><wsse:Reference URI="#DIAN-X509-Certificate" ValueType="http://docs.oasis-open.org/wss/2004/04/oasis-200401-wss-x509-token-profile-1.0#X509v3"/></wsse:SecurityTokenReference></ds:KeyInfo>`;
    xmlFirmado = xmlFirmado.replace(llaveInfo[0], reemplazo);
  }
  const documentoFirmado = new DOMParser({ onError: (nivel, mensaje) => { if (nivel !== 'warning') throw new Error(mensaje); } }).parseFromString(xmlFirmado, 'application/xml');
  const securityFirmado = documentoFirmado.getElementsByTagNameNS(espacioWsse, 'Security')[0];
  const token = documentoFirmado.createElementNS(espacioWsse, 'wsse:BinarySecurityToken');
  token.setAttributeNS(espacioWsu, 'wsu:Id', 'DIAN-X509-Certificate');
  token.setAttribute('ValueType', 'http://docs.oasis-open.org/wss/2004/04/oasis-200401-wss-x509-token-profile-1.0#X509v3');
  token.setAttribute('EncodingType', 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary');
  token.textContent = certificadoDer;
  securityFirmado.insertBefore(token, securityFirmado.firstChild);
  xmlFirmado = new XMLSerializer().serializeToString(documentoFirmado);
  const verificador = new SignedXml({ publicCert: forge.pki.certificateToPem(material.certificadoFirmante) });
  const firma = documentoFirmado.getElementsByTagNameNS(NS.ds, 'Signature')[0];
  verificador.loadSignature(firma);
  exigir(verificador.checkSignature(xmlFirmado), 'No se pudo verificar la firma del mensaje SOAP antes del envío.');
  return { xmlFirmado, certificado: estado, huellaCertificado: huellaCertificado(material.certificadoFirmante) };
}

module.exports = { firmarXmlDian, firmarMensajeSoap, verificarXmlFirmado, extraerMaterialPkcs12, validarCertificadoYCadena, validarRevocacionCertificado, POLICY_URL, POLICY_DIGEST_SHA256 };
