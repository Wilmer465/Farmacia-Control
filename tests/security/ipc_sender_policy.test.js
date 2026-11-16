'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  TEXTO_ORIGEN_NO_AUTORIZADO,
  crearSeguridadIpc
} = require('../../backend/security/ipcSecurity');
const { FALLBACK_POR_DEFECTO } = require('../../shared/errorSanitizer');

function crearEvento({ url = 'http://localhost:5173/', marcoDistinto = false, sinFrame = false } = {}) {
  const mainFrame = { id: 'principal' };
  return {
    sender: {
      getURL: () => url,
      mainFrame
    },
    senderFrame: sinFrame ? undefined : (marcoDistinto ? { id: 'iframe' } : mainFrame)
  };
}

function crearLogger() {
  const eventos = { warn: [], error: [] };
  return {
    eventos,
    logger: {
      warn: (...args) => eventos.warn.push(args),
      error: (...args) => eventos.error.push(args)
    }
  };
}

function crearIpcMainFalso() {
  const handlers = new Map();
  return {
    handlers,
    handle: (canal, handler) => handlers.set(canal, handler)
  };
}

describe('Validación del remitente IPC', () => {
  test('registra un handler y solo lo ejecuta para el origen permitido', async () => {
    const ipcMain = crearIpcMainFalso();
    const { logger } = crearLogger();
    const seguridad = crearSeguridadIpc({ isDev: true, logger });
    let llamadas = 0;

    seguridad.registrar(ipcMain, 'prueba:canal', async () => {
      llamadas += 1;
      return { ok: true, data: 'ejecutado' };
    });

    assert.ok(ipcMain.handlers.has('prueba:canal'));
    const handler = ipcMain.handlers.get('prueba:canal');

    const permitida = await handler(crearEvento(), 'argumento');
    assert.deepEqual(permitida, { ok: true, data: 'ejecutado' });
    assert.equal(llamadas, 1);

    const denegadas = [
      crearEvento({ url: 'https://evil.example/' }),
      crearEvento({ url: 'http://localhost:5174/' }),
      crearEvento({ url: 'file:///C:/Windows/System32/calc.exe' }),
      crearEvento({ marcoDistinto: true }),
      crearEvento({ sinFrame: true })
    ];
    for (const evento of denegadas) {
      assert.deepEqual(await handler(evento), {
        ok: false,
        error: TEXTO_ORIGEN_NO_AUTORIZADO
      });
    }
    assert.equal(llamadas, 1, 'el handler no debe ejecutarse con remitentes rechazados');
  });

  test('en producción solo acepta el index.html empaquetado', async () => {
    const rendererIndexPath = path.join(os.tmpdir(), 'farmacia-test', 'dist', 'renderer', 'index.html');
    const seguridad = crearSeguridadIpc({ isDev: false, rendererIndexPath, logger: crearLogger().logger });
    let llamadas = 0;
    const handler = seguridad.envolver(() => {
      llamadas += 1;
      return { ok: true };
    });

    const permitido = crearEvento({ url: pathToFileURL(rendererIndexPath).href });
    assert.deepEqual(await handler(permitido), { ok: true });
    assert.equal(llamadas, 1);

    for (const url of [
      pathToFileURL(path.join(path.dirname(rendererIndexPath), 'otro.html')).href,
      'http://localhost:5173/',
      'file:///C:/Windows/System32/calc.exe'
    ]) {
      assert.deepEqual(await handler(crearEvento({ url })), {
        ok: false,
        error: TEXTO_ORIGEN_NO_AUTORIZADO
      });
    }
    assert.equal(llamadas, 1);
  });

  test('falla cerrado si el evento, sender o getURL no existen o lanzan', async () => {
    const seguridad = crearSeguridadIpc({ isDev: true, logger: crearLogger().logger });
    let llamadas = 0;
    const handler = seguridad.envolver(() => {
      llamadas += 1;
      return { ok: true };
    });

    const invalidos = [
      null,
      undefined,
      {},
      { sender: null },
      { sender: {} },
      { sender: { getURL: () => { throw new Error('sin URL'); } } },
      { sender: { getURL: () => 'http://localhost:5173/' } }
    ];
    for (const evento of invalidos) {
      assert.deepEqual(await handler(evento), {
        ok: false,
        error: TEXTO_ORIGEN_NO_AUTORIZADO
      });
    }
    assert.equal(llamadas, 0);
  });

  test('sanea excepciones y respuestas { ok:false } del handler', async () => {
    const { eventos, logger } = crearLogger();
    const seguridad = crearSeguridadIpc({ isDev: true, logger });

    const lanzaRuta = seguridad.envolver(() => {
      throw new Error('ENOENT: C:\\Users\\USER-D\\data\\farmacia.db');
    });
    assert.deepEqual(await lanzaRuta(crearEvento()), {
      ok: false,
      error: FALLBACK_POR_DEFECTO
    });

    const lanzaFuncional = seguridad.envolver(() => {
      throw new Error('La unidad de medida es obligatoria.');
    });
    assert.deepEqual(await lanzaFuncional(crearEvento()), {
      ok: false,
      error: 'La unidad de medida es obligatoria.'
    });

    const devuelveRuta = seguridad.envolver(async () => ({
      ok: false,
      error: 'SqliteError: no such table: usuarios'
    }));
    assert.deepEqual(await devuelveRuta(crearEvento()), {
      ok: false,
      error: FALLBACK_POR_DEFECTO
    });

    const devuelveFuncional = seguridad.envolver(() => ({
      ok: false,
      error: 'No se encontró la ventana activa.'
    }));
    assert.deepEqual(await devuelveFuncional(crearEvento()), {
      ok: false,
      error: 'No se encontró la ventana activa.'
    });

    assert.ok(eventos.error.length >= 1, 'los errores internos se registran en el proceso main');
  });

  test('no altera respuestas exitosas, arrays ni valores primitivos', async () => {
    const seguridad = crearSeguridadIpc({ isDev: true, logger: crearLogger().logger });
    const datos = [{ id: 1 }, { id: 2 }];

    assert.deepEqual(await seguridad.envolver(() => ({ ok: true, data: datos }))(crearEvento()), {
      ok: true,
      data: datos
    });
    assert.deepEqual(await seguridad.envolver(() => datos)(crearEvento()), datos);
    assert.equal(await seguridad.envolver(() => 'texto')(crearEvento()), 'texto');
    assert.equal(await seguridad.envolver(() => null)(crearEvento()), null);
  });

  test('rechaza registrar handlers que no son funciones o un ipcMain inválido', () => {
    const seguridad = crearSeguridadIpc({ isDev: true, logger: crearLogger().logger });
    assert.throws(() => seguridad.envolver(null), /debe ser una función/);
    assert.throws(() => seguridad.registrar({}, 'canal', () => ({ ok: true })), /ipcMain\.handle/);
  });

  test('el log de rechazo no incluye el argumento ni datos del renderer', async () => {
    const { eventos, logger } = crearLogger();
    const seguridad = crearSeguridadIpc({ isDev: true, logger });
    const handler = seguridad.envolver(() => ({ ok: true }), { nombre: 'canal:prueba' });

    await handler(crearEvento({ url: 'https://evil.example/' }), {
      session_token: 'token-secreto',
      password: 'clave-secreta'
    });

    const texto = JSON.stringify(eventos.warn);
    assert.match(texto, /canal:prueba/);
    assert.doesNotMatch(texto, /token-secreto|clave-secreta/);
  });
});
