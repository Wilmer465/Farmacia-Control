const despachoService = require('../services/despachoService');
const permisoService = require('../services/permisoService');

function manejarError(err) {
  if (err instanceof despachoService.ValidationError) return { ok: false, error: err.message };
  if (err instanceof permisoService.PermisoError) return { ok: false, error: err.message };
  console.error('[despachoController] error inesperado:', err);
  return { ok: false, error: 'Error interno. Intente nuevamente.' };
}

function listarPorOrden(usuarioSesion, ordenId) {
  try {
    return { ok: true, data: despachoService.listarPorOrden(usuarioSesion, ordenId) };
  } catch (err) {
    return manejarError(err);
  }
}

function crear(usuarioSesion, data) {
  try {
    return { ok: true, data: despachoService.crear(usuarioSesion, data) };
  } catch (err) {
    return manejarError(err);
  }
}

module.exports = { listarPorOrden, crear };
