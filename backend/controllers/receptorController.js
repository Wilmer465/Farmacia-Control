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

module.exports = {
  buscar,
  listar
};
