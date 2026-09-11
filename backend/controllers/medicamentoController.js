const medicamentoService = require('../services/medicamentoService');
const permisoService = require('../services/permisoService');

function manejarError(err) {
  if (err instanceof medicamentoService.ValidationError) return { ok: false, error: err.message };
  if (err instanceof permisoService.PermisoError) return { ok: false, error: err.message };
  console.error('[medicamentoController] error inesperado:', err);
  return { ok: false, error: 'Error interno. Intente nuevamente.' };
}

function listar() {
  try {
    return { ok: true, data: medicamentoService.listar() };
  } catch (err) {
    return manejarError(err);
  }
}

function crear(usuarioSesion, data) {
  try {
    return { ok: true, data: medicamentoService.crear(usuarioSesion, data) };
  } catch (err) {
    return manejarError(err);
  }
}

function actualizar(usuarioSesion, id, data) {
  try {
    return { ok: true, data: medicamentoService.actualizar(usuarioSesion, id, data) };
  } catch (err) {
    return manejarError(err);
  }
}

module.exports = { listar, crear, actualizar };
