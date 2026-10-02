const sessionService = require('../services/sessionService');

// El cliente movil (y cualquier otro consumidor HTTP) manda el token opaco como
// `Authorization: Bearer <session_token>`. Se acepta tambien el token en el body
// para los clientes que no pueden fijaar cabeceras (login/refresh/logout).
function obtenerToken(req) {
  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() || null;
  }
  const body = req.body || {};
  return body.session_token || body.refresh_token || body.access_token || null;
}

// Valida el token contra el mismo sessionService que usa IPC, de modo que una
// sesion creada desde el escritorio Electron tambien sirve en la app movil.
function conSesionHttp(req, res, next) {
  const token = obtenerToken(req);
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'Sesión de usuario inválida: token faltante.',
      code: 'SIN_TOKEN'
    });
  }

  try {
    req.tokenSesion = token;
    req.usuarioSesion = sessionService.resolverUsuarioDesdeSesion({ session_token: token });
    return next();
  } catch (err) {
    if (err instanceof sessionService.SesionError) {
      return res.status(401).json({ ok: false, error: err.message, code: 'SESION_INVALIDA' });
    }
    console.error('[authHttp] error inesperado al resolver la sesión:', err);
    return res.status(500).json({ ok: false, error: 'Error interno. Intente nuevamente.' });
  }
}

module.exports = { obtenerToken, conSesionHttp };
