'use strict';

const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024; // 10 MB de contenido binario
const MAX_NOMBRE = 255;

const MIME_PDF = 'application/pdf';
const MIMES_IMAGEN = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
});

class DocumentoInvalidoError extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'DocumentoInvalidoError';
  }
}

function esVacio(valor) {
  return valor === null || valor === undefined || valor === '';
}

function normalizarNombre(nombre) {
  if (esVacio(nombre)) {
    throw new DocumentoInvalidoError('El nombre del documento es obligatorio.');
  }
  if (typeof nombre !== 'string') {
    throw new DocumentoInvalidoError('El nombre del documento es inválido.');
  }

  const limpio = nombre.trim();
  if (!limpio) {
    throw new DocumentoInvalidoError('El nombre del documento es obligatorio.');
  }
  if (limpio.length > MAX_NOMBRE) {
    throw new DocumentoInvalidoError('El nombre del documento no puede superar 255 caracteres.');
  }
  if (/[\\/\u0000-\u001f\u007f]/.test(limpio)) {
    throw new DocumentoInvalidoError('El nombre del documento contiene caracteres no permitidos.');
  }
  return limpio;
}

function decodificarBase64(base64, maxBytes = MAX_DOCUMENTO_BYTES) {
  if (typeof base64 !== 'string') {
    throw new DocumentoInvalidoError('El contenido del documento es inválido.');
  }

  const limpio = base64.replace(/\s+/g, '');
  if (!limpio) {
    throw new DocumentoInvalidoError('El contenido del documento está vacío.');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(limpio)) {
    throw new DocumentoInvalidoError('El documento no está codificado en base64 válido.');
  }
  if (limpio.length % 4 === 1) {
    throw new DocumentoInvalidoError('El documento no está codificado en base64 válido.');
  }

  const sinPadding = limpio.replace(/=+$/, '');
  if (sinPadding.includes('=')) {
    throw new DocumentoInvalidoError('El documento no está codificado en base64 válido.');
  }

  const buffer = Buffer.from(limpio, 'base64');
  if (!buffer.length) {
    throw new DocumentoInvalidoError('El contenido del documento está vacío.');
  }
  if (buffer.length > maxBytes) {
    throw new DocumentoInvalidoError('El documento supera el tamaño máximo permitido (10 MB).');
  }
  if (buffer.toString('base64').replace(/=+$/, '') !== sinPadding) {
    throw new DocumentoInvalidoError('El documento no está codificado en base64 válido.');
  }

  return buffer;
}

// La extensión o el MIME declarados por el renderer no son confiables: el tipo
// real se deduce de los bytes. Así un SVG con script no puede hacerse pasar por
// PDF ni una imagen por un archivo ejecutable.
function detectarTipoPorFirma(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { tipo: 'PDF', mime: MIME_PDF, extension: 'pdf' };
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { tipo: 'IMAGEN', mime: 'image/png', extension: 'png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { tipo: 'IMAGEN', mime: 'image/jpeg', extension: 'jpg' };
  }
  const cabeceraGif = buffer.subarray(0, 6).toString('ascii');
  if (cabeceraGif === 'GIF87a' || cabeceraGif === 'GIF89a') {
    return { tipo: 'IMAGEN', mime: 'image/gif', extension: 'gif' };
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { tipo: 'IMAGEN', mime: 'image/webp', extension: 'webp' };
  }
  return null;
}

function normalizarTipoDeclarado(tipo) {
  if (esVacio(tipo)) return null;
  if (typeof tipo !== 'string') {
    throw new DocumentoInvalidoError('El tipo de documento es inválido.');
  }

  const valor = tipo.trim().toUpperCase();
  if (valor === 'PDF') return 'PDF';
  if (valor === 'IMAGEN') return 'IMAGEN';
  if (valor === MIME_PDF.toUpperCase()) return 'PDF';
  return null;
}

function validarCoincidenciaTipo(tipoDeclarado, tipoReal) {
  if (!tipoDeclarado) return tipoReal;
  if (tipoDeclarado !== tipoReal) {
    throw new DocumentoInvalidoError('El tipo del documento no coincide con su contenido.');
  }
  return tipoReal;
}

// Adjunto del catálogo CUM: viaja como base64 crudo en tres columnas separadas.
function normalizarDocumentoAdjunto(datos, opciones = {}) {
  const fuente = datos && typeof datos === 'object' ? datos : {};
  const nombre = fuente.documento_adjunto_nombre;
  const base64 = fuente.documento_adjunto_data;
  const tipo = fuente.documento_adjunto_tipo;

  if (esVacio(nombre) && esVacio(base64) && esVacio(tipo)) {
    return { nombre: null, base64: null, tipo: null, mime: null, extension: null };
  }

  if (esVacio(nombre) || esVacio(base64)) {
    throw new DocumentoInvalidoError('El documento adjunto está incompleto.');
  }

  const buffer = decodificarBase64(base64, opciones.maxBytes || MAX_DOCUMENTO_BYTES);
  const firma = detectarTipoPorFirma(buffer);
  if (!firma) {
    throw new DocumentoInvalidoError('El documento debe ser un PDF o una imagen PNG, JPEG, GIF o WebP.');
  }

  const tipoDeclarado = normalizarTipoDeclarado(tipo);
  const tipoReal = validarCoincidenciaTipo(tipoDeclarado, firma.tipo);
  if (tipoReal === 'PDF' && firma.mime !== MIME_PDF) {
    throw new DocumentoInvalidoError('El tipo del documento no coincide con su contenido.');
  }

  return {
    nombre: normalizarNombre(nombre),
    base64: buffer.toString('base64'),
    tipo: tipoReal,
    mime: firma.mime,
    extension: firma.extension
  };
}

// Adjunto de órdenes/receptores: el renderer lo entrega como data URL completa
// (resultado de FileReader), no como base64 crudo.
function normalizarAdjuntoOrden(datos, opciones = {}) {
  const fuente = datos && typeof datos === 'object' ? datos : {};
  const nombre = fuente.nombre;
  const dataUrl = fuente.data;
  const tipo = fuente.tipo;

  if (esVacio(nombre) && esVacio(dataUrl) && esVacio(tipo)) {
    return { nombre: null, data: null, tipo: null, mime: null, extension: null };
  }

  if (esVacio(nombre) || esVacio(dataUrl)) {
    throw new DocumentoInvalidoError('El documento adjunto está incompleto.');
  }
  if (typeof dataUrl !== 'string') {
    throw new DocumentoInvalidoError('El contenido del documento es inválido.');
  }

  const coincidencia = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!coincidencia) {
    throw new DocumentoInvalidoError('El documento debe adjuntarse como data URL base64.');
  }

  const mimeDeclarado = coincidencia[1].toLowerCase();
  const buffer = decodificarBase64(coincidencia[2], opciones.maxBytes || MAX_DOCUMENTO_BYTES);
  const firma = detectarTipoPorFirma(buffer);
  if (!firma) {
    throw new DocumentoInvalidoError('El documento debe ser un PDF o una imagen PNG, JPEG, GIF o WebP.');
  }

  if (firma.tipo === 'PDF') {
    if (mimeDeclarado !== MIME_PDF) {
      throw new DocumentoInvalidoError('El tipo del documento no coincide con su contenido.');
    }
  } else {
    const mimeEsperado = MIMES_IMAGEN[mimeDeclarado] ? firma.mime : null;
    if (!mimeEsperado || mimeEsperado !== firma.mime) {
      throw new DocumentoInvalidoError('El tipo del documento no coincide con su contenido.');
    }
  }

  const tipoDeclarado = normalizarTipoDeclarado(tipo);
  const tipoReal = validarCoincidenciaTipo(tipoDeclarado, firma.tipo);

  return {
    nombre: normalizarNombre(nombre),
    data: `data:${firma.mime};base64,${buffer.toString('base64')}`,
    tipo: tipoReal,
    mime: firma.mime,
    extension: firma.extension
  };
}

function extensionParaTipo(tipo) {
  if (String(tipo || '').toUpperCase() === 'PDF') return 'pdf';
  return 'png';
}

module.exports = {
  MAX_DOCUMENTO_BYTES,
  MAX_NOMBRE,
  MIME_PDF,
  MIMES_IMAGEN,
  DocumentoInvalidoError,
  decodificarBase64,
  detectarTipoPorFirma,
  extensionParaTipo,
  normalizarAdjuntoOrden,
  normalizarDocumentoAdjunto,
  normalizarNombre
};
