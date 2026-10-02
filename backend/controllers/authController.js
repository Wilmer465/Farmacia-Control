const authService = require('../services/authService');
const sessionService = require('../services/sessionService');
const { validarLogin } = require('../validators/authValidator');

// Contrato unificado HTTP: el `session_token` opaco del backend viaja como
// `access_token` y como `refresh_token` (mismo valor). 12 horas, alineado con
// el TTL de sessionService.
const EXPIRES_IN = 12 * 60 * 60;

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
      return { ok: false, error: err.message, code: err.code };
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

// --- Capa HTTP -------------------------------------------------------------
// Los handlers HTTP nunca exponen `session_token` dentro de `usuario`: viajan
// como `access_token` / `refresh_token` en el mismo nivel.

function construirPayloadHttp(usuarioConToken) {
  const { session_token, ...usuario } = usuarioConToken;
  return {
    access_token: session_token,
    refresh_token: session_token,
    expires_in: EXPIRES_IN,
    usuario
  };
}

function loginHttp(credenciales) {
  const { valido, errores } = validarLogin(credenciales || {});
  if (!valido) {
    return { ok: false, error: errores.join(' '), code: 'VALIDACION' };
  }

  const resultado = login(credenciales);
  if (!resultado.ok) {
    return resultado;
  }
  return { ok: true, data: construirPayloadHttp(resultado.data) };
}

function refreshHttp(token) {
  if (!token) {
    return { ok: false, error: 'Token de sesión faltante.', code: 'SIN_TOKEN' };
  }

  try {
    const usuario = sessionService.resolverUsuarioDesdeSesion({ session_token: token });
    // El token es opaco y no rota: renovate la misma sesion y se devuelve tal cual.
    sessionService.renovarSesion(token);
    return { ok: true, data: construirPayloadHttp(usuario) };
  } catch (err) {
    if (err instanceof sessionService.SesionError) {
      return { ok: false, error: err.message, code: 'SESION_INVALIDA' };
    }
    console.error('[authController.refreshHttp] error inesperado:', err);
    return { ok: false, error: 'Error interno. Intente nuevamente.' };
  }
}

function logoutHttp(token) {
  if (!token) {
    // Logout idempotente: sin token no hay nada que invalidar.
    return { ok: true };
  }

  try {
    // Se resuelve primero para conservar la traza de auditoria del cierre de sesion.
    const usuarioSesion = sessionService.resolverUsuarioDesdeSesion({ session_token: token });
    return logout(usuarioSesion);
  } catch (err) {
    if (err instanceof sessionService.SesionError) {
      // Sesion ya expirada o desconocida: se limpia igual y el logout es exitoso.
      sessionService.invalidar(token);
      return { ok: true };
    }
    console.error('[authController.logoutHttp] error inesperado:', err);
    return { ok: false, error: 'Error interno cerrando sesión.' };
  }
}

module.exports = { login, logout, EXPIRES_IN, loginHttp, refreshHttp, logoutHttp };
