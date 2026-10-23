const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const signatureService = require('../../backend/services/signatureService');
const biometricService = require('../../backend/services/biometricService');

// Pruebas del puente ZK9500 SIN hardware: el helper real se sustituye por
// scripts .cmd simulados (mismo patrón que stu_bridge.test.js). Con lector
// físico, la prueba es manual: node scripts/diagnosticar-zk9500.js.

let dirTmp;

function simulado(nombre, lineas) {
  const ruta = path.join(dirTmp, nombre);
  fs.writeFileSync(ruta, '@echo off\r\n' + lineas.join('\r\n') + '\r\n', 'utf8');
  return ruta;
}

before(() => {
  dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-bridge-test-'));
  signatureService.__setOpcionesSpawn({ shell: true });
});

after(() => {
  signatureService.__setOpcionesSpawn({});
  biometricService.setHelperPathForTests(null);
  fs.rmSync(dirTmp, { recursive: true, force: true });
});

describe('ZK9500 — biometricService sin hardware', () => {
  test('helper ausente: capturada false con guía de compilación', async () => {
    biometricService.setHelperPathForTests(path.join(dirTmp, 'no-existe.exe'));
    const res = await biometricService.capturarHuella();
    assert.equal(res.capturada, false);
    assert.equal(res.dispositivo, 'ZK9500');
    assert.match(res.mensaje, /compilar:zk-bridge/);
  });

  test('captura OK: constancia con metadatos, sin plantilla ni imagen', async () => {
    const exe = simulado('capturar-ok.cmd', [
      '@echo {"ok":true,"codigo":null,"dispositivo":"ZK9500","tamanoPlantilla":786,"duracionSeg":3.2}'
    ]);
    biometricService.setHelperPathForTests(exe);
    const res = await biometricService.capturarHuella();
    assert.equal(res.capturada, true);
    assert.equal(res.dispositivo, 'ZK9500');
    assert.equal(res.tamanoPlantilla, 786);
    assert.ok(!('plantilla' in res));
    assert.ok(!('imagen' in res));
    assert.ok(res.timestamp);
  });

  test('timeout de dedo: capturada false con mensaje en español', async () => {
    const exe = simulado('timeout-dedo.cmd', [
      '@echo {"ok":false,"codigo":"TIMEOUT_DEDO","error":"Sin dedo en el lector dentro del plazo."}'
    ]);
    biometricService.setHelperPathForTests(exe);
    const res = await biometricService.capturarHuella();
    assert.equal(res.capturada, false);
    assert.match(res.mensaje, /dedo/i);
  });

  test('sin lector: capturada false con mensaje de pendiente', async () => {
    const exe = simulado('sin-lector.cmd', [
      '@echo {"ok":false,"codigo":"SIN_LECTOR","error":"Sin lectores ZK por USB."}'
    ]);
    biometricService.setHelperPathForTests(exe);
    const res = await biometricService.capturarHuella();
    assert.equal(res.capturada, false);
    assert.match(res.mensaje, /pendiente/i);
  });

  test('capturas concurrentes: la segunda queda pendiente sin lanzar otro helper', async () => {
    const exe = simulado('lento.cmd', [
      '@ping -n 2 127.0.0.1 >nul',
      '@echo {"ok":true,"codigo":null,"dispositivo":"ZK9500","tamanoPlantilla":900}'
    ]);
    biometricService.setHelperPathForTests(exe);
    const primera = biometricService.capturarHuella();
    const segunda = await biometricService.capturarHuella();
    assert.equal(segunda.capturada, false);
    assert.match(segunda.mensaje, /en curso/i);
    const res = await primera;
    assert.equal(res.capturada, true);
  });

  test('respuesta no JSON: capturada false sin tumbar el servicio', async () => {
    const exe = simulado('basura.cmd', ['@echo esto no es json']);
    biometricService.setHelperPathForTests(exe);
    const res = await biometricService.capturarHuella();
    assert.equal(res.capturada, false);
    assert.ok(res.mensaje);
  });

  test('regresión: chatter nativo posterior al JSON no rompe el parser', async () => {
    // stdout real de libzkfp: el JSON primero y el chatter después.
    const exe = simulado('chatter.cmd', [
      '@echo {"ok":true,"capturada":true}',
      '@echo Check sum data is true!sum=9148, buf[val]=9148',
      '@echo start to set the exposure parameters'
    ]);
    const res = await signatureService.ejecutarHelper(['detectar'], 5000, exe);
    assert.equal(res.ok, true);
    assert.equal(res.capturada, true);
  });
});
