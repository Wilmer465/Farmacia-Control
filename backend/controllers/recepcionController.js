const recepcionService = require('../services/recepcionService');

async function procesarEscaneo(usuarioSesion, codigoBarras) {
  try {
    const resultado = await recepcionService.procesarEscaneo(usuarioSesion, codigoBarras);
    return resultado;
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