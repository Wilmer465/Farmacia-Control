const auditoriaService = require('../services/auditoriaService');
const permisoService = require('../services/permisoService');

function listar(usuarioSesion, filtros) {
  try {
    return { ok: true, data: auditoriaService.listar(usuarioSesion, filtros) };
  } catch (err) {
    if (err instanceof permisoService.PermisoError) return { ok: false, error: err.message };
    console.error('[auditoriaController] error inesperado:', err);
    return { ok: false, error: 'Error interno. Intente nuevamente.' };
  }
}

module.exports = { listar };
