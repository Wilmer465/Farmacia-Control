const recepcionService = require('../services/recepcionService');

async function procesarEscaneo(usuarioSesion, codigoBarras) {
  try {
    const resultado = await recepcionService.procesarEscaneo(usuarioSesion, codigoBarras);
    // El renderer consume el contrato `{ ok, data }` usado por los controladores.
    // El servicio ya incluye `ok`; solo se envuelven los resultados exitosos.
    return resultado.ok ? { ok: true, data: resultado } : resultado;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function registrarRecepcion(usuarioSesion, data) {
  try {
    const resultado = await recepcionService.registrarRecepcion(usuarioSesion, data);
    return resultado;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function obtenerHistorialRecepciones(usuarioSesion, filtros) {
  try {
    const data = recepcionService.obtenerHistorialRecepciones(filtros);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  procesarEscaneo,
  registrarRecepcion,
  obtenerHistorialRecepciones
};
