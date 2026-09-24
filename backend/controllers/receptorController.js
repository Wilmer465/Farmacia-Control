const receptorService = require('../services/receptorService');

function buscar(documento) {
  try {
    const receptor = receptorService.buscarPorDocumento(documento);
    return { ok: true, data: receptor };
  } catch (err) {
    console.error('[receptorController.buscar] error:', err);
    return { ok: false, error: err.message };
  }
}

function listar() {
  try {
    const listado = receptorService.listar();
    return { ok: true, data: listado };
  } catch (err) {
    console.error('[receptorController.listar] error:', err);
    return { ok: false, error: err.message };
  }
}

const { ROLES } = require('../../shared/constants');

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
