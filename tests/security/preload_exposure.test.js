'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PRELOAD_PATH = path.join(__dirname, '../../electron/preload.js');
const NAMESPACES = Object.freeze([
  'auth',
  'medicamentos',
  'sedes',
  'lotes',
  'ordenes',
  'despachos',
  'entregas',
  'receptores',
  'solicitudesEliminacion',
  'solicitudesIntercambio',
  'auditoria',
  'reportes',
  'backups',
  'cloudSync',
  'usuarios',
  'catalogoCum',
  'recepcion',
  'firmaPad',
  'puentes'
]);
const CANAL_PERMITIDO = /^(auth|medicamentos|sedes|lotes|ordenes|despachos|entregas|receptores|solicitudesEliminacion|solicitudesIntercambio|auditoria|reportes|backups|cloudSync|usuarios|catalogoCum|recepcion|firmaPad|puentes):[A-Za-z]+$/;

function cargarPreload() {
  const source = fs.readFileSync(PRELOAD_PATH, 'utf8');
  const llamadas = [];
  let api;
  let claveExpuesta;

  const electron = {
    contextBridge: {
      exposeInMainWorld: (clave, valor) => {
        claveExpuesta = clave;
        api = valor;
      }
    },
    ipcRenderer: {
      invoke: (...args) => {
        llamadas.push(args);
        return Promise.resolve({ ok: true });
      }
    }
  };

  const contexto = {
    require: (nombre) => {
      if (nombre === 'electron') return electron;
      throw new Error(`require no permitido en preload: ${nombre}`);
    },
    module: { exports: {} },
    exports: {}
  };

  vm.runInNewContext(source, contexto, { filename: 'electron/preload.js' });
  return { api, llamadas, claveExpuesta, source };
}

function recorrerMetodos(api, visitar) {
  for (const [espacio, metodos] of Object.entries(api)) {
    for (const [metodo, fn] of Object.entries(metodos)) {
      visitar({ espacio, metodo, fn });
    }
  }
}

describe('Superficie expuesta por el preload', () => {
  test('expone solo el namespace api con espacios y métodos congelados en profundidad', () => {
    const { api, claveExpuesta } = cargarPreload();
    assert.equal(claveExpuesta, 'api');
    assert.deepEqual(Object.keys(api).sort(), [...NAMESPACES].sort());

    assert.ok(Object.isFrozen(api));
    for (const metodos of Object.values(api)) {
      assert.ok(Object.isFrozen(metodos));
      for (const fn of Object.values(metodos)) {
        assert.equal(typeof fn, 'function');
      }
    }

    assert.throws(() => {
      api.auth.login = () => {};
    }, TypeError);
    assert.throws(() => {
      api.puentes.verificarPrerrequisitos = () => {};
    }, TypeError);
    assert.throws(() => {
      Object.defineProperty(api, 'ipcRenderer', { value: {} });
    }, TypeError);
  });

  test('no filtra ipcRenderer, Node ni funciones de bajo nivel', () => {
    const { api } = cargarPreload();
    const prohibidas = new Set([
      'ipcRenderer',
      'ipcMain',
      'send',
      'sendSync',
      'invoke',
      'on',
      'once',
      'postMessage',
      'require',
      'process',
      'Buffer',
      'global',
      'webFrame',
      'contextBridge'
    ]);

    const claves = [];
    for (const [espacio, metodos] of Object.entries(api)) {
      claves.push(espacio, ...Object.keys(metodos));
    }
    for (const clave of claves) {
      assert.equal(prohibidas.has(clave), false, `No debe exponerse ${clave}`);
    }

    assert.equal(Object.hasOwn(api, 'ipcRenderer'), false);
    assert.equal(Object.hasOwn(api, 'require'), false);
    assert.equal(Object.hasOwn(api, 'process'), false);
  });

  test('todos los canales invocados son explícitos y coinciden con el código fuente', async () => {
    const { api, llamadas, source } = cargarPreload();
    const sesion = { session_token: 'token-de-prueba' };

    recorrerMetodos(api, ({ fn }) => {
      const resultado = fn(sesion, 'argumento-2', 'argumento-3', 'argumento-4');
      assert.equal(typeof resultado.then, 'function');
    });

    await Promise.resolve();

    const canalesLlamados = llamadas.map(([canal]) => canal);
    assert.equal(canalesLlamados.length, Object.values(api).reduce((total, metodos) => total + Object.keys(metodos).length, 0));
    for (const canal of canalesLlamados) {
      assert.match(canal, CANAL_PERMITIDO, `Canal no permitido: ${canal}`);
    }

    const canalesFuente = [...source.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((coincidencia) => coincidencia[1]);
    assert.deepEqual([...new Set(canalesLlamados)].sort(), [...new Set(canalesFuente)].sort());
    assert.doesNotMatch(source, /ipcRenderer\.(send|sendSync|on|once)\(/);
  });

  test('puentes reenvía únicamente la sesión, sin rutas ni argumentos arbitrarios', async () => {
    const { api, llamadas } = cargarPreload();
    const sesion = { session_token: 'token-de-prueba' };

    await api.puentes.verificarPrerrequisitos(sesion, String.raw`C:\Windows\System32\evil.dll`, 'extra');
    assert.deepEqual(llamadas, [['puentes:verificarPrerrequisitos', sesion]]);
  });

  test('mostrarDocumento envía solo sesión e id; nunca una ruta o un data URL', async () => {
    const { api, llamadas } = cargarPreload();
    const sesion = { session_token: 'token-de-prueba' };

    await api.catalogoCum.mostrarDocumento(sesion, 7, '/etc/passwd');
    assert.deepEqual(llamadas, [['catalogoCum:mostrarDocumento', sesion, 7]]);

    llamadas.length = 0;
    await api.catalogoCum.adjuntarDocumento(sesion, 7, { documento_adjunto_nombre: 'x.pdf' }, 'extra');
    assert.deepEqual(llamadas, [
      ['catalogoCum:adjuntarDocumento', sesion, 7, { documento_adjunto_nombre: 'x.pdf' }]
    ]);
  });
});
