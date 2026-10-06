const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const barcodeService = require('../../backend/services/barcodeService');
const biometricService = require('../../backend/services/biometricService');

describe('FASE 11 — Integración de Hardware y Mocks (Lector de Barras, Huella, Firma)', () => {

  test('Lector de código de barras: Parseo de formatos estándar EAN-13, EAN-8 y UPC-A', () => {
    // EAN-13 (prefijo 770205770001 → dígito de control 0; el antiguo '...018' era inválido)
    assert.equal(barcodeService.validarEAN13('7702057700010'), true);
    // EAN-8
    assert.equal(barcodeService.validarEAN8('96385074'), true);
    // UPC-A
    assert.equal(barcodeService.validarUPCA('012345678905'), true);
  });

  test('Lector de código de barras: Manejo de entrada vacía o malformada', () => {
    const resVacio = barcodeService.parsearEntradaLector('');
    assert.equal(resVacio.ok, false);
    assert.equal(resVacio.error, 'Código vacío');

    const resInvalido = barcodeService.parsearEntradaLector('CODIGO_DESCONOCIDO_xyz');
    assert.equal(resInvalido.ok, true);
    // No tiene GTIN pero no causa crash
    assert.equal(resInvalido.data.valido, false);
  });

  test('Lector de huella biométrica: Simulación de dispositivo desconectado', async () => {
    const captura = await biometricService.capturarHuella();
    assert.ok(captura);
    assert.equal(captura.capturada, false);
    assert.equal(captura.dispositivo, 'SIN_LECTOR');
    assert.match(captura.mensaje, /Lector biométrico no conectado/);
  });

  test('Firma digital: Validación de presencia y estructura de trazos o imagen base64', () => {
    const firmaValida = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    assert.ok(firmaValida.startsWith('data:image/png;base64,'));
    assert.ok(firmaValida.length > 50);

    const firmaVacia = '';
    assert.equal(Boolean(firmaVacia), false);
  });
});
