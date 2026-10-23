const signatureService = require('../services/signatureService');

class ValidationError extends Error {}

function manejarError(err) {
  if (err instanceof ValidationError) return { ok: false, error: err.message };
  if (err instanceof signatureService.SignatureError) return { ok: false, error: err.message, codigo: err.codigo };
  console.error('[firmaPadController] error inesperado:', err);
  return { ok: false, error: 'Error interno. Intente nuevamente.' };
}

async function detectar() {
  try {
    return { ok: true, data: await signatureService.detectar() };
  } catch (err) {
    return manejarError(err);
  }
}

async function capturar(usuarioSesion, datos = {}) {
  try {
    if (datos && datos.nombre !== undefined && String(datos.nombre).length > 120) {
      throw new ValidationError('El nombre del firmante no debe superar 120 caracteres.');
    }
    if (datos && datos.timeoutSeg !== undefined) {
      const t = Number(datos.timeoutSeg);
      if (!Number.isFinite(t) || t < 10 || t > 600) {
        throw new ValidationError('El tiempo de espera debe estar entre 10 y 600 segundos.');
      }
    }
    return { ok: true, data: await signatureService.capturar(datos || {}) };
  } catch (err) {
    return manejarError(err);
  }
}

module.exports = { detectar, capturar, ValidationError };
