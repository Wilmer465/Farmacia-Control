const { createHash, timingSafeEqual } = require('crypto');

class ErrorDian extends Error {}

function textoObligatorio(valor, nombre) {
  const texto = String(valor ?? '').trim();
  if (!texto) throw new ErrorDian(`Falta el dato ${nombre} requerido para calcular el código DIAN.`);
  return texto;
}

function valorDecimal(valor, nombre) {
  const texto = String(valor ?? '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(texto)) throw new ErrorDian(`El valor ${nombre} no es un importe decimal válido.`);
  const negativo = texto.startsWith('-');
  const [entero, decimales = ''] = texto.replace('-', '').split('.');
  const centavos = decimales.padEnd(2, '0').slice(0, 2);
  return `${negativo ? '-' : ''}${entero}.${centavos}`;
}

function hash384(contenido) {
  return createHash('sha384').update(contenido, 'utf8').digest('hex');
}

/**
 * Calcula el CUFE/CUDE por concatenación y SHA-384 según el anexo DIAN 1.9.
 * El llamador debe clasificar los impuestos con los códigos oficiales antes de
 * invocarlo; este módulo no deduce el tipo de tributo a partir de una tarifa.
 */
function calcularCodigoUnico({
  numero, fecha, hora, valorAntesImpuestos,
  impuestos = [], valorTotal, nitEmisor, numeroAdquirente,
  claveTecnica, softwarePin, tipoDocumento = 'FACTURA', ambiente
}) {
  if (!['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'].includes(tipoDocumento)) throw new ErrorDian('El tipo de documento no permite calcular un CUFE/CUDE.');
  const clave = tipoDocumento === 'FACTURA' ? claveTecnica : softwarePin;
  if (!Array.isArray(impuestos)) throw new ErrorDian('Los impuestos del documento deben ser una lista.');
  const grupos = new Map();
  for (const impuesto of impuestos) {
    const codigo = textoObligatorio(impuesto.codigo, 'código de impuesto');
    if (!['01', '04', '03'].includes(codigo)) throw new ErrorDian(`El código de impuesto ${codigo} no corresponde a los grupos usados por el CUFE/CUDE.`);
    const previo = Number(grupos.get(codigo) || '0.00');
    const actual = Number(valorDecimal(impuesto.valor, 'impuesto'));
    grupos.set(codigo, (previo + actual).toFixed(2));
  }
  const datos = [
    textoObligatorio(numero, 'número de documento'),
    textoObligatorio(fecha, 'fecha del documento'),
    textoObligatorio(hora, 'hora del documento'),
    valorDecimal(valorAntesImpuestos, 'valor antes de impuestos'),
    valorDecimal(valorTotal, 'valor total'),
    textoObligatorio(nitEmisor, 'NIT del emisor sin dígito de verificación'),
    textoObligatorio(numeroAdquirente, 'identificación del adquirente'),
    textoObligatorio(clave, tipoDocumento === 'FACTURA' ? 'clave técnica de la resolución' : 'SoftwarePIN para CUDE')
  ];
  const valoresImpuesto = ['01', '04', '03'].map((codigo) => grupos.get(codigo) || '0.00');
  const ambienteDian = String(ambiente);
  if (!['1', '2'].includes(ambienteDian)) throw new ErrorDian('El ambiente DIAN debe ser 1 (producción) o 2 (habilitación).');

  const partes = [
    ...datos.slice(0, 4),
    '01', valoresImpuesto[0],
    '04', valoresImpuesto[1],
    '03', valoresImpuesto[2],
    ...datos.slice(4),
    ambienteDian
  ];
  return hash384(partes.join(''));
}

function verificarCodigoUnico(entrada, codigoEsperado) {
  const esperado = String(codigoEsperado ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{96}$/.test(esperado)) return false;
  let calculado;
  try { calculado = calcularCodigoUnico(entrada); } catch { return false; }
  return timingSafeEqual(Buffer.from(calculado, 'hex'), Buffer.from(esperado, 'hex'));
}

function calcularCodigoSeguridadSoftware({ softwareId, pin, numero }) {
  return hash384(
    textoObligatorio(softwareId, 'SoftwareID') +
    textoObligatorio(pin, 'SoftwarePIN') +
    textoObligatorio(numero, 'número de documento')
  );
}

module.exports = { ErrorDian, calcularCodigoUnico, verificarCodigoUnico, calcularCodigoSeguridadSoftware };
