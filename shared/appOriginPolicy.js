'use strict';

const path = require('node:path');
const { URL, fileURLToPath } = require('node:url');

const PUERTO_DEV = '5173';
const HOSTS_DEV = new Set(['localhost', '127.0.0.1', '[::1]']);

function normalizarRuta(ruta) {
  const resuelta = path.resolve(String(ruta));
  // Windows compara rutas sin distinguir mayúsculas; en otros sistemas el
  // sistema de archivos sí distingue y no se debe relajar la comparación.
  return process.platform === 'win32' ? resuelta.toLowerCase() : resuelta;
}

function esUrlDevPermitida(url) {
  if (url.protocol !== 'http:') return false;
  if (!HOSTS_DEV.has(url.hostname)) return false;
  if (url.port !== PUERTO_DEV) return false;
  return true;
}

function esUrlArchivoPermitida(url, rendererIndexPath) {
  if (url.protocol !== 'file:') return false;
  if (!rendererIndexPath) return false;

  let ruta;
  try {
    ruta = fileURLToPath(url);
  } catch {
    return false;
  }

  return normalizarRuta(ruta) === normalizarRuta(rendererIndexPath);
}

// Política única para validar el remitente de un mensaje IPC y las navegaciones
// del renderer. En desarrollo solo se acepta el servidor de Vite; en producción
// solo el index.html empaquetado. Cualquier otra URL falla cerrado.
function esOrigenPermitido(url, opciones = {}) {
  if (typeof url !== 'string' || !url.trim()) return false;

  let parseada;
  try {
    parseada = new URL(url);
  } catch {
    return false;
  }

  if (opciones.isDev === true) {
    return esUrlDevPermitida(parseada);
  }

  return esUrlArchivoPermitida(parseada, opciones.rendererIndexPath);
}

module.exports = {
  PUERTO_DEV,
  esOrigenPermitido,
  esUrlArchivoPermitida,
  esUrlDevPermitida,
  normalizarRuta
};
