const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const forge = require('node-forge');

function crearCertificado({ nombre, issuer, issuerKey, serial, ca, notBefore, notAfter }) {
  const claves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = claves.publicKey;
  cert.serialNumber = serial;
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;
  cert.setSubject([{ name: 'commonName', value: nombre }]);
  cert.setIssuer(issuer ? issuer.subject.attributes : cert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', critical: true, cA: ca },
    { name: 'keyUsage', critical: true, digitalSignature: !ca, nonRepudiation: !ca, keyCertSign: ca, cRLSign: ca },
    { name: 'subjectKeyIdentifier' }
  ]);
  cert.sign(issuerKey || claves.privateKey, forge.md.sha256.create());
  return { cert, claves };
}

function crearMaterialTemporal({ certificadoExpirado = false, nitEmisor = '900123456' } = {}) {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-dian-sign-'));
  const ahora = new Date();
  const root = crearCertificado({ nombre: 'CA test local', serial: '1001', ca: true,
    notBefore: new Date(ahora.getTime() - 86400000), notAfter: new Date(ahora.getTime() + 86400000 * 365), issuerKey: null });
  const leaf = crearCertificado({ nombre: `Firmante ${nitEmisor} test local`, serial: '2001', ca: false,
    issuer: root.cert, issuerKey: root.claves.privateKey,
    notBefore: new Date(ahora.getTime() - 86400000 * 2),
    notAfter: certificadoExpirado ? new Date(ahora.getTime() - 86400000) : new Date(ahora.getTime() + 86400000 * 30) });
  const p12 = forge.pkcs12.toPkcs12Asn1(leaf.claves.privateKey, [leaf.cert, root.cert], 'clave-prueba', { algorithm: '3des' });
  const certificadoPath = path.join(directorio, 'certificado.p12');
  const paqueteRaicesPath = path.join(directorio, 'raices.pem');
  fs.writeFileSync(certificadoPath, Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'));
  fs.writeFileSync(paqueteRaicesPath, forge.pki.certificateToPem(root.cert));
  return { directorio, credenciales: { certificadoPath, certificadoPassword: 'clave-prueba', paqueteRaicesPath } };
}

module.exports = { crearMaterialTemporal };
