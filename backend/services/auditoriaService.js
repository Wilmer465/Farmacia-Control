const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { ROLES } = require('../../shared/constants');

function listar(usuarioSesion, filtros = {}) {
  if (usuarioSesion.rol_nombre !== ROLES.SUPERADMIN) {
    throw new permisoService.PermisoError('Solo el Superadmin puede consultar la auditoría completa.');
  }
  return auditoriaRepository.findAll(filtros);
}

module.exports = { listar };
