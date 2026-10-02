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

// Solo ADMIN y SUPERADMIN gestionan el catálogo CUM (importar/actualizar/registrar manual).
const ROLES_ADMIN = [ROLES.SUPERADMIN, ROLES.ADMIN];

function verificarEsAdmin(usuarioSesion) {
  if (!usuarioSesion || !ROLES_ADMIN.includes(usuarioSesion.rol_nombre)) {
    throw new PermisoError('No tiene permisos para gestionar el catálogo CUM.');
  }
}

// Autorización para resolver (aprobar/rechazar) una solicitud de baja.
// SUPERADMIN resuelve en cualquier sede. ADMIN resuelve solo las de su propia sede
// —que es exactamente el alcance que la UI de Eliminaciones ya muestra, de modo que
// el botón visible y el servidor coinciden. La prohibición de aprobar la propia
// solicitud se aplica en el servicio de solicitudes, donde se conoce el solicitante.
function verificarResolucionEliminacion(usuarioSesion, solicitud) {
  if (!usuarioSesion) {
    throw new PermisoError('Sesión requerida.');
  }
  if (ROLES_VISION_GLOBAL.includes(usuarioSesion.rol_nombre)) return;
  if (usuarioSesion.rol_nombre !== ROLES.ADMIN) {
    throw new PermisoError('Solo el Superadmin o el Administrador de sede pueden resolver solicitudes de baja.');
  }
  if (Number(usuarioSesion.sede_id) !== Number(solicitud?.sede_id)) {
    throw new PermisoError('Solo puede resolver solicitudes de baja de su propia sede.');
  }
}

module.exports = {
  PermisoError,
  verificarEscrituraInventario,
  resolverSedeEfectiva,
  verificarPerteneceASede,
  verificarGestionOrdenes,
  verificarDespacho,
  verificarEsAdmin,
  verificarResolucionEliminacion
};
