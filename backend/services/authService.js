const path = require('path');
const { getDb } = require(path.join(__dirname, '..', 'database', 'connection'));
const bcrypt = require('bcryptjs');
const usuarioRepository = require('../repositories/usuarioRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const sessionService = require('./sessionService');
const { AUDIT_ACTIONS, ESTADOS_REGISTRO, ROLES } = require('../../shared/constants');

class AuthError extends Error {
  constructor(message, code = 'CREDENCIALES_INVALIDAS') {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const MAX_INTENTOS = 5;
const TIEMPO_BLOQUEO_MS = 10 * 60 * 1000; // 10 minutos
// Hash dummy con costo 12 para igualar el tiempo de bcrypt en usuarios
// inexistentes (mitiga oráculo de enumeración por timing).
const DUMMY_HASH = bcrypt.hashSync('credencial-dummy-para-timing-constante', 12);

function getDbConnection() {
  return getDb();
}

function verificarBloqueo(username) {
  const db = getDbConnection();
  const clave = String(username || '').toLowerCase().trim();
  if (!clave) return;
  const row = db.prepare('SELECT * FROM rate_limit_login WHERE username = ?').get(clave);
  if (!row) return;

  const ahora = Date.now();
  // Bloqueo explícito con progresión: si sigue vigente, se mantiene.
  if (row.bloqueado_hasta) {
    const hasta = new Date(row.bloqueado_hasta).getTime();
    if (Number.isFinite(hasta) && ahora < hasta) {
      const minutosRestantes = Math.max(1, Math.ceil((hasta - ahora) / 60000));
      throw new AuthError(`Demasiados intentos fallidos. Por seguridad, la cuenta está temporalmente bloqueada por ${minutosRestantes} minuto(s).`, 'CUENTA_BLOQUEADA');
    }
    // Bloqueo expirado: reiniciar ventana completa.
    db.prepare('DELETE FROM rate_limit_login WHERE username = ?').run(clave);
    return;
  }

  const primerIntento = new Date(row.primer_intento).getTime();
  if (ahora - primerIntento > TIEMPO_BLOQUEO_MS) {
    db.prepare('DELETE FROM rate_limit_login WHERE username = ?').run(clave);
    return;
  }

  if (row.intento_count >= MAX_INTENTOS) {
    // Primera vez que se alcanza el máximo: fijar bloqueo explícito progresivo
    // (10min * 2^reincidencias dentro de la ventana) para frenar fuerza bruta
    // lenta que antes se contentaba con 5 intentos/10min indefinidos.
    const reincidencias = Math.max(0, row.intento_count - MAX_INTENTOS);
    const duracion = TIEMPO_BLOQUEO_MS * Math.pow(2, Math.min(reincidencias, 4));
    const hasta = new Date(ahora + duracion).toISOString();
    db.prepare('UPDATE rate_limit_login SET bloqueado_hasta = ?, ultimo_intento = ? WHERE username = ?')
      .run(hasta, new Date(ahora).toISOString(), clave);
    const minutos = Math.max(1, Math.ceil(duracion / 60000));
    throw new AuthError(`Demasiados intentos fallidos. Por seguridad, la cuenta está temporalmente bloqueada por ${minutos} minuto(s).`, 'CUENTA_BLOQUEADA');
  }
}

function registrarFallo(username) {
  const db = getDbConnection();
  const clave = String(username || '').toLowerCase().trim();
  if (!clave) return;
  const ahora = new Date().toISOString();
  const row = db.prepare('SELECT * FROM rate_limit_login WHERE username = ?').get(clave);

  if (!row) {
    db.prepare('INSERT INTO rate_limit_login (username, intento_count, primer_intento, ultimo_intento) VALUES (?, 1, ?, ?)')
      .run(clave, ahora, ahora);
  } else {
    // Si hay bloqueo vigente, cada fallo adicional alarga la progresión.
    if (row.bloqueado_hasta && Date.now() < new Date(row.bloqueado_hasta).getTime()) {
      const reincidencias = Math.max(0, row.intento_count - MAX_INTENTOS + 1);
      const duracion = TIEMPO_BLOQUEO_MS * Math.pow(2, Math.min(reincidencias, 4));
      const hasta = new Date(Date.now() + duracion).toISOString();
      db.prepare('UPDATE rate_limit_login SET intento_count = intento_count + 1, ultimo_intento = ?, bloqueado_hasta = ? WHERE username = ?')
        .run(ahora, hasta, clave);
      return;
    }
    const primerIntento = new Date(row.primer_intento).getTime();
    const ahoraMs = Date.now();
    if (ahoraMs - primerIntento > TIEMPO_BLOQUEO_MS) {
      // Ventana expirada, reiniciar contador
      db.prepare('UPDATE rate_limit_login SET intento_count = 1, primer_intento = ?, ultimo_intento = ?, bloqueado_hasta = NULL WHERE username = ?')
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
    // Comparación dummy para no distinguir por tiempo entre "no existe" y
    // "clave errónea" (~100ms de bcrypt): el oráculo de enumeración queda ciego.
    try {
      bcrypt.compareSync(String(password || ''), DUMMY_HASH);
    } catch (_) { /* ignorar: solo consume tiempo constante */ }
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
    throw new AuthError('El usuario no tiene una sede asignada. Contacte al administrador.', 'SEDE_NO_ASIGNADA');
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