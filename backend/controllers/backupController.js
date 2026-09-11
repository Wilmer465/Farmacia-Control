const backupService = require('../services/backupService');
const permisoService = require('../services/permisoService');

function manejarError(err) {
  if (err instanceof backupService.ValidationError) return { ok: false, error: err.message };
  if (err instanceof permisoService.PermisoError) return { ok: false, error: err.message };
  console.error('[backupController] error inesperado:', err);
  return { ok: false, error: 'Error interno. Intente nuevamente.' };
}

function listar(usuarioSesion) {
  try {
    return { ok: true, data: backupService.listar(usuarioSesion) };
  } catch (err) {
    return manejarError(err);
  }
}

function crear(usuarioSesion) {
  try {
    return { ok: true, data: backupService.crear(usuarioSesion) };
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

function ultimoRespaldo(usuarioSesion) {
  try {
    return { ok: true, data: backupService.ultimoRespaldo(usuarioSesion) };
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

module.exports = { listar, crear, restaurar, ultimoRespaldo, obtenerConfig, guardarConfig };
