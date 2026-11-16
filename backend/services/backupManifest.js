'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { resolveDbPath } = require('../database/connection');
const { sha256File, validateDatabase } = require('../database/startupRecovery');

// Un respaldo `.db` sigue siendo SQLite estándar. El manifiesto lateral solo
// aporta la procedencia y la integridad que el nombre del archivo no puede dar:
// huella SHA-256 del contenido, esquema firmado y sede que solicitó la copia.
const FORMATO_MANIFIESTO = 1;
const TIPO_MANIFIESTO = 'RESPALDO_FARMACIA';
const SUFIJO_MANIFIESTO = '.manifest.json';
const MAX_MANIFIESTO_BYTES = 64 * 1024;

// Tablas que deben existir en cualquier copia restaurable. No incluye tablas
// opcionales ni índices: solo el núcleo estable desde las primeras migraciones.
const TABLAS_REQUERIDAS = Object.freeze([
  'auditoria',
  'despacho_detalle',
  'despachos',
  'entregas',
  'lotes',
  'medicamentos',
  'migrations',
  'movimientos_inventario',
  'orden_detalles',
  'ordenes',
  'receptores',
  'roles',
  'sedes',
  'usuarios'
]);

let rutaClaveOverride = null;

function setClaveManifiestoPath(ruta) {
  rutaClaveOverride = ruta ? path.resolve(ruta) : null;
}

function rutaManifiesto(rutaDb) {
  return `${rutaDb}${SUFIJO_MANIFIESTO}`;
}

function serializarCanonico(valor) {
  if (Array.isArray(valor)) {
    return `[${valor.map(serializarCanonico).join(',')}]`;
  }
  if (valor && typeof valor === 'object') {
    const claves = Object.keys(valor).sort();
    return `{${claves.map((clave) => `${JSON.stringify(clave)}:${serializarCanonico(valor[clave])}`).join(',')}}`;
  }
  return JSON.stringify(valor);
}

function dependenciasElectron() {
  try {
    const electron = require('electron');
    if (!electron || typeof electron !== 'object') return null;
    if (!electron.app || !electron.safeStorage) return null;
    return electron;
  } catch {
    return null;
  }
}

function rutaClaveManifiesto() {
  if (rutaClaveOverride) return rutaClaveOverride;
  const electron = dependenciasElectron();
  if (electron) {
    const userData = electron.app.getPath('userData');
    if (!userData) throw new Error('Electron no proporcionó una carpeta userData para la clave de respaldos.');
    // Fuera de la carpeta de respaldos: copiar un archivo a backups/ no permite
    // leer la clave ni fabricar un manifiesto válido.
    return path.join(userData, 'backup-signing.key.bin');
  }
  return path.join(path.dirname(resolveDbPath()), 'backup-signing.key');
}

function claveId(clave) {
  return crypto.createHash('sha256').update(clave).digest('hex').slice(0, 16);
}

function leerClave(ruta) {
  const bytes = fs.readFileSync(ruta);
  const electron = rutaClaveOverride ? null : dependenciasElectron();

  if (electron) {
    if (typeof electron.safeStorage.isEncryptionAvailable !== 'function' || !electron.safeStorage.isEncryptionAvailable()) {
      throw new Error('El sistema operativo no ofrece cifrado seguro para la clave de respaldos.');
    }
    let texto;
    try {
      texto = electron.safeStorage.decryptString(bytes);
    } catch {
      throw new Error('No se pudo descifrar la clave local de autenticidad de respaldos.');
    }
    const clave = Buffer.from(String(texto || ''), 'base64');
    if (clave.length !== 32) throw new Error('La clave local de autenticidad de respaldos está corrupta.');
    return clave;
  }

  if (bytes.length !== 32) throw new Error('La clave local de autenticidad de respaldos está corrupta.');
  return bytes;
}

function escribirClave(ruta, clave) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const electron = rutaClaveOverride ? null : dependenciasElectron();
  let bytes = clave;
  if (electron) {
    if (typeof electron.safeStorage.isEncryptionAvailable !== 'function' || !electron.safeStorage.isEncryptionAvailable()) {
      throw new Error('El sistema operativo no ofrece cifrado seguro para la clave de respaldos.');
    }
    bytes = electron.safeStorage.encryptString(clave.toString('base64'));
  }

  const fd = fs.openSync(ruta, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function obtenerClave({ crear = false } = {}) {
  const ruta = rutaClaveManifiesto();
  if (fs.existsSync(ruta)) return leerClave(ruta);
  if (!crear) throw new Error('No existe la clave local de autenticidad de respaldos en este equipo.');

  const clave = crypto.randomBytes(32);
  try {
    escribirClave(ruta, clave);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  return leerClave(ruta);
}

function firmarManifiesto(manifiesto, clave) {
  const payload = { ...manifiesto };
  delete payload.hmac;
  return crypto.createHmac('sha256', clave).update(serializarCanonico(payload)).digest('hex');
}

function compararFirmas(a, b) {
  if (typeof a !== 'string' || !/^[a-f0-9]{64}$/i.test(a)) return false;
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

function validarEstructuraManifiesto(manifiesto, nombreArchivo) {
  if (!manifiesto || typeof manifiesto !== 'object' || Array.isArray(manifiesto)) {
    throw new Error('El manifiesto del respaldo no es un objeto válido.');
  }
  if (manifiesto.formato !== FORMATO_MANIFIESTO || manifiesto.tipo !== TIPO_MANIFIESTO) {
    throw new Error('El manifiesto del respaldo no tiene el formato esperado.');
  }
  if (manifiesto.nombre !== nombreArchivo) {
    throw new Error('El manifiesto no corresponde al archivo seleccionado.');
  }
  if (typeof manifiesto.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifiesto.sha256)) {
    throw new Error('El manifiesto contiene una huella de contenido inválida.');
  }
  if (!Number.isInteger(manifiesto.tamanoBytes) || manifiesto.tamanoBytes < 1) {
    throw new Error('El manifiesto contiene un tamaño de archivo inválido.');
  }
  if (typeof manifiesto.creadoEn !== 'string' || !Number.isFinite(Date.parse(manifiesto.creadoEn))) {
    throw new Error('El manifiesto contiene una fecha inválida.');
  }
  if (typeof manifiesto.automatico !== 'boolean') {
    throw new Error('El manifiesto no indica si el respaldo fue automático.');
  }
  if (!['GLOBAL', 'SEDE'].includes(manifiesto.alcance)) {
    throw new Error('El manifiesto contiene un alcance de sede inválido.');
  }
  if (manifiesto.alcance === 'GLOBAL') {
    if (manifiesto.sedeId !== null || manifiesto.sedeNombre !== null) {
      throw new Error('El manifiesto global no puede declarar una sede.');
    }
  } else {
    if (!Number.isInteger(manifiesto.sedeId) || manifiesto.sedeId < 1) {
      throw new Error('El manifiesto de sede no contiene un identificador válido.');
    }
    if (typeof manifiesto.sedeNombre !== 'string' || !manifiesto.sedeNombre.trim()) {
      throw new Error('El manifiesto de sede no contiene un nombre válido.');
    }
  }
  if (typeof manifiesto.claveId !== 'string' || !/^[a-f0-9]{16}$/.test(manifiesto.claveId)) {
    throw new Error('El manifiesto no identifica la clave de firma.');
  }
  const esquema = manifiesto.esquema;
  if (!esquema || typeof esquema !== 'object' || Array.isArray(esquema)) {
    throw new Error('El manifiesto no contiene el esquema del respaldo.');
  }
  if (!Array.isArray(esquema.migraciones) || esquema.migraciones.some((nombre) => typeof nombre !== 'string' || !nombre.trim())) {
    throw new Error('El manifiesto contiene un registro de migraciones inválido.');
  }
  if (new Set(esquema.migraciones).size !== esquema.migraciones.length) {
    throw new Error('El manifiesto contiene migraciones duplicadas.');
  }
  if (typeof esquema.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(esquema.sha256)) {
    throw new Error('El manifiesto contiene una huella de esquema inválida.');
  }
  if (!Number.isInteger(esquema.userVersion) || esquema.userVersion < 0) {
    throw new Error('El manifiesto contiene una versión de usuario inválida.');
  }
}

function verificarManifiesto(manifiesto, nombreArchivo, clave) {
  validarEstructuraManifiesto(manifiesto, nombreArchivo);
  if (manifiesto.claveId !== claveId(clave)) {
    throw new Error('El manifiesto fue firmado con otra clave local de respaldos.');
  }
  const esperado = firmarManifiesto(manifiesto, clave);
  if (!compararFirmas(manifiesto.hmac, esperado)) {
    throw new Error('La firma del manifiesto no es válida.');
  }
  return true;
}

function leerManifiesto(rutaDb, nombreArchivo) {
  const ruta = rutaManifiesto(rutaDb);
  if (!fs.existsSync(ruta)) {
    throw new Error('El respaldo no tiene manifiesto de autenticidad.');
  }
  const stats = fs.statSync(ruta);
  if (!stats.isFile() || stats.size > MAX_MANIFIESTO_BYTES) {
    throw new Error('El manifiesto del respaldo tiene un tamaño inválido.');
  }
  let manifiesto;
  try {
    manifiesto = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    throw new Error('El manifiesto del respaldo está corrupto.');
  }
  const clave = obtenerClave({ crear: false });
  verificarManifiesto(manifiesto, nombreArchivo, clave);
  return manifiesto;
}

function eliminarCompanionVacio(rutaDb) {
  for (const sufijo of ['-wal', '-shm']) {
    const ruta = `${rutaDb}${sufijo}`;
    if (!fs.existsSync(ruta)) continue;
    if (fs.statSync(ruta).size > 0) {
      throw new Error('El respaldo tiene archivos auxiliares SQLite con contenido.');
    }
    // Un -wal/-shm vacío no aporta datos y rompe la idea de copia autónoma.
    fs.unlinkSync(ruta);
  }
}

function escribirManifiestoAtomico(ruta, manifiesto) {
  const temporal = `${ruta}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const fd = fs.openSync(temporal, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(manifiesto)}\n`, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    // Reemplaza un manifiesto anterior si el nombre del respaldo se reutiliza.
    fs.rmSync(ruta, { force: true });
    fs.renameSync(temporal, ruta);
  } catch (err) {
    try { fs.rmSync(temporal, { force: true }); } catch { /* limpieza best-effort */ }
    throw err;
  }
}

async function crearManifiestoRespaldo(rutaDb, {
  nombre,
  automatico = false,
  sedeId = null,
  sedeNombre = null,
  creadoEn = new Date().toISOString()
} = {}) {
  if (typeof nombre !== 'string' || !nombre.trim()) throw new Error('El nombre del respaldo es obligatorio.');
  if (sedeId !== null && (!Number.isInteger(sedeId) || sedeId < 1)) throw new Error('La sede del respaldo es inválida.');
  if (sedeId === null && sedeNombre !== null) throw new Error('Un respaldo global no puede tener nombre de sede.');

  eliminarCompanionVacio(rutaDb);

  const clave = obtenerClave({ crear: true });
  const sha256 = await sha256File(rutaDb);
  const stats = fs.statSync(rutaDb);
  const validacion = validateDatabase(rutaDb, {
    requireComplete: false,
    fullIntegrity: true,
    requiredTables: TABLAS_REQUERIDAS
  });

  const manifiesto = {
    formato: FORMATO_MANIFIESTO,
    tipo: TIPO_MANIFIESTO,
    nombre,
    sha256,
    tamanoBytes: stats.size,
    creadoEn,
    automatico: Boolean(automatico),
    alcance: sedeId === null ? 'GLOBAL' : 'SEDE',
    sedeId,
    sedeNombre: sedeId === null ? null : String(sedeNombre || `sede_${sedeId}`),
    esquema: {
      migraciones: validacion.migrations.applied,
      sha256: validacion.schemaSha256,
      userVersion: validacion.userVersion
    },
    claveId: claveId(clave)
  };
  manifiesto.hmac = firmarManifiesto(manifiesto, clave);

  const ruta = rutaManifiesto(rutaDb);
  escribirManifiestoAtomico(ruta, manifiesto);
  return manifiesto;
}

async function validarContenidoRespaldo(rutaDb, manifiesto, { requireComplete = false } = {}) {
  eliminarCompanionVacio(rutaDb);

  const stats = fs.statSync(rutaDb);
  if (!stats.isFile()) throw new Error('El respaldo no es un archivo regular.');
  if (stats.size !== manifiesto.tamanoBytes) {
    throw new Error('El tamaño del respaldo no coincide con su manifiesto.');
  }

  const sha256 = await sha256File(rutaDb);
  if (sha256 !== manifiesto.sha256) {
    throw new Error('La huella del respaldo no coincide con su manifiesto.');
  }

  const validacion = validateDatabase(rutaDb, {
    requireComplete,
    fullIntegrity: true,
    requiredTables: TABLAS_REQUERIDAS,
    expectedMigrations: manifiesto.esquema.migraciones,
    expectedSchemaSha256: manifiesto.esquema.sha256,
    expectedUserVersion: manifiesto.esquema.userVersion
  });

  return { sha256, validacion };
}

module.exports = {
  FORMATO_MANIFIESTO,
  TIPO_MANIFIESTO,
  SUFIJO_MANIFIESTO,
  TABLAS_REQUERIDAS,
  setClaveManifiestoPath,
  rutaManifiesto,
  crearManifiestoRespaldo,
  leerManifiesto,
  validarContenidoRespaldo,
  eliminarCompanionVacio,
  obtenerClave,
  claveId
};
