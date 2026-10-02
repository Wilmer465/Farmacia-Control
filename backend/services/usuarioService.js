const bcrypt = require('bcryptjs');
const usuarioRepository = require('../repositories/usuarioRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const { getDb } = require('../database/connection');
const { AUDIT_ACTIONS, ROLES, ESTADOS_REGISTRO } = require('../../shared/constants');

class UsuarioError extends Error {}

function verificarAccesoWilmer(usuarioSesion) {
  if (!usuarioSesion) {
    throw new UsuarioError('Sesión requerida.');
  }
  // SEGURIDAD: usuarioSesion viene de resolverUsuarioDesdeSesion() que carga el
  // usuario desde la BD en main usando solo el token opaco. Nunca se confía en
  // rol_nombre/username que mande el renderer. La autorización exige el flag
  // es_superadmin_principal=1 en BD + rol SUPERADMIN vigente.
  const esPrincipal = Number(usuarioSesion.es_superadmin_principal) === 1;
  if (!esPrincipal || usuarioSesion.rol_nombre !== ROLES.SUPERADMIN) {
    throw new UsuarioError('Acceso denegado: solo el superadministrador principal puede gestionar usuarios.');
  }
}

function listar(usuarioSesion, filtros = {}) {
  verificarAccesoWilmer(usuarioSesion);
  return usuarioRepository.listar({ incluirEliminados: Boolean(filtros?.incluirEliminados) });
}

function listarRoles(usuarioSesion) {
  verificarAccesoWilmer(usuarioSesion);
  return usuarioRepository.listarRoles();
}

function crear(usuarioSesion, datos) {
  verificarAccesoWilmer(usuarioSesion);
  const { nombre, username, password, rol_id, sede_id } = datos || {};

  if (!nombre || !nombre.trim()) throw new UsuarioError('El nombre completo es requerido.');
  if (!username || !username.trim()) throw new UsuarioError('El nombre de usuario es requerido.');
  if (!password || password.length < 8) throw new UsuarioError('La contraseña debe tener al menos 8 caracteres.');
  if (!rol_id) throw new UsuarioError('Debe seleccionar un rol.');

  const usernameLimpio = username.trim();
  const existente = usuarioRepository.findByUsername(usernameLimpio);
  if (existente) {
    throw new UsuarioError(`El nombre de usuario '${usernameLimpio}' ya existe.`);
  }

  const password_hash = bcrypt.hashSync(password, 12);
  const nuevo = usuarioRepository.crear({
    nombre: nombre.trim(),
    username: usernameLimpio,
    password_hash,
    rol_id: Number(rol_id),
    sede_id: sede_id ? Number(sede_id) : null,
    estado: ESTADOS_REGISTRO.ACTIVO
  });

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: usuarioSesion.sede_id,
    accion: AUDIT_ACTIONS.CREAR_USUARIO || 'CREAR_USUARIO',
    modulo: 'USUARIOS',
    registro_afectado: nuevo.username,
    resultado: 'EXITO',
    valores_nuevos: JSON.stringify({ id: nuevo.id, username: nuevo.username, rol: nuevo.rol_nombre })
  });

  const { password_hash: _, ...seguro } = nuevo;
  return seguro;
}

function actualizar(usuarioSesion, id, datos) {
  verificarAccesoWilmer(usuarioSesion);
  const usuario = usuarioRepository.findById(id);
  if (!usuario) throw new UsuarioError('Usuario no encontrado.');

  const { nombre, rol_id, sede_id, estado, password } = datos || {};
  if (!nombre || !nombre.trim()) throw new UsuarioError('El nombre es requerido.');
  if (!rol_id) throw new UsuarioError('El rol es requerido.');

  // No permitir cambiar rol ni desactivar la cuenta principal (flag en BD, con
  // fallback a username para BDs legadas donde la migración 020 aún no corrió).
  const esCuentaPrincipal = Number(usuario.es_superadmin_principal) === 1
    || String(usuario.username || '').toLowerCase() === 'wilmer';
  if (esCuentaPrincipal) {
    if (estado === ESTADOS_REGISTRO.INACTIVO) {
      throw new UsuarioError('No puedes desactivar tu propia cuenta principal de Superadmin.');
    }
    if (Number(rol_id) !== Number(usuario.rol_id)) {
      throw new UsuarioError('No puedes cambiar tu propio rol de Superadministrador.');
    }
  }

  let password_hash = undefined;
  if (password && password.trim()) {
    if (password.length < 8) throw new UsuarioError('La contraseña debe tener al menos 8 caracteres.');
    password_hash = bcrypt.hashSync(password, 12);
  }

  const actualizado = usuarioRepository.actualizar(id, {
    nombre: nombre.trim(),
    rol_id: Number(rol_id),
    sede_id: sede_id ? Number(sede_id) : null,
    estado: estado || usuario.estado,
    password_hash
  });

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: usuarioSesion.sede_id,
    accion: 'ACTUALIZAR_USUARIO',
    modulo: 'USUARIOS',
    registro_afectado: actualizado.username,
    resultado: 'EXITO',
    valores_anteriores: JSON.stringify({ nombre: usuario.nombre, rol_id: usuario.rol_id, estado: usuario.estado }),
    valores_nuevos: JSON.stringify({ nombre: actualizado.nombre, rol_id: actualizado.rol_id, estado: actualizado.estado })
  });

  const { password_hash: _, ...seguro } = actualizado;
  return seguro;
}

function cambiarEstado(usuarioSesion, id, nuevoEstado) {
  verificarAccesoWilmer(usuarioSesion);
  const usuario = usuarioRepository.findById(id);
  if (!usuario) throw new UsuarioError('Usuario no encontrado.');

  if (Number(usuario.es_superadmin_principal) === 1
    || String(usuario.username || '').toLowerCase() === 'wilmer') {
    throw new UsuarioError('No puedes cambiar el estado de la cuenta principal Wilmer.');
  }

  const actualizado = usuarioRepository.cambiarEstado(id, nuevoEstado);
  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: usuarioSesion.sede_id,
    accion: nuevoEstado === 'ACTIVO' ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO',
    modulo: 'USUARIOS',
    registro_afectado: actualizado.username,
    resultado: 'EXITO'
  });

  const { password_hash: _, ...seguro } = actualizado;
  return seguro;
}

// ELIMINACIÓN DEFINITIVA DE UN TRABAJADOR.
//
// Anonimiza la fila en lugar de borrarla, conservando auditoría, órdenes,
// despachos y aprobaciones. Mismas protecciones que cambiarEstado: la cuenta
// principal Wilmer no se toca y nadie se elimina a sí mismo — borrarse sería dejar
// el sistema sin su único administrador principal, sin vuelta atrás.
//
// No hace falta invalidar sesiones a mano: `authService.login` rechaza estado
// != ACTIVO y `sessionService.resolverUsuarioDesdeSesion` relee el usuario de la
// base en cada petición y destruye la sesión si ya no está ACTIVO. Anonimizar con
// estado = ELIMINADO corta el acceso por sí solo (puntos 7 y 8 del plan).
function eliminarDefinitivo(usuarioSesion, id) {
  verificarAccesoWilmer(usuarioSesion);

  const idObjetivo = Number(id);
  if (!Number.isInteger(idObjetivo) || idObjetivo <= 0) {
    throw new UsuarioError('Usuario no encontrado.');
  }

  // Prohibido el auto-borrado: se comprueba ANTES de tocar nada, para que el error
  // no dependa de haber ya escrito en la base.
  if (Number(usuarioSesion.id) === idObjetivo) {
    throw new UsuarioError('No puedes eliminar tu propia cuenta.');
  }

  const usuario = usuarioRepository.findById(idObjetivo);
  if (!usuario) throw new UsuarioError('Usuario no encontrado.');

  const esCuentaPrincipal = Number(usuario.es_superadmin_principal) === 1
    || String(usuario.username || '').toLowerCase() === 'wilmer';
  if (esCuentaPrincipal) {
    throw new UsuarioError('No puedes eliminar la cuenta principal del Superadmin.');
  }

  if (usuario.estado === ESTADOS_REGISTRO.ELIMINADO) {
    throw new UsuarioError('El usuario ya fue eliminado anteriormente.');
  }

  // La auditoría registra QUÉ registro se eliminó (id, rol, sede, estado previo),
  // no el nombre ni el username: copiar aquí los identificadores personales
  // dejaría la anonimización sin efecto, porque los datos seguirían legibles.
  const anterior = {
    id: usuario.id,
    rol: usuario.rol_nombre,
    sede: usuario.sede_nombre,
    estado: usuario.estado
  };

  // Anonimización y auditoría van en la MISMA transacción. Si la auditoría
  // fallara después del UPDATE, quedaría un usuario anonimizado sin rastro de por
  // qué — justo la trazabilidad que el plan exige para toda baja. better-sqlite3
  // anida la transacción interna del repositorio con esta mediante savepoints, así
  // que el rollback sigue siendo completo.
  const db = getDb();
  const tx = db.transaction(() => {
    const eliminado = usuarioRepository.eliminarDefinitivo(idObjetivo, { usuarioId: usuarioSesion.id });

    auditoriaRepository.registrar({
      usuario_id: usuarioSesion.id,
      rol: usuarioSesion.rol_nombre,
      sede_id: usuarioSesion.sede_id,
      accion: AUDIT_ACTIONS.ELIMINAR_USUARIO,
      modulo: 'USUARIOS',
      registro_afectado: `usuario:${idObjetivo}`,
      resultado: 'EXITO',
      valores_anteriores: JSON.stringify(anterior),
      valores_nuevos: JSON.stringify({ id: eliminado.id, estado: eliminado.estado, eliminado_en: eliminado.eliminado_en })
    });

    return eliminado;
  });

  const eliminado = tx();

  const { password_hash: _, ...seguro } = eliminado;
  return seguro;
}

module.exports = {
  UsuarioError,
  listar,
  listarRoles,
  crear,
  actualizar,
  cambiarEstado,
  eliminarDefinitivo
};
