'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  PUERTO_DEV,
  esOrigenPermitido,
  esUrlArchivoPermitida,
  esUrlDevPermitida,
  normalizarRuta
} = require('../../shared/appOriginPolicy');
const { crearPoliticaNavegacion, esAperturaExternaPermitida } = require('../../electron/navigationPolicy');
const { crearContentSecurityPolicy } = require('../../shared/contentSecurityPolicy');

const RENDERER_INDEX = path.join(os.tmpdir(), 'farmacia-control-test', 'dist', 'renderer', 'index.html');

describe('Política de origen del renderer', () => {
  test('en desarrollo solo acepta el servidor Vite en localhost, 127.0.0.1 o ::1 y el puerto fijo', () => {
    assert.equal(PUERTO_DEV, '5173');
    for (const url of [
      'http://localhost:5173/',
      'http://localhost:5173',
      'http://127.0.0.1:5173/index.html',
      'http://[::1]:5173/'
    ]) {
      assert.equal(esOrigenPermitido(url, { isDev: true }), true, url);
      assert.equal(esUrlDevPermitida(new URL(url)), true, url);
    }

    for (const url of [
      'http://localhost:5174/',
      'http://localhost:3000/',
      'https://localhost:5173/',
      'http://evil.example:5173/',
      'http://localhost.evil.example:5173/',
      'file:///C:/farmacia/dist/renderer/index.html',
      'data:text/html,<script>alert(1)</script>',
      'javascript:alert(1)',
      '',
      null,
      undefined,
      42
    ]) {
      assert.equal(esOrigenPermitido(url, { isDev: true }), false, String(url));
    }
  });

  test('en producción solo acepta el index.html empaquetado exacto', () => {
    const permitida = pathToFileURL(RENDERER_INDEX).href;
    assert.equal(esOrigenPermitido(permitida, { rendererIndexPath: RENDERER_INDEX }), true);
    assert.equal(esUrlArchivoPermitida(new URL(permitida), RENDERER_INDEX), true);

    const hermano = pathToFileURL(path.join(path.dirname(RENDERER_INDEX), 'otro.html')).href;
    const padre = pathToFileURL(path.join(os.tmpdir(), 'otro', 'index.html')).href;
    assert.equal(esOrigenPermitido(hermano, { rendererIndexPath: RENDERER_INDEX }), false);
    assert.equal(esOrigenPermitido(padre, { rendererIndexPath: RENDERER_INDEX }), false);
    assert.equal(esOrigenPermitido('http://localhost:5173/', { rendererIndexPath: RENDERER_INDEX }), false);
    assert.equal(esOrigenPermitido(permitida, {}), false, 'sin ruta empaquetada debe fallar cerrado');
    assert.equal(esOrigenPermitido('file:///C:/Windows/System32/drivers/etc/hosts', { rendererIndexPath: RENDERER_INDEX }), false);
  });

  test('normalizarRuta resuelve rutas y compara sin distinguir mayúsculas solo en Windows', () => {
    const ruta = path.join(os.tmpdir(), 'Farmacia', 'index.html');
    const normalizada = normalizarRuta(ruta);
    assert.equal(normalizada, normalizarRuta(`${ruta}${path.sep}..${path.sep}index.html`));
    if (process.platform === 'win32') {
      assert.equal(normalizarRuta('C:\\Farmacia\\INDEX.HTML'), normalizarRuta('c:\\farmacia\\index.html'));
    }
  });

  test('la política de navegación reutiliza el mismo origen permitido', () => {
    const dev = crearPoliticaNavegacion({ isDev: true });
    assert.equal(dev.esNavegacionPermitida('http://localhost:5173/'), true);
    assert.equal(dev.esNavegacionPermitida('https://evil.example/'), false);

    const prod = crearPoliticaNavegacion({ rendererIndexPath: RENDERER_INDEX });
    assert.equal(prod.esNavegacionPermitida(pathToFileURL(RENDERER_INDEX).href), true);
    assert.equal(prod.esNavegacionPermitida(pathToFileURL(path.join(os.tmpdir(), 'otro.html')).href), false);
    assert.ok(Object.isFrozen(dev));
  });

  test('solo se permite abrir enlaces externos HTTPS con host', () => {
    for (const url of [
      'https://www.invima.gov.co/',
      'https://example.com/ruta?x=1#y',
      'https://sub.example.com:8443/'
    ]) {
      assert.equal(esAperturaExternaPermitida(url), true, url);
    }

    for (const url of [
      'http://example.com/',
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'mailto:alguien@example.com',
      'ms-settings:privacy',
      'https://',
      '',
      null,
      12
    ]) {
      assert.equal(esAperturaExternaPermitida(url), false, String(url));
    }
  });

  test('la CSP de producción elimina eval/inline y restringe recursos al paquete local', () => {
    const csp = crearContentSecurityPolicy({ isDev: false });
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self'/);
    assert.match(csp, /connect-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.match(csp, /form-action 'self'/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.doesNotMatch(csp, /unsafe-inline/);

    const cspDev = crearContentSecurityPolicy({ isDev: true });
    assert.match(cspDev, /unsafe-eval/);
    assert.match(cspDev, /unsafe-inline/);
    assert.match(cspDev, /ws:\/\/localhost:5173/);
  });
});
