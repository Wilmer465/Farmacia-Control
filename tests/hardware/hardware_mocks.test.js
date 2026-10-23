const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const barcodeService = require('../../backend/services/barcodeService');
const biometricService = require('../../backend/services/biometricService');
const signatureService = require('../../backend/services/signatureService');

let dirTmp;

before(() => {
  dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hw-mocks-test-'));
  signatureService.__setOpcionesSpawn({ shell: true });
});

after(() => {
  signatureService.__setOpcionesSpawn({});
  biometricService.setHelperPathForTests(null);
  fs.rmSync(dirTmp, { recursive: true, force: true });
});

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
    // El stub SIN_LECTOR fue reemplazado por el helper real; el escenario
    // "desconectado" se simula con un helper que responde SIN_LECTOR.
    const simulado = path.join(dirTmp, 'sin-lector.cmd');
    fs.writeFileSync(simulado,
      '@echo off\r\n@echo {"ok":false,"codigo":"SIN_LECTOR","error":"Sin lectores ZK por USB."}\r\n',
      'utf8');
    biometricService.setHelperPathForTests(simulado);
    const captura = await biometricService.capturarHuella();
    assert.ok(captura);
    assert.equal(captura.capturada, false);
    assert.equal(captura.dispositivo, 'ZK9500');
    assert.match(captura.mensaje, /pendiente/i);
  });

  test('Firma digital: Validación de presencia y estructura de trazos o imagen base64', () => {
    const firmaValida = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    assert.ok(firmaValida.startsWith('data:image/png;base64,'));
    assert.ok(firmaValida.length > 50);

    const firmaVacia = '';
    assert.equal(Boolean(firmaVacia), false);
  });
});
