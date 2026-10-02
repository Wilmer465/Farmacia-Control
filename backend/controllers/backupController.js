const backupService = require('../services/backupService');
const permisoService = require('../services/permisoService');

function manejarError(err) {
  if (err instanceof backupService.ValidationError) return { ok: false, error: err.message };
  if (err instanceof permisoService.PermisoError) return { ok: false, error: err.message };
  console.error('[backupController] error inesperado:', err);
  return { ok: false, error: 'Error interno. Intente nuevamente.' };
}

// Estas funciones DEBEN ser async. backupService.listar y .ultimoRespaldo son
// asincronas (leen el directorio con fsp) y .crear se volvio asincrona al
// migrar a db.backup(). Un controlador sincronico que devuelve
// `{ ok: true, data: <Promise> }` no es un thenable, asi que ipcMain.handle no
// lo resuelve: Electron serializa la Promise como {} por structured clone y el
// renderer recibe un objeto vacio donde esperaba un array.
async function listar(usuarioSesion, filtros) {
  try {
    const data = await backupService.listar(usuarioSesion, filtros);
    return { ok: true, data };
  } catch (err) {
    return manejarError(err);
  }
}

async function crear(usuarioSesion, opciones) {
  try {
    const data = await backupService.crear(usuarioSesion, opciones);
    return { ok: true, data };
  } catch (err) {
    return manejarError(err);
  }
}

function restaurar(usuarioSesion, nombreArchivo) {
  try {
    return { ok: true, data: backupService.restaurar(usuarioSesion, nombreArchivo) };
  } catch (err) {
    return manejarError(err);
  }
}

async function ultimoRespaldo(usuarioSesion, filtros) {
  try {
    const data = await backupService.ultimoRespaldo(usuarioSesion, filtros);
    return { ok: true, data };
  } catch (err) {
    return manejarError(err);
  }
}

function obtenerConfig(usuarioSesion) {
  try {
    return { ok: true, data: backupService.obtenerConfigAutoBackup(usuarioSesion) };
  } catch (err) {
    return manejarError(err);
  }
}

function guardarConfig(usuarioSesion, config) {
  try {
    return { ok: true, data: backupService.guardarConfigAutoBackup(usuarioSesion, config) };
  } catch (err) {
    return manejarError(err);
  }
}

// Consumo total en disco de los respaldos, independientemente del alcance que el
// usuario tenga seleccionado. Sin esto el operador solo ve el tamaño de los
// respaldos de su sede y no descubre el consumo real hasta que el disco se llena.
function consumo(usuarioSesion) {
  try {
    backupService.verificarAccesoRespaldos(usuarioSesion);
    return { ok: true, data: backupService.tamanoTotalEnDisco() };
  } catch (err) {
    return manejarError(err);
  }
}

module.exports = { listar, crear, restaurar, ultimoRespaldo, obtenerConfig, guardarConfig, consumo };
