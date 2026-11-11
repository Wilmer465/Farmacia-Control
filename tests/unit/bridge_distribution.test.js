'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RUTAS } = require('../../backend/services/bridgePrerequisitesService');

const root = path.join(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('los puentes importan por nombre y precargan desde una ruta detectada', () => {
  const wacom = read('native/stu-bridge/stu-bridge.cs');
  const zk = read('native/zk-bridge/zk-bridge.cs');

  assert.match(wacom, /private const string DllSdk = "wgssSTU\.dll";/);
  assert.match(wacom, /LoadLibraryEx\(candidata, IntPtr\.Zero, LoadWithAlteredSearchPath\)/);
  assert.match(wacom, /VersionSdkRequerida = "2\.18\.0\.82"/);
  assert.doesNotMatch(wacom, /private const string DllSdk\s*=\s*@"[A-Z]:\\/);

  assert.match(zk, /private const string DllZkfp = "libzkfp\.dll";/);
  assert.match(zk, /AppDomain\.CurrentDomain\.BaseDirectory/);
  assert.match(zk, /Environment\.SpecialFolder\.System/);
  assert.match(zk, /LoadLibraryEx\(seleccionada, IntPtr\.Zero, LoadWithAlteredSearchPath\)/);
  assert.doesNotMatch(zk, /private const string DllZkfp\s*=\s*@"[A-Z]:\\/);
});

test('el diagnóstico busca recursos app-locales y fallback oficial instalado, sin cargar DLL', () => {
  assert.ok(RUTAS.candidatosWacom.some((ruta) => ruta.includes(path.join('native', 'stu-bridge'))));
  assert.ok(RUTAS.candidatosZk.some((ruta) => ruta.includes(path.join('native', 'zk-bridge'))));
  assert.ok(RUTAS.candidatosZk.some((ruta) => ruta.toLowerCase().endsWith(path.join('system32', 'libzkfp.dll').toLowerCase())));
  assert.ok(RUTAS.zkSystem32.toLowerCase().endsWith('system32'));
});

test('el setup avisa sobre prerrequisitos faltantes y enlaza instaladores oficiales sin incluirlos', () => {
  const packageJson = JSON.parse(read('package.json'));
  const nsis = read('build/installer-bridge-prerequisites.nsh');
  assert.equal(packageJson.build.nsis.include, 'build/installer-bridge-prerequisites.nsh');
  for (const dll of ['wgssSTU.dll', 'libzkfp.dll', 'ZKFPCap.dll', 'fpslib.dll']) {
    assert.ok(nsis.includes(dll), `el preflight del instalador debe comprobar ${dll}`);
  }
  assert.match(nsis, /developer\.wacom\.com\/downloads/);
  assert.match(nsis, /zkteco\.com\/en\/ZKFingerSDKforWindows/);
  assert.match(nsis, /La presencia de DLL no confirma que el dispositivo funcione/);
});
