export const ROLES = Object.freeze({
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',
  INVENTARIO: 'INVENTARIO',
  USUARIO: 'USUARIO',
} as const);

export type Role = typeof ROLES[keyof typeof ROLES];

export const ROLES_ESCRITURA_INVENTARIO: Role[] = [ROLES.SUPERADMIN, ROLES.INVENTARIO];
export const ROLES_GESTION_ORDENES: Role[] = [ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.INVENTARIO];
export const ROLES_DESPACHO: Role[] = [ROLES.SUPERADMIN, ROLES.INVENTARIO];
export const ROLES_ADMIN_CUM: Role[] = [ROLES.SUPERADMIN, ROLES.ADMIN];
export const ROLES_VISION_GLOBAL: Role[] = [ROLES.SUPERADMIN];

export function puedeEscribirInventario(rol: Role): boolean {
  return ROLES_ESCRITURA_INVENTARIO.includes(rol);
}

export function puedeGestionarOrdenes(rol: Role): boolean {
  return ROLES_GESTION_ORDENES.includes(rol);
}

export function puedeDespachar(rol: Role): boolean {
  return ROLES_DESPACHO.includes(rol);
}

export function esAdminCum(rol: Role): boolean {
  return ROLES_ADMIN_CUM.includes(rol);
}

export function tieneVisionGlobal(rol: Role): boolean {
  return ROLES_VISION_GLOBAL.includes(rol);
}