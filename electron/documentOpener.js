'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizarDocumentoAdjunto } = require('../shared/documentPolicy');

// Evita `window.open(dataUrl)` en el renderer: el archivo se materializa en una
// carpeta temporal con nombre generado por el proceso main y se entrega al
// visor del sistema. El nombre original nunca se usa como ruta.
async function abrirDocumentoTemporal(documento, opciones = {}) {
  const shell = opciones.shell;
  if (!shell || typeof shell.openPath !== 'function') {
    throw new Error('No se pudo abrir el documento.');
  }

  const normalizado = normalizarDocumentoAdjunto(documento, opciones);
  if (!normalizado.base64) {
    throw new Error('No hay documento adjunto para abrir.');
  }

  const directorioBase = opciones.directorioTemporal || os.tmpdir();
  const buffer = Buffer.from(normalizado.base64, 'base64');
  const directorio = await fs.promises.mkdtemp(path.join(directorioBase, 'farmacia-doc-'));
  const ruta = path.join(directorio, `documento.${normalizado.extension}`);

  await fs.promises.writeFile(ruta, buffer, { mode: 0o600, flag: 'wx' });

  const errorApertura = await shell.openPath(ruta);
  if (typeof errorApertura === 'string' && errorApertura.trim()) {
    throw new Error('No se pudo abrir el documento con la aplicación predeterminada.');
  }

  return {
    abierto: true,
    nombre: normalizado.nombre,
    tipo: normalizado.tipo
  };
}

module.exports = { abrirDocumentoTemporal };
