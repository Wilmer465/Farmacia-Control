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
const LONGITUD_CLAVE_BYTES = 32;

// Estados del ciclo de vida de la clave de firma de respaldos (AC-4.2-03).
const ESTADO_CLAVE = Object.freeze({
  NEW: 'NEW', // no existe clave ni evidencia de respaldos previos: instalación nueva
  EXISTING: 'EXISTING', // clave válida y recuperable
  LOST: 'LOST', // falta la clave y existen respaldos o manifiestos previos
  CORRUPT: 'CORRUPT', // existe el archivo de clave pero no es válido
  UNDECRYPTABLE: 'UNDECRYPTABLE' // existe el archivo pero no se puede descifrar
});

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

// Indica si en la carpeta dada hay respaldos (.db) o manifiestos previos (.manifest.json).
// Se usa para decidir entre una instalación realmente nueva (NEW) y una clave perdida (LOST).
function hayEvidenciaRespaldosPrevios(carpeta) {
  if (!carpeta || !fs.existsSync(carpeta)) return false;
  try {
    return fs.readdirSync(carpeta).some((nombre) => nombre.endsWith('.db') || nombre.endsWith(SUFIJO_MANIFIESTO));
  } catch {
    return false;
  }
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

function dependenciasElectron(electronInyectado = null) {
  if (electronInyectado) return electronInyectado;
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

function leerClave(ruta, electronInyectado = null) {
  let bytes;
  try {
    bytes = fs.readFileSync(ruta);
  } catch {
    throw new Error('No se pudo leer la clave local de autenticidad de respaldos.');
  }

  // Si se inyecta electron explícitamente (modo prueba), siempre se descifra
  // con esa instancia, incluso con override de ruta. Esto permite probar el
  // estado UNDECRYPTABLE a través de crear() sin tocar el comportamiento de
  // producción (sin override, sin electron inyectado).
  const electron = electronInyectado == null ? dependenciasElectron() : electronInyectado;

  if (rutaClaveOverride) {
    // Override (modo prueba/standalone): leer directamente sin safeStorage.
    // La clave debe estar en texto plano (32 bytes) cuando hay override.
    if (bytes.length !== LONGITUD_CLAVE_BYTES) throw new Error('La clave local de autenticidad de respaldos está corrupta.');
    return bytes;
  }

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
    if (clave.length !== LONGITUD_CLAVE_BYTES) throw new Error('La clave local de autenticidad de respaldos está corrupta.');
    return clave;
  }

  // Sin override y sin Electron: no hay forma segura de recuperar la clave.
  throw new Error('No se puede recuperar la clave de respaldos fuera de Electron sin una ruta de clave explícita.');
}

function escribirClave(ruta, clave, electronInyectado = null) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const electron = electronInyectado === null ? dependenciasElectron() : electronInyectado;
  let bytes = clave;
  // Con override de ruta (modo prueba/standalone) se guarda tal cual; en
  // producción (sin override) se cifra con safeStorage del SO. Nunca se expone
  // ni se persiste la clave en texto plano fuera de este entorno controlado.
  if (!rutaClaveOverride) {
    if (!electron || typeof electron.safeStorage.isEncryptionAvailable !== 'function' || !electron.safeStorage.isEncryptionAvailable()) {
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

function obtenerClave({ electron, rutaClave } = {}) {
  const ruta = rutaClave || rutaClaveManifiesto();
  if (!fs.existsSync(ruta)) {
    throw new Error('No existe la clave local de autenticidad de respaldos en este equipo.');
  }
  return leerClave(ruta, electron);
}

// Detecta el estado de la clave de firma sin generar nada ni modificar archivos.
// `carpetaRespaldos` permite distinguir una instalación realmente nueva (NEW) de
// una clave perdida con respaldos previos (LOST). `electron` se inyecta en pruebas.
function detectarEstadoClave({ rutaClave, carpetaRespaldos, electron } = {}) {
  const ruta = rutaClave || rutaClaveManifiesto();
  const existe = fs.existsSync(ruta);
  const dir = carpetaRespaldos || path.dirname(ruta);
  const hayEvidencia = hayEvidenciaRespaldosPrevios(dir);

  if (!existe) {
    return {
      estado: hayEvidencia ? ESTADO_CLAVE.LOST : ESTADO_CLAVE.NEW,
      motivo: hayEvidencia ? 'Falta la clave y existen respaldos o manifiestos previos.' : 'Instalación nueva sin evidencia de respaldos previos.',
      rutaClave: ruta
    };
  }

  try {
    leerClave(ruta, electron);
    return { estado: ESTADO_CLAVE.EXISTING, motivo: 'Clave válida y recuperable.', rutaClave: ruta };
  } catch (err) {
    const msg = String(err.message || '');
    if (/descifrar|fuera de Electron/i.test(msg)) {
      return { estado: ESTADO_CLAVE.UNDECRYPTABLE, motivo: msg, rutaClave: ruta };
    }
    return { estado: ESTADO_CLAVE.CORRUPT, motivo: msg, rutaClave: ruta };
  }
}

// Genera una clave nueva SOLO cuando no existe ninguna (estado NEW). Nunca
// sobrescribe ni elimina una clave existente. Se invoca de forma explícita en
// la inicialización de una instalación realmente nueva.
function generarClaveNueva({ electron, rutaClave } = {}) {
  const ruta = rutaClave || rutaClaveManifiesto();
  if (fs.existsSync(ruta)) {
    throw new Error('Ya existe una clave local de respaldos. No se genera una nueva.');
  }
  const clave = crypto.randomBytes(LONGITUD_CLAVE_BYTES);
  escribirClave(ruta, clave, electron);
  return clave;
}

// Inicialización explícita de la clave de firma, invocada durante el arranque
// de una instalación nueva, después de que Electron permita usar safeStorage.
// Nunca se invoca dentro de crearManifiestoRespaldo.
function inicializarClaveRespaldo({ electron, carpetaRespaldos, rutaClave } = {}) {
  const estado = detectarEstadoClave({ rutaClave, carpetaRespaldos, electron });
  if (estado.estado === ESTADO_CLAVE.NEW) {
    // No se genera clave si safeStorage no esta disponible, aunque se use
    // override de ruta: la clave debe estar protegida por el SO, nunca en texto
    // plano sin cifrado.
    const electronDep = electron === null ? dependenciasElectron() : electron;
    if (
      electronDep &&
      typeof electronDep.safeStorage.isEncryptionAvailable === 'function' &&
      !electronDep.safeStorage.isEncryptionAvailable()
    ) {
      throw new Error('No se puede inicializar la clave de respaldo: el sistema operativo no ofrece cifrado seguro para la clave de respaldos.');
    }
    const clave = generarClaveNueva({ electron, rutaClave });
    return { estado: ESTADO_CLAVE.NEW, clave, motivo: 'Clave generada para una instalación nueva.' };
  }
  if (estado.estado === ESTADO_CLAVE.EXISTING) {
    const clave = obtenerClave({ electron, rutaClave });
    return { estado: ESTADO_CLAVE.EXISTING, clave, motivo: 'Clave existente recuperada.' };
  }
  throw new Error(`No se puede inicializar la clave de respaldo (estado: ${estado.estado}). ${estado.motivo}`);
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

function leerManifiesto(rutaDb, nombreArchivo, { electron } = {}) {
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
  const clave = obtenerClave({ electron });
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
  creadoEn = new Date().toISOString(),
  electron
} = {}) {
  if (typeof nombre !== 'string' || !nombre.trim()) throw new Error('El nombre del respaldo es obligatorio.');
  if (sedeId !== null && (!Number.isInteger(sedeId) || sedeId < 1)) throw new Error('La sede del respaldo es inválida.');
  if (sedeId === null && sedeNombre !== null) throw new Error('Un respaldo global no puede tener nombre de sede.');

  eliminarCompanionVacio(rutaDb);

  // La clave de firma solo se recupera; nunca se genera aquí. Si falta (archivo
  // ausente o estado LOST/CORRUPT/UNDECRYPTABLE) se bloquea la creación del
  // manifiesto sin tocar los respaldos existentes.
  const clave = obtenerClave({ electron });
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
  LONGITUD_CLAVE_BYTES,
  ESTADO_CLAVE,
  setClaveManifiestoPath,
  rutaManifiesto,
  crearManifiestoRespaldo,
  leerManifiesto,
  validarContenidoRespaldo,
  eliminarCompanionVacio,
  obtenerClave,
  detectarEstadoClave,
  generarClaveNueva,
  inicializarClaveRespaldo,
  claveId
};
