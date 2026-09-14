const usuarioService = require('../services/usuarioService');

function manejarError(err) {
  if (err instanceof usuarioService.UsuarioError) {
    return { ok: false, error: err.message };
  }
  console.error('[usuarioController] error inesperado:', err);
  return { ok: false, error: 'Error interno en el servidor.' };
}

function listar(usuarioSesion) {
  try {
    return { ok: true, data: usuarioService.listar(usuarioSesion) };
  } catch (err) {
    return manejarError(err);
  }
}

function listarRoles(usuarioSesion) {
  try {
    return { ok: true, data: usuarioService.listarRoles(usuarioSesion) };
  } catch (err) {
    return manejarError(err);
  }
}

function crear(usuarioSesion, data) {
  try {
    return { ok: true, data: usuarioService.crear(usuarioSesion, data) };
  } catch (err) {
    return manejarError(err);
  }
}

function actualizar(usuarioSesion, id, data) {
  try {
    return { ok: true, data: usuarioService.actualizar(usuarioSesion, id, data) };
  } catch (err) {
    return manejarError(err);
  }
}

function cambiarEstado(usuarioSesion, id, estado) {
  try {
    return { ok: true, data: usuarioService.cambiarEstado(usuarioSesion, id, estado) };
  } catch (err) {
    return manejarError(err);
  }
}

module.exports = {
  listar,
  listarRoles,
  crear,
  actualizar,
  cambiarEstado
};
