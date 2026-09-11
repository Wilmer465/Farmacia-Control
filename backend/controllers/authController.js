const authService = require('../services/authService');
const { validarLogin } = require('../validators/authValidator');

function login(credenciales) {
  const { valido, errores } = validarLogin(credenciales);
  if (!valido) {
    return { ok: false, error: errores.join(' ') };
  }

  try {
    const usuario = authService.login(credenciales.username.trim(), credenciales.password);
    return { ok: true, data: usuario };
  } catch (err) {
    if (err instanceof authService.AuthError) {
      return { ok: false, error: err.message };
    }
    console.error('[authController.login] error inesperado:', err);
    return { ok: false, error: 'Error interno. Intente nuevamente.' };
  }
}

function logout(usuarioSesion) {
  try {
    authService.logout(usuarioSesion);
    return { ok: true };
  } catch (err) {
    console.error('[authController.logout] error inesperado:', err);
    return { ok: false, error: 'Error interno cerrando sesión.' };
  }
}

module.exports = { login, logout };
