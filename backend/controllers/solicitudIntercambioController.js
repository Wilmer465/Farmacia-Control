const solicitudService = require('../services/solicitudIntercambioService');
const permisoService = require('../services/permisoService');

function manejarError(err) {
  if (err instanceof solicitudService.ValidationError) return { ok: false, error: err.message };
  if (err instanceof permisoService.PermisoError) return { ok: false, error: err.message };
  console.error('[solicitudIntercambioController] error inesperado:', err);
  return { ok: false, error: 'Error interno. Intente nuevamente.' };
}

function listar(usuarioSesion, filtros) {
  try {
    return { ok: true, data: solicitudService.listar(usuarioSesion, filtros) };
  } catch (err) {
    return manejarError(err);
  }
}

function crear(usuarioSesion, data) {
  try {
    return { ok: true, data: solicitudService.crear(usuarioSesion, data) };
  } catch (err) {
    return manejarError(err);
  }
}

function resolver(usuarioSesion, id, data) {
  try {
    return { ok: true, data: solicitudService.resolver(usuarioSesion, id, data) };
  } catch (err) {
    return manejarError(err);
  }
}

module.exports = { listar, crear, resolver };
