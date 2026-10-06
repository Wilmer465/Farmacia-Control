const receptorService = require('../services/receptorService');
const { ROLES } = require('../../shared/constants');

const ROLES_LECTURA_RECEPTORES = [ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.INVENTARIO];

function verificarLecturaReceptores(usuarioSesion) {
  if (!usuarioSesion || !ROLES_LECTURA_RECEPTORES.includes(usuarioSesion.rol_nombre)) {
    return { ok: false, error: 'No tiene permisos para consultar receptores.' };
  }
  return null;
}

function buscar(usuarioSesion, documento) {
  try {
    const denegado = verificarLecturaReceptores(usuarioSesion);
    if (denegado) return denegado;
    const receptor = receptorService.buscarPorDocumento(documento);
    return { ok: true, data: receptor };
  } catch (err) {
    console.error('[receptorController.buscar] error:', err);
    return { ok: false, error: err.message };
  }
}

function listar(usuarioSesion) {
  try {
    const denegado = verificarLecturaReceptores(usuarioSesion);
    if (denegado) return denegado;
    const listado = receptorService.listar();
    return { ok: true, data: listado };
  } catch (err) {
    console.error('[receptorController.listar] error:', err);
    return { ok: false, error: err.message };
  }
}

function guardar(usuarioSesion, data) {
  try {
    if (!usuarioSesion || ![ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.INVENTARIO].includes(usuarioSesion.rol_nombre)) {
      return { ok: false, error: 'No tiene permisos para modificar o registrar receptores.' };
    }
    const receptor = receptorService.guardarOActualizar(data);
    return { ok: true, data: receptor };
  } catch (err) {
    console.error('[receptorController.guardar] error:', err);
    return { ok: false, error: err.message };
  }
}

function actualizar(usuarioSesion, id, data) {
  try {
    if (!usuarioSesion || ![ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.INVENTARIO].includes(usuarioSesion.rol_nombre)) {
      return { ok: false, error: 'No tiene permisos para modificar o registrar receptores.' };
    }
    const receptor = receptorService.actualizar(id, data);
    if (!receptor) return { ok: false, error: 'La persona no existe.' };
    return { ok: true, data: receptor };
  } catch (err) {
    console.error('[receptorController.actualizar] error:', err);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  buscar,
  listar,
  guardar,
  actualizar
};
