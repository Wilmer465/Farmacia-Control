const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const signatureService = require('../../backend/services/signatureService');

// Pruebas del puente STU-540 SIN hardware: el helper real se sustituye por
// scripts .cmd simulados vía setHelperPathForTests. Con pad físico, la
// prueba es manual (docs/stu540.md).

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let dirTmp;

function simulado(nombre, lineas) {
  const ruta = path.join(dirTmp, nombre);
  fs.writeFileSync(ruta, '@echo off\r\n' + lineas.join('\r\n') + '\r\n', 'utf8');
  return ruta;
}

before(() => {
  dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stu-bridge-test-'));
  signatureService.__setOpcionesSpawn({ shell: true });
});

after(() => {
  signatureService.__setOpcionesSpawn({});
  signatureService.setHelperPathForTests(null);
  fs.rmSync(dirTmp, { recursive: true, force: true });
});

describe('STU-540 — signatureService sin hardware', () => {
  test('helper ausente: error HELPER_NO_ENCONTRADO con guía', async () => {
    signatureService.setHelperPathForTests(path.join(dirTmp, 'no-existe.exe'));
    await assert.rejects(() => signatureService.detectar(), (err) => {
      assert.equal(err.codigo, 'HELPER_NO_ENCONTRADO');
      assert.match(err.message, /compilar:stu-bridge/);
      return true;
    });
  });

  test('detectar: propaga dispositivos del helper', async () => {
    const exe = simulado('detectar-ok.cmd', [
      '@echo {"ok":true,"codigo":null,"dispositivos":[{"vid":"056a","pid":"00a8","modelo":"STU-540"}]}'
    ]);
    signatureService.setHelperPathForTests(exe);
    const res = await signatureService.detectar();
    assert.equal(res.disponible, true);
    assert.equal(res.dispositivos[0].modelo, 'STU-540');
  });

  test('capturar: arma sobre con dataUrl PNG y sha256', async () => {
    const exe = simulado('capturar-ok.cmd', [
      '@echo {"ok":true,"codigo":null,"modelo":"STU-540","origen":"STU-540","pngBase64":"' + PNG_1PX + '","trazos":2,"duracionSeg":12.5}'
    ]);
    signatureService.setHelperPathForTests(exe);
    const res = await signatureService.capturar({ nombre: 'Ana', documento: '123' });
    assert.ok(res.dataUrl.startsWith('data:image/png;base64,'));
    assert.equal(res.origen, 'STU-540');
    assert.equal(res.trazos, 2);
    const esperado = crypto.createHash('sha256')
      .update(Buffer.from(PNG_1PX, 'base64')).digest('hex');
    assert.equal(res.sha256, esperado);
    assert.ok(res.capturadaEn);
  });

  test('capturar: error del helper se mapea a mensaje en español', async () => {
    const exe = simulado('capturar-cancelado.cmd', [
      '@echo {"ok":false,"codigo":"CANCELADO","error":"Captura cancelada en el pad."}'
    ]);
    signatureService.setHelperPathForTests(exe);
    await assert.rejects(() => signatureService.capturar({}), (err) => {
      assert.equal(err.codigo, 'CANCELADO');
      assert.match(err.message, /cancelada/i);
      return true;
    });
  });

  test('respuesta no JSON: RESPUESTA_INVALIDA', async () => {
    const exe = simulado('basura.cmd', ['@echo esto no es json']);
    signatureService.setHelperPathForTests(exe);
    await assert.rejects(() => signatureService.detectar(), (err) => {
      assert.equal(err.codigo, 'RESPUESTA_INVALIDA');
      return true;
    });
  });

  test('capturas concurrentes: la segunda recibe PAD_OCUPADO_LOCAL', async () => {
    const exe = simulado('lento.cmd', [
      '@ping -n 2 127.0.0.1 >nul',
      '@echo {"ok":true,"codigo":null,"modelo":"STU-540","origen":"STU-540","pngBase64":"' + PNG_1PX + '"}'
    ]);
    signatureService.setHelperPathForTests(exe);
    const primera = signatureService.capturar({});
    await assert.rejects(() => signatureService.capturar({}), (err) => {
      assert.equal(err.codigo, 'PAD_OCUPADO_LOCAL');
      return true;
    });
    const res = await primera;
    assert.ok(res.dataUrl.startsWith('data:image/png;base64,'));
  });

  test('helper colgado: TIMEOUT_LOCAL y proceso terminado', async () => {
    const exe = simulado('colgado.cmd', ['@ping -n 6 127.0.0.1 >nul']);
    signatureService.setHelperPathForTests(exe);
    await assert.rejects(
      () => signatureService.ejecutarHelper(['detectar'], 400),
      (err) => {
        assert.equal(err.codigo, 'TIMEOUT_LOCAL');
        return true;
      }
    );
  });
});
