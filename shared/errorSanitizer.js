'use strict';

// Los mensajes que cruzan IPC pueden terminar en la interfaz. Un error crudo de
// SQLite, Node o del sistema revela rutas internas, nombres de tablas y detalles
// de implementación que no aportan nada al usuario y facilitan el reconocimiento
// del entorno. Este módulo decide qué texto es apto para mostrarse.
const FALLBACK_POR_DEFECTO = 'Error interno. Intente nuevamente.';
const MAX_LONGITUD = 300;

const PATRONES_INSEGUROS = Object.freeze([
  /[A-Za-z]:[\\/]/, // rutas Windows (C:\...)
  /\\\\[^\\\s]+\\/, // rutas UNC (\\servidor\recurso)
  /\/(?:home|users|var|tmp|opt|app|srv)\//i, // rutas POSIX habituales
  /\bnode_modules\b/i,
  /\bbetter-sqlite3\b/i,
  /\bNODE_MODULE_VERSION\b/i,
  /\bERR_DLOPEN_FAILED\b/,
  /\bSqliteError\b/,
  /\bSQLITE_[A-Z_]+\b/,
  /\bno such (?:table|column|index|trigger|view)\b/i,
  /\bsyntax error\b/i,
  /\bconstraint failed\b/i,
  /\bdatabase is locked\b/i,
  /\bdatatype mismatch\b/i,
  /\bdisk I\/O error\b/i,
  /\b(?:ENOENT|EACCES|EPERM)\b/,
  /\bCannot read propert(?:y|ies)\b/i,
  /\bis not a function\b/i,
  /\b(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}\b(?:FROM|INTO|SET|WHERE)\b/i,
  /\bat\s+\S+\s+\(/, // marco de pila con función
  /^\s*at\s+/m // marco de pila anónimo
]);

function limpiarTexto(texto) {
  return String(texto)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LONGITUD);
}

function mensajeSeguro(error, fallback = FALLBACK_POR_DEFECTO) {
  const mensaje = typeof error === 'string'
    ? error
    : (error && typeof error.message === 'string' ? error.message : '');

  if (!mensaje) return fallback;

  const limpio = limpiarTexto(mensaje);
  if (!limpio) return fallback;
  if (PATRONES_INSEGUROS.some((patron) => patron.test(limpio))) return fallback;
  return limpio;
}

// Los controladores suelen capturar la excepción y devolver { ok:false, error }.
// El envoltorio IPC sanea también ese contrato para no depender de que cada
// controlador recuerde hacerlo.
function sanearRespuesta(resultado, fallback = FALLBACK_POR_DEFECTO) {
  if (!resultado || typeof resultado !== 'object' || Array.isArray(resultado)) {
    return resultado;
  }
  if (resultado.ok !== false || typeof resultado.error !== 'string') {
    return resultado;
  }
  const seguro = mensajeSeguro(resultado.error, fallback);
  if (seguro === resultado.error) return resultado;
  return { ...resultado, error: seguro };
}

module.exports = {
  FALLBACK_POR_DEFECTO,
  MAX_LONGITUD,
  mensajeSeguro,
  sanearRespuesta
};
