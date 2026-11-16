'use strict';

// CSP del renderer. En desarrollo Vite necesita eval e inline para el HMR; en
// producción se eliminan ambos y se restringe todo al propio paquete local.
function crearContentSecurityPolicy({ isDev = false } = {}) {
  const comunes = [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    'worker-src \'self\''
  ];

  if (isDev) {
    return [
      ...comunes,
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' http://localhost:5173 http://127.0.0.1:5173 ws://localhost:5173 ws://127.0.0.1:5173"
    ].join('; ');
  }

  return [
    ...comunes,
    "script-src 'self'",
    "style-src 'self'",
    "connect-src 'self'"
  ].join('; ');
}

module.exports = { crearContentSecurityPolicy };
