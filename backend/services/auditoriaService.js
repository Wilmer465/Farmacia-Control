const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { ROLES } = require('../../shared/constants');

function listar(usuarioSesion, filtros = {}) {
  if (![ROLES.SUPERADMIN, ROLES.ADMIN].includes(usuarioSesion.rol_nombre)) {
    throw new permisoService.PermisoError('No tiene permisos para consultar la auditoría.');
  }
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, filtros.sedeId);
  return auditoriaRepository.findAll({
    ...filtros,
    sedeId: sedeEfectiva
  });
}

module.exports = { listar };
