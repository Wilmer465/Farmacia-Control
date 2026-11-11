const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularCodigoUnico, verificarCodigoUnico, calcularCodigoSeguridadSoftware } = require('../../backend/services/dianControlCodes');

test('calcula el CUFE del vector oficial del anexo técnico 1.9', () => {
  const resultado = calcularCodigoUnico({
    numero: '323200000129',
    fecha: '2019-01-16',
    hora: '10:53:10-05:00',
    valorAntesImpuestos: '1500000.00',
    impuestos: [
      { codigo: '01', valor: '285000.00' },
      { codigo: '04', valor: '0.00' },
      { codigo: '03', valor: '0.00' }
    ],
    valorTotal: '1785000.00',
    nitEmisor: '700085371',
    numeroAdquirente: '800199436',
    claveTecnica: '693ff6f2a553c3646a063436fd4dd9ded0311471',
    ambiente: '1'
  });

  assert.equal(resultado, '8bb918b19ba22a694f1da11c643b5e9de39adf60311cf179179e9b33381030bcd4c3c3f156c506ed5908f9276f5bd9b4');
});

test('el código de seguridad del software concatena SoftwareID, PIN y número', () => {
  const { createHash } = require('crypto');
  const esperado = createHash('sha384').update('software12345FV-1').digest('hex');
  assert.equal(calcularCodigoSeguridadSoftware({ softwareId: 'software', pin: '12345', numero: 'FV-1' }), esperado);
});

test('calcula y verifica CUDE de nota crédito con vector oficial del anexo 1.9', () => {
  const entrada = { numero: '8110007871', fecha: '2019-01-12', hora: '07:00:00-05:00', valorAntesImpuestos: '5000.00',
    impuestos: [{ codigo: '01', valor: '950.00' }, { codigo: '04', valor: '0.00' }, { codigo: '03', valor: '0.00' }],
    valorTotal: '5950.00', nitEmisor: '900373076', numeroAdquirente: '8355990', softwarePin: '12301', tipoDocumento: 'NOTA_CREDITO', ambiente: '1' };
  const esperado = '907e4444decc9e59c160a2fb3b6659b33dc5b632a5008922b9a62f83f757b1c448e47f5867f2b50dbdb96f48c7681168';
  assert.equal(calcularCodigoUnico(entrada), esperado);
  assert.equal(verificarCodigoUnico(entrada, esperado), true);
  assert.equal(verificarCodigoUnico(entrada, 'f'.repeat(96)), false);
  assert.equal(verificarCodigoUnico(entrada, 'not-a-hash'), false);
});

test('suma el mismo código de impuesto cuando aparece con varias tarifas', () => {
  const entrada = { numero: 'FV-1', fecha: '2026-10-23', hora: '12:00:00-05:00', valorAntesImpuestos: '150.00',
    impuestos: [{ codigo: '01', valor: '19.00' }, { codigo: '01', valor: '5.00' }], valorTotal: '174.00',
    nitEmisor: '900000001', numeroAdquirente: '123', claveTecnica: 'key', ambiente: '2' };
  const unaTasa = { ...entrada, impuestos: [{ codigo: '01', valor: '24.00' }] };
  assert.equal(calcularCodigoUnico(entrada), calcularCodigoUnico(unaTasa));
});

test('calcula y verifica CUDE para nota débito usando SoftwarePIN', () => {
  const entrada = { numero: 'ND1001', fecha: '2019-01-18', hora: '10:58:00-05:00', valorAntesImpuestos: '30000.00',
    impuestos: [{ codigo: '01', valor: '0.00' }, { codigo: '04', valor: '2400.00' }, { codigo: '03', valor: '0.00' }],
    valorTotal: '32400.00', nitEmisor: '900197264', numeroAdquirente: '10254102', softwarePin: '10201', tipoDocumento: 'NOTA_DEBITO', ambiente: '2' };
  const cude = calcularCodigoUnico(entrada);
  assert.match(cude, /^[a-f0-9]{96}$/);
  assert.equal(verificarCodigoUnico(entrada, cude), true);
  assert.equal(verificarCodigoUnico({ ...entrada, valorTotal: '32400.01' }, cude), false);
});

test('no deduce impuestos ni genera códigos si faltan datos DIAN obligatorios', () => {
  assert.throws(() => calcularCodigoUnico({}), /Falta el dato/);
  assert.throws(() => calcularCodigoUnico({
    numero: 'FV-1', fecha: '2026-10-23', hora: '12:00:00-05:00', valorAntesImpuestos: 10,
    valorTotal: 10, nitEmisor: '900000001', numeroAdquirente: '123', claveTecnica: 'x', ambiente: '3'
  }), /ambiente DIAN/);
});
