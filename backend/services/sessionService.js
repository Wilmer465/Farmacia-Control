const crypto = require('crypto');
const usuarioRepository = require('../repositories/usuarioRepository');
const { ESTADOS_REGISTRO } = require('../../shared/constants');

class SesionError extends Error {}

const sesiones = new Map();
const TTL_MS = 12 * 60 * 60 * 1000;

function crearSesion(usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  sesiones.set(token, { usuarioId, creadoEn: Date.now() });
  return token;
}

function invalidar(token) {
  if (token) sesiones.delete(token);
}

function resolverUsuarioDesdeSesion(usuarioSesion) {
  if (!usuarioSesion || typeof usuarioSesion !== 'object') {
    throw new SesionError('Sesión de usuario inválida.');
  }
  const token = usuarioSesion.session_token;
  if (!token || typeof token !== 'string') {
    throw new SesionError('Sesión de usuario inválida: token faltante.');
  }

  const sesion = sesiones.get(token);
  if (!sesion) {
    throw new SesionError('Sesión expirada o inválida. Inicie sesión de nuevo.');
  }
  if (Date.now() - sesion.creadoEn > TTL_MS) {
    sesiones.delete(token);
    throw new SesionError('Sesión expirada. Inicie sesión de nuevo.');
  }

  const usuario = usuarioRepository.findById(sesion.usuarioId);
  if (!usuario || usuario.estado !== ESTADOS_REGISTRO.ACTIVO) {
    sesiones.delete(token);
    throw new SesionError('La cuenta no está activa.');
  }

  const { password_hash, ...seguro } = usuario;
  return { ...seguro, session_token: token };
}

module.exports = {
  SesionError,
  crearSesion,
  invalidar,
  resolverUsuarioDesdeSesion
};
