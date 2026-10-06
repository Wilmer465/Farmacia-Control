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
  // UPC-A: d12 es el check de los 11 primeros. (Antes se pasaba un string de
  // 11 dígitos a calcularCheckEAN13, que itera 12 veces: el 12º era NaN y
  // TODO UPC-A válido daba false.)
  if (codigo.length !== 12 || !esSoloNumeros(codigo)) return false;
  let suma = 0;
  for (let i = 0; i < 11; i++) {
    const digito = parseInt(codigo[i], 10);
    suma += (i % 2 === 0) ? digito * 3 : digito;
  }
  return (10 - (suma % 10)) % 10 === parseInt(codigo[11], 10);
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

function esFechaCalendarioValida(anio, mes, dia) {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(anio, mes - 1, dia);
  return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia;
}

function parsearFechaGS1(yyMMdd) {
  if (!yyMMdd || yyMMdd.length !== 6 || !/^\d{6}$/.test(yyMMdd)) return null;
  const yy = parseInt(yyMMdd.slice(0, 2), 10);
  // Ventana de siglo GS1: 70-99 -> 19xx (si no, un vencido de 1999 se lee 2099
  // y queda "vigente" 70+ años), 00-69 -> 20xx.
  const anio = yy >= 70 ? 1900 + yy : 2000 + yy;
  const mes = parseInt(yyMMdd.slice(2, 4), 10);
  const dia = parseInt(yyMMdd.slice(4, 6), 10);
  if (!esFechaCalendarioValida(anio, mes, dia)) return null;
  return `${anio}-${mes.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
}

// Validez estricta por longitud: 8/12/13 dígitos exigen checksum; 14 dígitos
// numéricos se aceptan (GTIN-14 con pesos propios, sin falso negativo).
// Devuelve false para códigos con checksum roto (antes se marcaban valido:true).
function esGTINConChecksumValido(codigoLimpio) {
  if (!codigoLimpio || !esSoloNumeros(codigoLimpio)) return false;
  if (codigoLimpio.length === 13) return validarEAN13(codigoLimpio);
  if (codigoLimpio.length === 8) return validarEAN8(codigoLimpio);
  if (codigoLimpio.length === 12) return validarUPCA(codigoLimpio);
  return true;
}

function parsearGS1DataMatrix(codigo) {
  const limpio = limpiarCodigo(codigo);
  const resultado = { tipo: 'GS1', gtin: null, lote: null, vencimiento: null, serial: null, raw: limpio, ais: {} };

  // GS1 DataMatrix suele empezar con FNC1 (ASCII 29/GS o 0x1D) o paréntesis.
  // Parser secuencial: el anterior usaba un regex global cuyo `pos` no
  // descontaba los paréntesis, así que `(01)0770...` extraía `1)077020577000`
  // como GTIN. Aquí el cursor avanza por tokens exactos.
  const trabajo = limpio.replace(/^[\x1D\x1E]|^\[\)>?/g, '');
  const N = trabajo.length;
  let i = 0;

  const leerAI = () => {
    if (trabajo[i] === '(') {
      const m = trabajo.slice(i).match(/^\((\d{2,4})\)/);
      if (!m) return null;
      i += m[0].length;
      return m[1];
    }
    for (const len of [4, 3, 2]) {
      const cand = trabajo.slice(i, i + len);
      if (cand.length === len && /^\d+$/.test(cand) && GS1_AI_PATTERNS[cand]) {
        i += len;
        return cand;
      }
    }
    return null;
  };

  let seguridad = 0;
  while (i < N && seguridad++ < 40) {
    const ai = leerAI();
    if (!ai) break;
    const info = GS1_AI_PATTERNS[ai];

    if (!info) {
      // AI no reconocido: leer hasta siguiente '(' o FNC1 o fin.
      let j = i;
      while (j < N && trabajo[j] !== '(' && trabajo[j] !== '\x1D') j++;
      resultado.ais[ai] = trabajo.slice(i, j);
      i = j;
      continue;
    }

    let valor;
    if (info.fijo && info.longitud) {
      if (trabajo[i] === '\x1D') i += 1;
      valor = trabajo.slice(i, i + info.longitud);
      i += info.longitud;
    } else {
      // Longitud variable: hasta siguiente AI con paréntesis, FNC1 o fin.
      let j = i;
      while (j < N && trabajo[j] !== '(' && trabajo[j] !== '\x1D') j++;
      valor = trabajo.slice(i, j);
      i = j;
      if (trabajo[i] === '\x1D') i += 1;
    }

    resultado.ais[ai] = valor;

    // Mapear AIs conocidos
    if (ai === '01') resultado.gtin = normalizarGTIN(valor);
    else if (ai === '10') resultado.lote = valor || null;
    else if (ai === '15' || ai === '17') resultado.vencimiento = parsearFechaGS1(valor);
    else if (ai === '21') resultado.serial = valor || null;
  }

  // Si no se parseó bien, intentar método alternativo simple
  if (!resultado.gtin && limpio.length >= 14) {
    // Buscar GTIN de 14 dígitos al inicio
    const posibleGTIN = limpio.slice(0, 14);
    if (esSoloNumeros(posibleGTIN)) {
      resultado.gtin = normalizarGTIN(posibleGTIN);
    }
  }

  return resultado;
}

// Parser de GS1 concatenado SIN separadores (numérico continuo, p. ej.
// `011234567890123410LOTE...` o todo-numérico `01<14d>17<6d>10<lote>`).
// El regex genérico con paréntesis consumía todo en el primer match y dejaba
// lote/vencimiento en null; aquí se avanza por longitud fija de cada AI.
function parsearGS1Concatenado(limpio) {
  const resultado = { tipo: 'GS1', gtin: null, lote: null, vencimiento: null, serial: null, raw: limpio, ais: {} };
  // Un GTIN inicial sin AI '01' explícito (14 dígitos al inicio)
  let resto;
  if (/^01\d{14}/.test(limpio)) {
    // AI '01' + 14 dígitos de GTIN
    const gtinValor = limpio.slice(2, 16);
    resultado.gtin = normalizarGTIN(gtinValor);
    resultado.ais['01'] = gtinValor;
    resto = limpio.slice(16);
  } else if (/^\d{14}/.test(limpio) && limpio.length > 14) {
    const posible = limpio.slice(0, 14);
    resultado.gtin = normalizarGTIN(posible);
    resultado.ais['01'] = posible;
    resto = limpio.slice(14);
  } else {
    return null;
  }
  let i = 0;
  let seguridad = 0;
  while (i < resto.length && seguridad < 20) {
    seguridad += 1;
    const ai2 = resto.slice(i, i + 2);
    const ai3 = resto.slice(i, i + 3);
    let ai = null;
    let info = null;
    if (GS1_AI_PATTERNS[ai3]) {
      ai = ai3;
      info = GS1_AI_PATTERNS[ai3];
    } else if (GS1_AI_PATTERNS[ai2]) {
      ai = ai2;
      info = GS1_AI_PATTERNS[ai2];
    } else {
      break;
    }
    i += ai.length;
    let valor;
    if (info.fijo && info.longitud) {
      valor = resto.slice(i, i + info.longitud);
      i += info.longitud;
    } else {
      // Longitud variable: hasta el próximo AI conocido o fin. Para lote (10)
      // y serial (21) se consume con heurística: si lo que sigue parece
      // `AI+datos` se corta ahí.
      let fin = resto.length;
      for (let j = i + 1; j < resto.length; j += 1) {
        const c2 = resto.slice(j, j + 2);
        const c3 = resto.slice(j, j + 3);
        if (GS1_AI_PATTERNS[c3] || GS1_AI_PATTERNS[c2]) {
          fin = j;
          break;
        }
      }
      valor = resto.slice(i, fin);
      i = fin;
    }
    resultado.ais[ai] = valor;
    if (ai === '01') resultado.gtin = normalizarGTIN(valor);
    else if (ai === '10') resultado.lote = valor || null;
    else if (ai === '15' || ai === '17') resultado.vencimiento = parsearFechaGS1(valor);
    else if (ai === '21') resultado.serial = valor || null;
  }
  if (resultado.gtin || resultado.lote || resultado.vencimiento) return resultado;
  return null;
}

function parsearCode128GS1(codigo) {
  // Code 128 en modo GS1 (empieza con FNC1)
  const limpio = limpiarCodigo(codigo);
  if (limpio.startsWith(']C1') || limpio.startsWith('\x1D')) {
    return parsearGS1DataMatrix(limpio);
  }
  // Numérico continuo largo: intentar GS1 concatenado antes de rendirse a GTIN
  if (esSoloNumeros(limpio) && limpio.length > 14) {
    const gs1 = parsearGS1Concatenado(limpio);
    if (gs1) return gs1;
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

  // Detectar por longitud y patrón. Los de 8/12/13 dígitos con checksum roto
  // se tipan *-INVALIDO para no asociar recepciones al medicamento erróneo.
  if (esSoloNumeros(codigo)) {
    // Solo números - probable EAN/UPC/GTIN
    if (codigo.length === 8) {
      const ok = validarEAN8(codigo);
      return { tipo: ok ? 'EAN-8' : 'EAN-8-INVALIDO', gtin: normalizarGTIN(codigo), checksumValido: ok, lote: null, vencimiento: null, serial: null, raw: codigo };
    }
    if (codigo.length === 12) {
      const ok = validarUPCA(codigo);
      return { tipo: ok ? 'UPC-A' : 'UPC-A-INVALIDO', gtin: normalizarGTIN(codigo), checksumValido: ok, lote: null, vencimiento: null, serial: null, raw: codigo };
    }
    if (codigo.length === 13) {
      const ok = validarEAN13(codigo);
      return { tipo: ok ? 'EAN-13' : 'EAN-13-INVALIDO', gtin: normalizarGTIN(codigo), checksumValido: ok, lote: null, vencimiento: null, serial: null, raw: codigo };
    }
    if (codigo.length === 14) return { tipo: 'EAN-14/GTIN-14', gtin: normalizarGTIN(codigo), checksumValido: true, lote: null, vencimiento: null, serial: null, raw: codigo };
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
    // Válido = hay GTIN Y (sin bandera de checksum o con checksum bueno).
    // Antes `!!gtin` marcaba valido:true hasta con checksum roto.
    parseado.valido = Boolean(parseado.gtin) && parseado.checksumValido !== false;
    if (parseado.checksumValido === false) parseado.advertencia = 'Checksum inválido: verifique el código escaneado.';
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
  esGTINConChecksumValido,
  esFechaCalendarioValida,
  parsearGS1DataMatrix,
  parsearGS1Concatenado,
  parsearCode128GS1,
  parsearDataMatrixPlano,
  detectarYParsear,
  parsearEntradaLector,
  parsearFechaGS1,
  BarcodeParseError
};