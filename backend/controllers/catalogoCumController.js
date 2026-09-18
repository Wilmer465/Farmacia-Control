const catalogoCumService = require('../services/catalogoCumService');
const { AUDIT_ACTIONS } = require('../../shared/constants');

async function actualizarCatalogo(usuarioSesion) {
  try {
    const resultado = await catalogoCumService.actualizarCatalogo(usuarioSesion);
    return resultado;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function obtenerEstadoCatalogo() {
  try {
    return { ok: true, data: catalogoCumService.obtenerEstadoCatalogo() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function buscarPorGTIN(gtin) {
  try {
    const data = catalogoCumService.buscarPorGTIN(gtin);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function buscarPorCUM(cum) {
  try {
    const data = catalogoCumService.buscarPorCUM(cum);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function buscarPorProducto(texto, limite) {
  try {
    const data = catalogoCumService.buscarPorProducto(texto, limite);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function crearRegistroManual(usuarioSesion, data) {
  try {
    const data2 = catalogoCumService.crearRegistroManual(usuarioSesion, data);
    return { ok: true, data: data2 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function crearEmpaque(usuarioSesion, data) {
  try {
    const data2 = catalogoCumService.crearEmpaque(usuarioSesion, data);
    return { ok: true, data: data2 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function adjuntarDocumento(usuarioSesion, cumId, data) {
  try {
    const result = catalogoCumService.adjuntarDocumento(usuarioSesion, cumId, data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function obtenerDocumento(usuarioSesion, cumId) {
  try {
    const data = catalogoCumService.obtenerDocumento(cumId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  actualizarCatalogo,
  obtenerEstadoCatalogo,
  buscarPorGTIN,
  buscarPorCUM,
  buscarPorProducto,
  crearRegistroManual,
  crearEmpaque,
  adjuntarDocumento,
  obtenerDocumento
};