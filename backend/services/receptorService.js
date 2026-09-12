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

function actualizar(id, datos) {
  return receptorRepository.actualizar(id, datos);
}

module.exports = {
  buscarPorDocumento,
  listar,
  guardarOActualizar,
  actualizar
};
