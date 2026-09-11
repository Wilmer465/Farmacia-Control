const reporteService = require('../services/reporteService');
const conciliacionService = require('../services/conciliacionService');
const permisoService = require('../services/permisoService');

function manejarError(err) {
  if (err instanceof permisoService.PermisoError) return { ok: false, error: err.message };
  console.error('[reporteController] error inesperado:', err);
  return { ok: false, error: 'Error interno. Intente nuevamente.' };
}

function reporteDiario(usuarioSesion, filtros) {
  try {
    return { ok: true, data: reporteService.reporteDiario(usuarioSesion, filtros) };
  } catch (err) {
    return manejarError(err);
  }
}

function dashboard(usuarioSesion, filtros) {
  try {
    return { ok: true, data: reporteService.dashboard(usuarioSesion, filtros) };
  } catch (err) {
    return manejarError(err);
  }
}

function conciliacion(usuarioSesion, filtros) {
  try {
    return { ok: true, data: conciliacionService.conciliar(usuarioSesion, filtros) };
  } catch (err) {
    return manejarError(err);
  }
}

module.exports = { reporteDiario, dashboard, conciliacion };
