const receptorRepository = require('../repositories/receptorRepository');

function buscarPorDocumento(documento) {
  if (!documento || !documento.trim()) return null;
  return receptorRepository.buscarPorDocumento(documento.trim());
}

function listar() {
  return receptorRepository.listar();
}

function guardarOActualizar(datos) {
  return receptorRepository.guardarOActualizar(datos);
}

module.exports = {
  buscarPorDocumento,
  listar,
  guardarOActualizar
};
