const catalogoCumService = require('../services/catalogoCumService');
const permisoService = require('../services/permisoService');
const { ROLES } = require('../../shared/constants');

const ROLES_LECTURA_CATALOGO = [ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.INVENTARIO];

function verificarLecturaCatalogo(usuarioSesion) {
  if (!usuarioSesion || !ROLES_LECTURA_CATALOGO.includes(usuarioSesion.rol_nombre)) {
    throw new permisoService.PermisoError('No tiene permisos para consultar el catálogo CUM.');
  }
}

async function actualizarCatalogo(usuarioSesion) {
  try {
    const resultado = await catalogoCumService.actualizarCatalogo(usuarioSesion);
    return resultado;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function obtenerEstadoCatalogo(usuarioSesion) {
  try {
    verificarLecturaCatalogo(usuarioSesion);
    return { ok: true, data: catalogoCumService.obtenerEstadoCatalogo() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function buscarPorGTIN(usuarioSesion, gtin) {
  try {
    verificarLecturaCatalogo(usuarioSesion);
    const data = catalogoCumService.buscarPorGTIN(gtin);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function buscarPorCUM(usuarioSesion, cum) {
  try {
    verificarLecturaCatalogo(usuarioSesion);
    const data = catalogoCumService.buscarPorCUM(cum);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function buscarPorProducto(usuarioSesion, texto, limite) {
  try {
    verificarLecturaCatalogo(usuarioSesion);
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
    const data = catalogoCumService.obtenerDocumento(usuarioSesion, cumId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function obtenerProgreso(usuarioSesion) {
  try {
    verificarLecturaCatalogo(usuarioSesion);
    return { ok: true, data: catalogoCumService.obtenerProgreso() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function cancelarActualizacion(usuarioSesion) {
  try {
    permisoService.verificarEsAdmin(usuarioSesion);
    catalogoCumService.cancelarActualizacion();
    return { ok: true };
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
  obtenerDocumento,
  obtenerProgreso,
  cancelarActualizacion
};