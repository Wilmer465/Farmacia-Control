const loteService = require('../services/loteService');
const permisoService = require('../services/permisoService');

function manejarError(err) {
  if (err instanceof loteService.ValidationError) return { ok: false, error: err.message };
  if (err instanceof permisoService.PermisoError) return { ok: false, error: err.message };
  console.error('[loteController] error inesperado:', err);
  return { ok: false, error: 'Error interno. Intente nuevamente.' };
}

function listar(usuarioSesion, filtros) {
  try {
    return { ok: true, data: loteService.listar(usuarioSesion, filtros) };
  } catch (err) {
    return manejarError(err);
  }
}

function crear(usuarioSesion, data) {
  try {
    return { ok: true, data: loteService.crear(usuarioSesion, data) };
  } catch (err) {
    return manejarError(err);
  }
}

function ajustarCantidades(usuarioSesion, loteId, data) {
  try {
    return { ok: true, data: loteService.ajustarCantidades(usuarioSesion, loteId, data) };
  } catch (err) {
    return manejarError(err);
  }
}

module.exports = { listar, crear, ajustarCantidades };
