const cloudSyncService = require('../services/cloudSyncService');
const permisoService = require('../services/permisoService');

function manejarError(err) {
  if (err instanceof cloudSyncService.CloudSyncError) return { ok: false, error: err.message };
  if (err instanceof permisoService.PermisoError) return { ok: false, error: err.message };
  console.error('[cloudSyncController] error inesperado:', err);
  return { ok: false, error: 'Error interno sincronizando con Supabase.' };
}

async function sincronizar(usuarioSesion, opciones) {
  try {
    return { ok: true, data: await cloudSyncService.sincronizar(usuarioSesion, opciones) };
  } catch (err) {
    return manejarError(err);
  }
}

module.exports = { sincronizar };
