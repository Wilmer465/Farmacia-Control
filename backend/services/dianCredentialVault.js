const fs = require('node:fs');
const path = require('node:path');

const VARIABLES = {
  certificadoPath: 'DIAN_CERTIFICATE_PATH',
  certificadoPassword: 'DIAN_CERTIFICATE_PASSWORD',
  softwarePin: 'DIAN_SOFTWARE_PIN',
  claveTecnica: 'DIAN_TECHNICAL_KEY',
  paqueteRaicesPath: 'DIAN_TRUSTED_CA_BUNDLE'
};

function dependenciasElectron() {
  const { app, safeStorage } = require('electron');
  return { app, safeStorage };
}

function escribirSeguro(destino, bytes) {
  const temporal = `${destino}.${process.pid}.tmp`;
  fs.writeFileSync(temporal, bytes, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporal, destino);
}

function credencialesDesdeEntorno() {
  const valores = Object.fromEntries(Object.entries(VARIABLES).map(([campo, variable]) => [campo, process.env[variable] || '']));
  if (Object.values(valores).some(valor => !valor)) return null;
  return valores;
}

async function cargarCredencialesDian() {
  const { app, safeStorage } = dependenciasElectron();
  if (!app.isReady()) throw new Error('El almacén cifrado DIAN solo está disponible en el proceso principal de Electron.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('El sistema operativo no ofrece cifrado seguro para guardar las credenciales DIAN.');
  const destino = path.join(app.getPath('userData'), 'dian-credenciales.bin');
  if (fs.existsSync(destino)) {
    try {
      const contenido = safeStorage.decryptString(fs.readFileSync(destino));
      const credenciales = JSON.parse(contenido);
      if (Object.keys(VARIABLES).some(campo => !credenciales[campo])) throw new Error('Faltan credenciales.');
      return credenciales;
    } catch {
      throw new Error('No se pudo descifrar el almacén local DIAN. No se usó ningún secreto alterno.');
    }
  }
  const credenciales = credencialesDesdeEntorno();
  if (!credenciales) throw new Error(`Configure ${Object.values(VARIABLES).join(', ')} en el entorno del usuario y reinicie la aplicación para provisionar la bóveda DIAN.`);
  const cifrado = safeStorage.encryptString(JSON.stringify(credenciales));
  escribirSeguro(destino, cifrado);
  for (const variable of Object.values(VARIABLES)) delete process.env[variable];
  return credenciales;
}

module.exports = { cargarCredencialesDian, VARIABLES };
