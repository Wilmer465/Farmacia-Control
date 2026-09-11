const ordenService = require('../services/ordenService');
const permisoService = require('../services/permisoService');

function manejarError(err) {
  if (err instanceof ordenService.ValidationError) return { ok: false, error: err.message };
  if (err instanceof permisoService.PermisoError) return { ok: false, error: err.message };
  console.error('[ordenController] error inesperado:', err);
  return { ok: false, error: 'Error interno. Intente nuevamente.' };
}

function listar(usuarioSesion, filtros) {
  try {
    return { ok: true, data: ordenService.listar(usuarioSesion, filtros) };
  } catch (err) {
    return manejarError(err);
  }
}

function obtener(usuarioSesion, id) {
  try {
    return { ok: true, data: ordenService.obtener(usuarioSesion, id) };
  } catch (err) {
    return manejarError(err);
  }
}

function crear(usuarioSesion, data) {
  try {
    return { ok: true, data: ordenService.crear(usuarioSesion, data) };
  } catch (err) {
    return manejarError(err);
  }
}

function cancelar(usuarioSesion, id, data) {
  try {
    return { ok: true, data: ordenService.cancelar(usuarioSesion, id, data) };
  } catch (err) {
    return manejarError(err);
  }
}

function actualizarDocumentacion(usuarioSesion, id, data) {
  try {
    return { ok: true, data: ordenService.actualizarDocumentacion(usuarioSesion, id, data) };
  } catch (err) {
    return manejarError(err);
  }
}

module.exports = { listar, obtener, crear, cancelar, actualizarDocumentacion };
