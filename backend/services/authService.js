const bcrypt = require('bcryptjs');
const usuarioRepository = require('../repositories/usuarioRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const { AUDIT_ACTIONS, ESTADOS_REGISTRO, ROLES } = require('../../shared/constants');

class AuthError extends Error {}

// Protección contra ataques de fuerza bruta en login local:
// Máximo 5 intentos fallidos dentro de una ventana de 10 minutos.
const INTENTOS_FALLIDOS = new Map();
const MAX_INTENTOS = 5;
const TIEMPO_BLOQUEO_MS = 10 * 60 * 1000;

function verificarBloqueo(username) {
  const clave = username.toLowerCase().trim();
  const registro = INTENTOS_FALLIDOS.get(clave);
  if (!registro) return;

  const ahora = Date.now();
  if (ahora - registro.primerIntento > TIEMPO_BLOQUEO_MS) {
    INTENTOS_FALLIDOS.delete(clave);
    return;
  }

  if (registro.conteo >= MAX_INTENTOS) {
    const minutosRestantes = Math.ceil((TIEMPO_BLOQUEO_MS - (ahora - registro.primerIntento)) / 60000);
    throw new AuthError(`Demasiados intentos fallidos. Por seguridad, la cuenta está temporalmente bloqueada por ${minutosRestantes} minuto(s).`);
  }
}

function registrarFallo(username) {
  const clave = username.toLowerCase().trim();
  const ahora = Date.now();
  const registro = INTENTOS_FALLIDOS.get(clave);

  if (!registro || (ahora - registro.primerIntento > TIEMPO_BLOQUEO_MS)) {
    INTENTOS_FALLIDOS.set(clave, { conteo: 1, primerIntento: ahora });
  } else {
    registro.conteo += 1;
  }
}

function limpiarFallo(username) {
  const clave = username.toLowerCase().trim();
  INTENTOS_FALLIDOS.delete(clave);
}

function login(username, password) {
  const nombreLimpio = String(username || '').trim();
  verificarBloqueo(nombreLimpio);

  const usuario = usuarioRepository.findByUsername(nombreLimpio);

  if (!usuario || usuario.estado !== ESTADOS_REGISTRO.ACTIVO) {
    registrarFallo(nombreLimpio);
    auditoriaRepository.registrar({
      usuario_id: usuario ? usuario.id : null,
      rol: usuario ? usuario.rol_nombre : null,
      sede_id: usuario ? usuario.sede_id : null,
      accion: AUDIT_ACTIONS.LOGIN_FALLIDO,
      modulo: 'AUTH',
      registro_afectado: nombreLimpio,
      resultado: 'FALLIDO'
    });
    throw new AuthError('Usuario o contraseña incorrectos.');
  }

  const passwordValida = bcrypt.compareSync(password, usuario.password_hash);
  if (!passwordValida) {
    registrarFallo(nombreLimpio);
    auditoriaRepository.registrar({
      usuario_id: usuario.id,
      rol: usuario.rol_nombre,
      sede_id: usuario.sede_id,
      accion: AUDIT_ACTIONS.LOGIN_FALLIDO,
      modulo: 'AUTH',
      registro_afectado: nombreLimpio,
      resultado: 'FALLIDO'
    });
    throw new AuthError('Usuario o contraseña incorrectos.');
  }

  // Regla: solo SUPERADMIN puede tener sede_id NULL (acceso global). Cualquier otro rol sin sede es un dato corrupto.
  if (usuario.rol_nombre !== ROLES.SUPERADMIN && !usuario.sede_id) {
    throw new AuthError('El usuario no tiene una sede asignada. Contacte al administrador.');
  }

  limpiarFallo(nombreLimpio);

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
