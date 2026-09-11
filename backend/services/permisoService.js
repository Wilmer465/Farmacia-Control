const { ROLES } = require('../../shared/constants');

class PermisoError extends Error {}

// Roles que pueden escribir en inventario (crear/editar medicamentos y lotes).
const ROLES_ESCRITURA_INVENTARIO = [ROLES.SUPERADMIN, ROLES.INVENTARIO];

// Roles que pueden ver todas las sedes sin filtro.
const ROLES_VISION_GLOBAL = [ROLES.SUPERADMIN];

function verificarEscrituraInventario(usuarioSesion) {
  if (!usuarioSesion || !ROLES_ESCRITURA_INVENTARIO.includes(usuarioSesion.rol_nombre)) {
    throw new PermisoError('No tiene permisos para modificar el inventario.');
  }
}

// Determina la sede efectiva sobre la que puede operar/consultar el usuario.
// Si es visión global y no pide una sede específica -> null (sin filtro, ve todas).
// Si pide una sede específica siendo visión global -> se respeta.
// Si NO es visión global -> se fuerza su propia sede, ignorando cualquier sede_id que venga del frontend.
function resolverSedeEfectiva(usuarioSesion, sedeIdSolicitada) {
  if (ROLES_VISION_GLOBAL.includes(usuarioSesion.rol_nombre)) {
    return sedeIdSolicitada ?? null;
  }
  return usuarioSesion.sede_id;
}

function verificarPerteneceASede(usuarioSesion, sedeIdRegistro) {
  if (ROLES_VISION_GLOBAL.includes(usuarioSesion.rol_nombre)) return;
  if (usuarioSesion.sede_id !== sedeIdRegistro) {
    throw new PermisoError('No tiene acceso a esta sede.');
  }
}

// Roles que pueden crear/confirmar/cancelar órdenes en su sede
const ROLES_GESTION_ORDENES = [ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.INVENTARIO];

function verificarGestionOrdenes(usuarioSesion) {
  if (!usuarioSesion || !ROLES_GESTION_ORDENES.includes(usuarioSesion.rol_nombre)) {
    throw new PermisoError('No tiene permisos para gestionar órdenes.');
  }
}

// Solo INVENTARIO y SUPERADMIN despachan (sección 4: ADMIN gestiona órdenes, no despacha).
const ROLES_DESPACHO = [ROLES.SUPERADMIN, ROLES.INVENTARIO];

function verificarDespacho(usuarioSesion) {
  if (!usuarioSesion || !ROLES_DESPACHO.includes(usuarioSesion.rol_nombre)) {
    throw new PermisoError('No tiene permisos para despachar medicamentos.');
  }
}

module.exports = {
  PermisoError,
  verificarEscrituraInventario,
  resolverSedeEfectiva,
  verificarPerteneceASede,
  verificarGestionOrdenes,
  verificarDespacho
};
