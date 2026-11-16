'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const { registerIpcHandlers } = require('../../backend/ipcHandlers');
const sessionService = require('../../backend/services/sessionService');
const usuarioRepository = require('../../backend/repositories/usuarioRepository');

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'binary');
const PDF_BASE64 = PDF.toString('base64');

function crearEvento(url = 'http://localhost:5173/') {
  const mainFrame = { id: 'frame-principal' };
  return {
    sender: { getURL: () => url, mainFrame },
    senderFrame: mainFrame
  };
}

function documentoPdf(overrides = {}) {
  return {
    documento_adjunto_nombre: 'formula.pdf',
    documento_adjunto_data: PDF_BASE64,
    documento_adjunto_tipo: 'PDF',
    ...overrides
  };
}

describe('Registro IPC endurecido y flujos de seguridad', () => {
  let db;
  let handlers;
  let tempDir;
  let documentosDir;
  let shellFalso;
  let dialogFalso;
  let ventanaFalsa;
  let BrowserWindowFalso;
  let sesionSuperadmin;
  let sesionInventario;
  let usuarioInventario;

  beforeEach(() => {
    db = createTestDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-ipc-test-'));
    documentosDir = path.join(tempDir, 'documents');
    fs.mkdirSync(documentosDir, { recursive: true });

    handlers = new Map();
    shellFalso = {
      rutas: [],
      openPath: async (ruta) => {
        shellFalso.rutas.push(ruta);
        return '';
      }
    };
    dialogFalso = {
      opciones: null,
      resultado: { canceled: true },
      showSaveDialog: async (_ventana, opciones) => {
        dialogFalso.opciones = opciones;
        return dialogFalso.resultado;
      }
    };
    ventanaFalsa = {
      webContents: {
        printToPDF: async () => Buffer.from('%PDF-1.7\n')
      }
    };
    BrowserWindowFalso = {
      fromWebContents: () => ventanaFalsa
    };

    registerIpcHandlers({
      ipcMain: {
        handle: (canal, handler) => handlers.set(canal, handler)
      },
      app: {
        getPath: (nombre) => (nombre === 'documents' ? documentosDir : tempDir),
        relaunch: () => {},
        exit: () => {}
      },
      dialog: dialogFalso,
      BrowserWindow: BrowserWindowFalso,
      shell: shellFalso,
      isDev: true,
      rendererIndexPath: path.join(tempDir, 'dist', 'renderer', 'index.html'),
      logger: { warn: () => {}, error: () => {} }
    });

    const wilmer = usuarioRepository.findByUsername('wilmer');
    usuarioInventario = usuarioRepository.findByUsername('inv_quibdo');
    sesionSuperadmin = { session_token: sessionService.crearSesion(wilmer.id) };
    sesionInventario = { session_token: sessionService.crearSesion(usuarioInventario.id) };
  });

  afterEach(() => {
    teardownTestDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function invocar(canal, evento, ...args) {
    const handler = handlers.get(canal);
    assert.equal(typeof handler, 'function', `El canal ${canal} debe estar registrado`);
    return handler(evento, ...args);
  }

  function crearRegistroCum(cum = 'MAN-IPC-001') {
    return invocar('catalogoCum:crearManual', crearEvento(), sesionSuperadmin, {
      cum,
      producto: 'Medicamento IPC',
      registro_sanitario: 'INVIMA 2020M-IPC'
    });
  }

  test('registra todos los canales a través del envoltorio seguro, incluidos sedes:crear y mostrarDocumento', () => {
    assert.ok(handlers.size >= 50, `Se esperaban al menos 50 canales, hay ${handlers.size}`);
    for (const canal of [
      'auth:login',
      'auth:logout',
      'medicamentos:listar',
      'sedes:listar',
      'sedes:crear',
      'sedes:eliminar',
      'ordenes:crear',
      'backups:restaurar',
      'usuarios:eliminarDefinitivo',
      'catalogoCum:adjuntarDocumento',
      'catalogoCum:mostrarDocumento',
      'puentes:verificarPrerrequisitos'
    ]) {
      assert.ok(handlers.has(canal), `Falta el canal ${canal}`);
    }
  });

  test('un remitente no autorizado no ejecuta el handler ni produce efectos', async () => {
    const antes = db.prepare('SELECT COUNT(*) AS total FROM sedes').get().total;

    const respuesta = await invocar(
      'sedes:crear',
      crearEvento('https://evil.example/'),
      sesionSuperadmin,
      { nombre: 'Sede Inyectada' }
    );

    assert.deepEqual(respuesta, { ok: false, error: 'Origen no autorizado.' });
    const despues = db.prepare('SELECT COUNT(*) AS total FROM sedes').get().total;
    assert.equal(despues, antes, 'no debe crearse ninguna sede');
  });

  test('un iframe o un remitente sin frame principal se rechaza antes de tocar la sesión', async () => {
    const eventoIframe = crearEvento();
    eventoIframe.senderFrame = { id: 'iframe' };

    assert.deepEqual(
      await invocar('sedes:listar', eventoIframe, sesionSuperadmin),
      { ok: false, error: 'Origen no autorizado.' }
    );

    const eventoSinFrame = crearEvento();
    delete eventoSinFrame.senderFrame;
    assert.deepEqual(
      await invocar('sedes:listar', eventoSinFrame, sesionSuperadmin),
      { ok: false, error: 'Origen no autorizado.' }
    );
  });

  test('sin sesión o con token falsificado se rechaza la consulta de sedes', async () => {
    const sinSesion = await invocar('sedes:listar', crearEvento(), null);
    assert.equal(sinSesion.ok, false);
    assert.match(sinSesion.error, /Sesión de usuario inválida/);

    const tokenFalso = await invocar('sedes:listar', crearEvento(), { session_token: 'a'.repeat(64) });
    assert.equal(tokenFalso.ok, false);
    assert.match(tokenFalso.error, /Sesión expirada o inválida/);

    const sesionManipulada = await invocar('sedes:listar', crearEvento(), {
      session_token: sesionSuperadmin.session_token,
      rol_nombre: 'SUPERADMIN',
      id: 1
    });
    assert.equal(sesionManipulada.ok, true, 'el rol se resuelve de la BD, no del renderer');
  });

  test('sedes:listar respeta el alcance por rol resuelto en el backend', async () => {
    const superadmin = await invocar('sedes:listar', crearEvento(), sesionSuperadmin);
    assert.equal(superadmin.ok, true);
    assert.ok(superadmin.data.length > 1, 'el SUPERADMIN ve todas las sedes');

    const inventario = await invocar('sedes:listar', crearEvento(), sesionInventario);
    assert.equal(inventario.ok, true);
    assert.equal(inventario.data.length, 1);
    assert.equal(inventario.data[0].id, usuarioInventario.sede_id);

    const sedesAjenas = inventario.data.filter((sede) => sede.id !== usuarioInventario.sede_id);
    assert.deepEqual(sedesAjenas, [], 'no debe filtrar sedes ajenas');
  });

  test('sedes:crear conserva la restricción de SUPERADMIN y valida el nombre', async () => {
    const denegada = await invocar('sedes:crear', crearEvento(), sesionInventario, { nombre: 'Sede Inventario' });
    assert.equal(denegada.ok, false);
    assert.match(denegada.error, /solo el Superadministrador/);

    const vacia = await invocar('sedes:crear', crearEvento(), sesionSuperadmin, { nombre: '   ' });
    assert.equal(vacia.ok, false);
    assert.match(vacia.error, /nombre de la sede es obligatorio/);

    const creada = await invocar('sedes:crear', crearEvento(), sesionSuperadmin, {
      nombre: 'Sede IPC',
      ciudad: 'Bogotá'
    });
    assert.equal(creada.ok, true);
    assert.equal(creada.data.nombre, 'Sede IPC');
    assert.ok(db.prepare('SELECT id FROM sedes WHERE nombre = ?').get('Sede IPC'));
  });

  test('catalogoCum:adjuntarDocumento rechaza adjuntos manipulados y IDs alterados', async () => {
    const registro = await crearRegistroCum();
    assert.equal(registro.ok, true);
    const cumId = registro.data.id;

    const manipulados = [
      { documento_adjunto_nombre: 'x.pdf', documento_adjunto_data: '%%%', documento_adjunto_tipo: 'PDF' },
      {
        documento_adjunto_nombre: 'x.pdf',
        documento_adjunto_data: Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64'),
        documento_adjunto_tipo: 'PDF'
      },
      { documento_adjunto_nombre: '../x.pdf', documento_adjunto_data: PDF_BASE64, documento_adjunto_tipo: 'PDF' },
      { documento_adjunto_nombre: 'x.pdf', documento_adjunto_data: PDF_BASE64, documento_adjunto_tipo: 'IMAGEN' }
    ];

    for (const datos of manipulados) {
      const respuesta = await invocar('catalogoCum:adjuntarDocumento', crearEvento(), sesionSuperadmin, cumId, datos);
      assert.equal(respuesta.ok, false);
      assert.equal(typeof respuesta.error, 'string');
      assert.doesNotMatch(respuesta.error, /C:\\|SELECT|SqliteError|node_modules/);
    }

    const fila = db.prepare('SELECT documento_adjunto_data FROM catalogo_cum WHERE id = ?').get(cumId);
    assert.equal(fila.documento_adjunto_data, null, 'un adjunto inválido no debe guardarse');

    for (const idManipulado of ['1 OR 1=1', 0, -5, 1.5]) {
      const respuesta = await invocar(
        'catalogoCum:adjuntarDocumento',
        crearEvento(),
        sesionSuperadmin,
        idManipulado,
        documentoPdf()
      );
      assert.equal(respuesta.ok, false);
      assert.match(respuesta.error, /Registro CUM inválido/);
    }
  });

  test('catalogoCum:adjuntarDocumento conserva la restricción de rol ADMIN/SUPERADMIN', async () => {
    const registro = await crearRegistroCum('MAN-IPC-002');
    const respuesta = await invocar(
      'catalogoCum:adjuntarDocumento',
      crearEvento(),
      sesionInventario,
      registro.data.id,
      documentoPdf()
    );
    assert.equal(respuesta.ok, false);
    assert.match(respuesta.error, /No tiene permisos/);
  });

  test('catalogoCum:mostrarDocumento no abre nada para un remitente no autorizado', async () => {
    const registro = await crearRegistroCum('MAN-IPC-003');
    const adjunto = await invocar(
      'catalogoCum:adjuntarDocumento',
      crearEvento(),
      sesionSuperadmin,
      registro.data.id,
      documentoPdf()
    );
    assert.equal(adjunto.ok, true);

    const respuesta = await invocar(
      'catalogoCum:mostrarDocumento',
      crearEvento('https://evil.example/'),
      sesionSuperadmin,
      registro.data.id
    );

    assert.deepEqual(respuesta, { ok: false, error: 'Origen no autorizado.' });
    assert.equal(shellFalso.rutas.length, 0, 'el visor del sistema no debe invocarse');
  });

  test('catalogoCum:mostrarDocumento materializa el archivo y no devuelve la ruta al renderer', async () => {
    const registro = await crearRegistroCum('MAN-IPC-004');
    await invocar('catalogoCum:adjuntarDocumento', crearEvento(), sesionSuperadmin, registro.data.id, documentoPdf());

    const respuesta = await invocar(
      'catalogoCum:mostrarDocumento',
      crearEvento(),
      sesionSuperadmin,
      registro.data.id
    );

    assert.deepEqual(respuesta, {
      ok: true,
      data: { abierto: true, nombre: 'formula.pdf', tipo: 'PDF' }
    });
    assert.equal(JSON.stringify(respuesta).includes(tempDir), false);
    assert.equal(shellFalso.rutas.length, 1);
    assert.deepEqual(fs.readFileSync(shellFalso.rutas[0]), PDF);
    assert.equal(path.basename(shellFalso.rutas[0]), 'documento.pdf');

    const sinDocumento = await crearRegistroCum('MAN-IPC-005');
    const respuestaSinDocumento = await invocar(
      'catalogoCum:mostrarDocumento',
      crearEvento(),
      sesionSuperadmin,
      sinDocumento.data.id
    );
    assert.equal(respuestaSinDocumento.ok, false);
    assert.match(respuestaSinDocumento.error, /No hay documento adjunto/);
  });

  test('puentes:verificarPrerrequisitos exige sesión y origen autorizado', async () => {
    const sinSesion = await invocar('puentes:verificarPrerrequisitos', crearEvento(), null);
    assert.equal(sinSesion.ok, false);
    assert.match(sinSesion.error, /Sesión de usuario inválida/);

    const tokenFalso = await invocar(
      'puentes:verificarPrerrequisitos',
      crearEvento(),
      { session_token: 'token-invalido' }
    );
    assert.equal(tokenFalso.ok, false);
    assert.match(tokenFalso.error, /Sesión expirada o inválida/);

    const origenAjeno = await invocar(
      'puentes:verificarPrerrequisitos',
      crearEvento('file:///C:/Windows/System32/calc.exe'),
      sesionSuperadmin
    );
    assert.deepEqual(origenAjeno, { ok: false, error: 'Origen no autorizado.' });
  });

  test('reportes:guardarPdf no permite escapar del directorio de documentos con el nombre sugerido', async () => {
    const respuesta = await invocar(
      'reportes:guardarPdf',
      crearEvento(),
      sesionSuperadmin,
      '../../../../evil.exe'
    );

    assert.deepEqual(respuesta, { ok: false, cancelado: true });
    assert.ok(dialogFalso.opciones);
    assert.equal(path.dirname(dialogFalso.opciones.defaultPath), documentosDir);
    assert.equal(path.basename(dialogFalso.opciones.defaultPath), 'evil.exe.pdf');
  });

  test('los errores de negocio se devuelven sin detalles internos', async () => {
    const respuesta = await invocar(
      'catalogoCum:buscarPorProducto',
      crearEvento(),
      sesionSuperadmin,
      { $ne: null },
      20
    );

    assert.equal(respuesta.ok, false);
    assert.equal(respuesta.error, 'El texto de búsqueda es inválido.');
    assert.doesNotMatch(respuesta.error, /C:\\|SqliteError|node_modules|SELECT/);
  });
});
