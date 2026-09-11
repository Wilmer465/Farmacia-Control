const bcrypt = require('bcryptjs');
const usuarioRepository = require('../repositories/usuarioRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const { AUDIT_ACTIONS, ESTADOS_REGISTRO, ROLES } = require('../../shared/constants');

class AuthError extends Error {}

function login(username, password) {
  const usuario = usuarioRepository.findByUsername(username);

  if (!usuario || usuario.estado !== ESTADOS_REGISTRO.ACTIVO) {
    auditoriaRepository.registrar({
      usuario_id: usuario ? usuario.id : null,
      rol: usuario ? usuario.rol_nombre : null,
      sede_id: usuario ? usuario.sede_id : null,
      accion: AUDIT_ACTIONS.LOGIN_FALLIDO,
      modulo: 'AUTH',
      registro_afectado: username,
      resultado: 'FALLIDO'
    });
    throw new AuthError('Usuario o contraseña incorrectos.');
  }

  const passwordValida = bcrypt.compareSync(password, usuario.password_hash);
  if (!passwordValida) {
    auditoriaRepository.registrar({
      usuario_id: usuario.id,
      rol: usuario.rol_nombre,
      sede_id: usuario.sede_id,
      accion: AUDIT_ACTIONS.LOGIN_FALLIDO,
      modulo: 'AUTH',
      registro_afectado: username,
      resultado: 'FALLIDO'
    });
    throw new AuthError('Usuario o contraseña incorrectos.');
  }

  // Regla: solo SUPERADMIN puede tener sede_id NULL (acceso global). Cualquier otro rol sin sede es un dato corrupto.
  if (usuario.rol_nombre !== ROLES.SUPERADMIN && !usuario.sede_id) {
    throw new AuthError('El usuario no tiene una sede asignada. Contacte al administrador.');
  }

  auditoriaRepository.registrar({
    usuario_id: usuario.id,
    rol: usuario.rol_nombre,
    sede_id: usuario.sede_id,
    accion: AUDIT_ACTIONS.LOGIN,
    modulo: 'AUTH',
    registro_afectado: usuario.username,
    resultado: 'EXITO'
  });

  const { password_hash, ...usuarioSeguro } = usuario;
  return usuarioSeguro;
}

function logout(usuarioSesion) {
  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: usuarioSesion.sede_id,
    accion: AUDIT_ACTIONS.LOGOUT,
    modulo: 'AUTH',
    registro_afectado: usuarioSesion.username,
    resultado: 'EXITO'
  });
  return true;
}

module.exports = { login, logout, AuthError };
