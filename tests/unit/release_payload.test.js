const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
const files = packageJson.build.files;

test('electron-builder empaqueta el frontend pero excluye salidas previas dentro de dist', () => {
  assert.ok(files.includes('dist/**/*'));
  for (const salida of [
    '!dist/win-unpacked/**', '!dist/*.exe', '!dist/*.blockmap',
    '!dist/latest.yml', '!dist/builder-debug.yml'
  ]) assert.ok(files.includes(salida), `falta exclusión ${salida}`);
});

test('el payload nativo del producto se limita a los recursos configurados, no al SDK de fabricantes', () => {
  const recursos = packageJson.build.extraResources.map(({ from, to }) => ({ from, to }));
  assert.deepEqual(recursos, [
    { from: 'native/stu-bridge/bin', to: 'native/stu-bridge' },
    { from: 'native/zk-bridge/bin', to: 'native/zk-bridge' }
  ]);
  assert.ok(!files.some((pattern) => /wgssSTU|libzkfp|ZKFPCap|fpslib/i.test(pattern)));
});
