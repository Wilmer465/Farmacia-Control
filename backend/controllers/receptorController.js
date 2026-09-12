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

function guardar(data) {
  try {
    const receptor = receptorService.guardarOActualizar(data);
    return { ok: true, data: receptor };
  } catch (err) {
    console.error('[receptorController.guardar] error:', err);
    return { ok: false, error: err.message };
  }
}

function actualizar(id, data) {
  try {
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
