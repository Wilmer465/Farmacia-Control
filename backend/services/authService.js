const path = require('path');
const { getDb } = require(path.join(__dirname, '..', 'database', 'connection'));
const bcrypt = require('bcryptjs');
const usuarioRepository = require('../repositories/usuarioRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const sessionService = require('./sessionService');
const { AUDIT_ACTIONS, ESTADOS_REGISTRO, ROLES } = require('../../shared/constants');

class AuthError extends Error {}

const MAX_INTENTOS = 5;
const TIEMPO_BLOQUEO_MS = 10 * 60 * 1000; // 10 minutos

function getDbConnection() {
  return getDb();
}

function verificarBloqueo(username) {
  const db = getDbConnection();
  const clave = username.toLowerCase().trim();
  const row = db.prepare('SELECT * FROM rate_limit_login WHERE username = ?').get(clave);
  if (!row) return;

  const ahora = Date.now();
  const primerIntento = new Date(row.primer_intento).getTime();
  if (ahora - primerIntento > TIEMPO_BLOQUEO_MS) {
    db.prepare('DELETE FROM rate_limit_login WHERE username = ?').run(clave);
    return;
  }

  if (row.intento_count >= MAX_INTENTOS) {
    const bloqueadoHasta = row.bloqueado_hasta ? new Date(row.bloqueado_hasta).getTime() : (primerIntento + TIEMPO_BLOQUEO_MS);
    const minutosRestantes = Math.ceil((bloqueadoHasta - ahora) / 60000);
    throw new AuthError(`Demasiados intentos fallidos. Por seguridad, la cuenta está temporalmente bloqueada por ${minutosRestantes} minuto(s).`);
  }
}

function registrarFallo(username) {
  const db = getDbConnection();
  const clave = username.toLowerCase().trim();
  const ahora = new Date().toISOString();
  const row = db.prepare('SELECT * FROM rate_limit_login WHERE username = ?').get(clave);

  if (!row) {
    db.prepare('INSERT INTO rate_limit_login (username, intento_count, primer_intento, ultimo_intento) VALUES (?, 1, ?, ?)')
      .run(clave, ahora, ahora);
  } else {
    const primerIntento = new Date(row.primer_intento).getTime();
    const ahoraMs = Date.now();
    if (ahoraMs - primerIntento > TIEMPO_BLOQUEO_MS) {
      // Ventana expirada, reiniciar contador
      db.prepare('UPDATE rate_limit_login SET intento_count = 1, primer_intento = ?, ultimo_intento = ? WHERE username = ?')
        .run(ahora, ahora, clave);
    } else {
      db.prepare('UPDATE rate_limit_login SET intento_count = intento_count + 1, ultimo_intento = ? WHERE username = ?')
        .run(ahora, clave);
    }
  }
}

function limpiarFallo(username) {
  const db = getDbConnection();
  const clave = username.toLowerCase().trim();
  db.prepare('DELETE FROM rate_limit_login WHERE username = ?').run(clave);
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
  const session_token = sessionService.crearSesion(usuario.id);
  return { ...usuarioSeguro, session_token };
}

function logout(usuarioSesion) {
  sessionService.invalidar(usuarioSesion?.session_token);
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