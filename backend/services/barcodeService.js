// Servicio de parseo de códigos de barras para medicamentos
// Soporta: EAN-8, EAN-13, EAN-14, UPC-A, UPC-E, Code 128, GS1-128, DataMatrix, GS1 DataMatrix

class BarcodeParseError extends Error {}

function limpiarCodigo(raw) {
  if (!raw) return '';
  return String(raw).trim().replace(/[\r\n\t\s]+/g, '');
}

function esSoloNumeros(str) {
  return /^\d+$/.test(str);
}

function calcularCheckEAN13(codigo12) {
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const digito = parseInt(codigo12[i], 10);
    suma += (i % 2 === 0) ? digito : digito * 3;
  }
  const check = (10 - (suma % 10)) % 10;
  return check;
}

function validarEAN13(codigo) {
  if (codigo.length !== 13 || !esSoloNumeros(codigo)) return false;
  return calcularCheckEAN13(codigo.slice(0, 12)) === parseInt(codigo[12], 10);
}

function validarEAN8(codigo) {
  if (codigo.length !== 8 || !esSoloNumeros(codigo)) return false;
  let suma = 0;
  for (let i = 0; i < 7; i++) {
    const digito = parseInt(codigo[i], 10);
    suma += (i % 2 === 0) ? digito * 3 : digito;
  }
  const check = (10 - (suma % 10)) % 10;
  return check === parseInt(codigo[7], 10);
}

function validarUPCA(codigo) {
  if (codigo.length !== 12 || !esSoloNumeros(codigo)) return false;
  return calcularCheckEAN13(codigo.slice(0, 11)) === parseInt(codigo[11], 10);
}

function normalizarGTIN(codigo) {
  const limpio = limpiarCodigo(codigo);
  if (limpio.length === 12 && validarUPCA(limpio)) {
    return '0' + limpio; // UPC-A a GTIN-13
  }
  if (limpio.length === 13 && validarEAN13(limpio)) {
    return limpio;
  }
  if (limpio.length === 14 && esSoloNumeros(limpio)) {
    return limpio; // GTIN-14 / EAN-14
  }
  if (limpio.length === 8 && validarEAN8(limpio)) {
    return '00000' + limpio; // EAN-8 a GTIN-13
  }
  return limpio; // Devolver tal cual para búsqueda flexible
}

const GS1_AI_PATTERNS = {
  '01': { nombre: 'GTIN', longitud: 14, fijo: true },
  '10': { nombre: 'LOTE', longitud: null, fijo: false },
  '11': { nombre: 'FECHA_PRODUCCION', longitud: 6, fijo: true }, // YYMMDD
  '13': { nombre: 'FECHA_ENVASADO', longitud: 6, fijo: true },
  '15': { nombre: 'FECHA_VENCIMIENTO', longitud: 6, fijo: true }, // YYMMDD
  '17': { nombre: 'FECHA_VENCIMIENTO', longitud: 6, fijo: true }, // YYMMDD (más común)
  '21': { nombre: 'SERIAL', longitud: null, fijo: false },
  '240': { nombre: 'INFO_ADICIONAL', longitud: null, fijo: false },
  '241': { nombre: 'INFO_CLIENTE', longitud: null, fijo: false },
  '242': { nombre: 'VARIANTE', longitud: null, fijo: false },
  '250': { nombre: 'SECUNDARIO', longitud: null, fijo: false },
  '251': { nombre: 'REFERENCIA', longitud: null, fijo: false },
  '30': { nombre: 'CANTIDAD', longitud: null, fijo: false },
  '310': { nombre: 'CANTIDAD_NETO', longitud: null, fijo: false },
  '37': { nombre: 'CONTADO', longitud: null, fijo: false }
};

function parsearFechaGS1(yyMMdd) {
  if (!yyMMdd || yyMMdd.length !== 6) return null;
  const anio = 2000 + parseInt(yyMMdd.slice(0, 2), 10);
  const mes = parseInt(yyMMdd.slice(2, 4), 10);
  const dia = parseInt(yyMMdd.slice(4, 6), 10);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${anio}-${mes.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
}

function parsearGS1DataMatrix(codigo) {
  const limpio = limpiarCodigo(codigo);
  const resultado = { tipo: 'GS1', gtin: null, lote: null, vencimiento: null, serial: null, raw: limpio, ais: {} };
  
  // GS1 DataMatrix suele empezar con FNC1 (ASCII 29/GS o 0x1D) o paréntesis
  let trabajo = limpio.replace(/^[\x1D\x1E]|^\[\)>?/g, '');
  
  // Buscar patrones AI (Application Identifiers)
  const regexAI = /\(?(\d{2,4})\)?(\d*)/g;
  let match;
  let pos = 0;
  
  while ((match = regexAI.exec(trabajo)) !== null) {
    const ai = match[1];
    let valor = match[2];
    const info = GS1_AI_PATTERNS[ai];
    
    if (!info) {
      // AI no reconocido, intentar extraer hasta siguiente AI o fin
      const nextAI = trabajo.indexOf('(', pos + match[0].length);
      if (nextAI > 0) {
        valor = trabajo.slice(pos + match[1].length, nextAI);
      } else {
        valor = trabajo.slice(pos + match[1].length);
      }
    } else if (info.fijo && info.longitud) {
      valor = trabajo.slice(pos + match[1].length, pos + match[1].length + info.longitud);
    } else if (!info.fijo) {
      // Variable length - buscar siguiente AI o FNC1/GS
      const nextPos = trabajo.indexOf('(', pos + match[1].length);
      const fnc1Pos = trabajo.indexOf('\x1D', pos + match[1].length);
      let endPos = trabajo.length;
      if (nextPos > 0 && (fnc1Pos < 0 || nextPos < fnc1Pos)) endPos = nextPos;
      else if (fnc1Pos > 0) endPos = fnc1Pos;
      valor = trabajo.slice(pos + match[1].length, endPos);
    }
    
    resultado.ais[ai] = valor;
    
    // Mapear AIs conocidos
    switch (ai) {
      case '01':
        resultado.gtin = normalizarGTIN(valor);
        break;
      case '10':
        resultado.lote = valor;
        break;
      case '15':
      case '17':
        resultado.vencimiento = parsearFechaGS1(valor);
        break;
      case '21':
        resultado.serial = valor;
        break;
    }
    
    pos = match.index + match[0].length;
    if (pos >= trabajo.length) break;
  }
  
  // Si no se parseó bien con regex, intentar método alternativo simple
  if (!resultado.gtin && limpio.length >= 14) {
    // Buscar GTIN de 14 dígitos al inicio
    const posibleGTIN = limpio.slice(0, 14);
    if (esSoloNumeros(posibleGTIN)) {
      resultado.gtin = normalizarGTIN(posibleGTIN);
    }
  }
  
  return resultado;
}

function parsearCode128GS1(codigo) {
  // Code 128 en modo GS1 (empieza con FNC1)
  const limpio = limpiarCodigo(codigo);
  if (limpio.startsWith(']C1') || limpio.startsWith('\x1D')) {
    return parsearGS1DataMatrix(limpio);
  }
  // Code 128 plano - puede ser solo GTIN
  const gtin = normalizarGTIN(limpio);
  if (gtin.length >= 13 && esSoloNumeros(gtin)) {
    return { tipo: 'GTIN', gtin, lote: null, vencimiento: null, serial: null, raw: limpio };
  }
  return { tipo: 'CODE128', gtin: null, lote: null, vencimiento: null, serial: null, raw: limpio };
}

function parsearDataMatrixPlano(codigo) {
  const limpio = limpiarCodigo(codigo);
  // DataMatrix sin formato GS1 evidente - intentar extraer GTIN
  const gtin = normalizarGTIN(limpio);
  if (gtin.length >= 13 && esSoloNumeros(gtin)) {
    return { tipo: 'GTIN', gtin, lote: null, vencimiento: null, serial: null, raw: limpio };
  }
  return { tipo: 'DATAMATRIX', gtin: null, lote: null, vencimiento: null, serial: null, raw: limpio };
}

function detectarYParsear(codigoRaw) {
  const codigo = limpiarCodigo(codigoRaw);
  if (!codigo) throw new BarcodeParseError('Código vacío');

  // Detectar por longitud y patrón
  if (esSoloNumeros(codigo)) {
    // Solo números - probable EAN/UPC/GTIN
    if (codigo.length === 8) return { tipo: 'EAN-8', gtin: normalizarGTIN(codigo), lote: null, vencimiento: null, serial: null, raw: codigo };
    if (codigo.length === 12) return { tipo: 'UPC-A', gtin: normalizarGTIN(codigo), lote: null, vencimiento: null, serial: null, raw: codigo };
    if (codigo.length === 13) return { tipo: 'EAN-13', gtin: normalizarGTIN(codigo), lote: null, vencimiento: null, serial: null, raw: codigo };
    if (codigo.length === 14) return { tipo: 'EAN-14/GTIN-14', gtin: normalizarGTIN(codigo), lote: null, vencimiento: null, serial: null, raw: codigo };
    if (codigo.length > 14) {
      // Podría ser GS1-128 numérico concatenado
      return parsearCode128GS1(codigo);
    }
  }

  // Contiene paréntesis o FNC1 - probable GS1
  if (codigo.includes('(') || codigo.includes('\x1D') || codigo.startsWith(']') || codigo.startsWith('[')) {
    return parsearGS1DataMatrix(codigo);
  }

  // Alphanumérico - Code 128 o DataMatrix
  if (/^[A-Za-z0-9]+$/.test(codigo)) {
    return parsearCode128GS1(codigo);
  }

  // Default: DataMatrix genérico
  return parsearDataMatrixPlano(codigo);
}

function parsearEntradaLector(codigoRaw) {
  try {
    const parseado = detectarYParsear(codigoRaw);
    parseado.timestamp = new Date().toISOString();
    parseado.valido = !!parseado.gtin;
    return { ok: true, data: parseado };
  } catch (err) {
    return { ok: false, error: err.message, raw: codigoRaw };
  }
}

module.exports = {
  limpiarCodigo,
  normalizarGTIN,
  validarEAN13,
  validarEAN8,
  validarUPCA,
  parsearGS1DataMatrix,
  parsearCode128GS1,
  parsearDataMatrixPlano,
  detectarYParsear,
  parsearEntradaLector,
  parsearFechaGS1,
  BarcodeParseError
};