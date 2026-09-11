const entregaService = require('../services/entregaService');
const permisoService = require('../services/permisoService');

function manejarError(err) {
  if (err instanceof entregaService.ValidationError) return { ok: false, error: err.message };
  if (err instanceof permisoService.PermisoError) return { ok: false, error: err.message };
  console.error('[entregaController] error inesperado:', err);
  return { ok: false, error: 'Error interno. Intente nuevamente.' };
}

function listar(usuarioSesion, filtros) {
  try {
    return { ok: true, data: entregaService.listar(usuarioSesion, filtros) };
  } catch (err) {
    return manejarError(err);
  }
}

function crear(usuarioSesion, data) {
  try {
    return { ok: true, data: entregaService.crear(usuarioSesion, data) };
  } catch (err) {
    return manejarError(err);
  }
}

async function capturarHuella() {
  try {
    return { ok: true, data: await entregaService.capturarHuella() };
  } catch (err) {
    console.error('[entregaController] error capturando huella:', err);
    return { ok: false, error: 'No se pudo capturar la huella.' };
  }
}

module.exports = { listar, crear, capturarHuella };
