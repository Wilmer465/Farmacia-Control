'use strict';

// Arnés de integración para la Etapa 4.2.
//
// Ejecuta la app real (main + preload de producción + renderer empaquetado) bajo
// Electron 32 y con una SQLite aislada. Añade canales de diagnóstico SOLO en este
// proceso de prueba; el código de producción no se modifica.
//
// Uso:
//   $env:NODE_ENV='test'
//   $env:FARMACIA_TEST_DB_PATH='C:\...\farmacia.db'
//   $env:HARNESS_SCENARIO='ipc' | 'restore-valid' | 'restore-foreign'
//   electron.exe tests/e2e/electron-real/main_harness.js
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const Database = require('better-sqlite3');
const { app, BrowserWindow, ipcMain, session } = require('electron');

const { prepareDatabase } = require('../../../backend/database/startupRecovery');
const { resolveDbPath, getDb, closeDb } = require('../../../backend/database/connection');
const { registerIpcHandlers } = require('../../../backend/ipcHandlers');
const backupService = require('../../../backend/services/backupService');
const authService = require('../../../backend/services/authService');
const { crearSeguridadIpc } = require('../../../backend/security/ipcSecurity');
const crearScriptIpc = require('./ipc_tests');
const crearScriptIframe = require('./iframe_tests');
const crearScriptExterno = require('./external_tests');
const { crearScriptRestoreValido, crearScriptRestoreAjeno } = require('./restore_tests');

const rendererIndexPath = path.join(__dirname, '..', '..', '..', 'dist', 'renderer', 'index.html');
const preloadProduccion = path.join(__dirname, '..', '..', '..', 'electron', 'preload.js');
const preloadArnes = path.join(__dirname, 'harness-preload.js');

const dbPath = process.env.FARMACIA_TEST_DB_PATH;
if (!dbPath || !path.isAbsolute(dbPath)) {
  console.error('[harness] FARMACIA_TEST_DB_PATH debe ser absoluta.');
  app.exit(2);
}

const root = process.env.HARNESS_ROOT || path.dirname(dbPath);
const resultPath = process.env.HARNESS_RESULT_PATH || path.join(root, 'harness-result.json');
const scenario = process.env.HARNESS_SCENARIO || 'ipc';
const backupDir = path.join(root, 'backups');
const tempDocs = path.join(root, 'docs-temp');
const documentsDir = path.join(root, 'documents');
const userDataDir = path.join(root, 'userdata');

for (const dir of [root, backupDir, tempDocs, documentsDir, userDataDir]) {
  fs.mkdirSync(dir, { recursive: true });
}
// Aísla también el userData de Chromium/Electron de la app real.
app.setPath('userData', userDataDir);

const logs = [];
function logger(level) {
  return (...args) => {
    logs.push({ level, texto: args.map((a) => (a && a.stack ? a.stack : String(a))).join(' ') });
  };
}
const loggerSeguro = {
  warn: logger('warn'),
  error: logger('error'),
  log: logger('log')
};

const shellCalls = [];
const testShell = {
  openPath: async (ruta) => {
    shellCalls.push(ruta);
    return '';
  }
};

let relaunchLlamado = 0;
let exitLlamado = 0;
const testApp = {
  getPath: (nombre) => {
    if (nombre === 'temp') return tempDocs;
    if (nombre === 'documents') return documentsDir;
    if (nombre === 'userData') return userDataDir;
    return root;
  },
  relaunch: () => { relaunchLlamado += 1; },
  exit: () => { exitLlamado += 1; }
};

function frameInfo(event) {
  const sender = event && event.sender;
  const sf = event && event.senderFrame;
  const mf = sender && sender.mainFrame;
  const describir = (marco) => {
    if (!marco) return null;
    let url = null;
    try { url = marco.url; } catch { url = '(inaccesible)'; }
    return {
      routingId: marco.routingId,
      processId: marco.processId,
      type: marco.type,
      url
    };
  };
  let senderUrl = null;
  try { senderUrl = sender.getURL(); } catch { senderUrl = null; }
  return {
    senderUrl,
    sameRef: Boolean(sf && mf && sf === mf),
    senderFrame: describir(sf),
    mainFrame: describir(mf),
    routingIdIgual: Boolean(sf && mf && sf.routingId === mf.routingId),
    processIdIgual: Boolean(sf && mf && sf.processId === mf.processId),
    padre: sf && sf.parent ? describir(sf.parent) : null
  };
}

function prefsDe(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const prefs = win.webContents.getLastWebPreferences() || {};
  return {
    contextIsolation: prefs.contextIsolation,
    sandbox: prefs.sandbox,
    nodeIntegration: prefs.nodeIntegration,
    nodeIntegrationInSubFrames: prefs.nodeIntegrationInSubFrames,
    webviewTag: prefs.webviewTag,
    webSecurity: prefs.webSecurity,
    allowRunningInsecureContent: prefs.allowRunningInsecureContent,
    preload: prefs.preload ? path.basename(prefs.preload) : null
  };
}

function registrarCanalesDeArnes() {
  ipcMain.handle('harness:frameInfoRaw', (event) => frameInfo(event));
  const seguridad = crearSeguridadIpc({
    isDev: false,
    rendererIndexPath,
    logger: loggerSeguro
  });
  const registrar = (nombre, handler) => seguridad.registrar(ipcMain, nombre, handler);

  registrar('harness:protegido', (event) => frameInfo(event));
  registrar('harness:errorRuta', () => {
    throw new Error('ENOENT: no such file or directory, open C:\\secreto\\farmacia.db');
  });
  registrar('harness:errorControlado', () => ({
    ok: false,
    error: 'SqliteError: no such table: usuarios en C:\\secreto\\farmacia.db'
  }));
  registrar('harness:errorSqlite', () => {
    const error = new Error('SQLITE_CORRUPT: database disk image is malformed');
    error.code = 'SQLITE_CORRUPT';
    throw error;
  });
  registrar('harness:prefs', (event) => prefsDe(event));
  ipcMain.handle('harness:shellCallsRaw', () => shellCalls.slice());
  registrar('harness:marcarSede', (_event, nombre) => {
    const db = getDb();
    db.prepare("INSERT INTO sedes (nombre, ciudad, estado) VALUES (?, 'Test', 'ACTIVO')").run(String(nombre));
    return { insertadas: 1 };
  });
  registrar('harness:contarSede', (_event, nombre) => {
    const db = getDb();
    return { total: db.prepare('SELECT COUNT(*) AS total FROM sedes WHERE nombre = ?').get(String(nombre)).total };
  });
  registrar('harness:inyectarDocumento', (_event, id, documento) => {
    const db = getDb();
    db.prepare(`UPDATE catalogo_cum
      SET documento_adjunto_nombre = ?, documento_adjunto_data = ?, documento_adjunto_tipo = ?
      WHERE id = ?`).run(
      documento.documento_adjunto_nombre,
      documento.documento_adjunto_data,
      documento.documento_adjunto_tipo,
      Number(id)
    );
    return { actualizado: true };
  });
  registrar('harness:dbInfo', () => {
    const db = getDb();
    const auditoria = db.prepare(`SELECT COUNT(*) AS total FROM auditoria
      WHERE accion = 'RESTAURAR_RESPALDO' AND resultado = 'EXITO'`).get().total;
    return {
      ruta: resolveDbPath(),
      tablas: db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name),
      marcadorAjeno: db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name='marcador_ajeno'").get().total,
      auditoriaRestauracionExitosa: auditoria
    };
  });
}

function crearVentana({ subframes = false } = {}) {
  return new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      preload: preloadProduccion,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: subframes,
      devTools: false,
      navigateOnDragDrop: false,
      spellcheck: false
    }
  });
}

async function crearVentanaRenderer(opciones) {
  const win = crearVentana(opciones);
  await win.loadFile(rendererIndexPath);
  return win;
}

async function ejecutarEn(win, script) {
  return win.webContents.executeJavaScript(script, true);
}

function crearServidorExterno() {
  return new Promise((resolve) => {
    const servidor = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body>origen externo</body></html>');
    });
    servidor.listen(0, '127.0.0.1', () => {
      resolve({ servidor, puerto: servidor.address().port });
    });
  });
}

function escribirResultado(resultado) {
  const salida = {
    escenario: scenario,
    dbPath,
    backupDir,
    tempDocs,
    fecha: new Date().toISOString(),
    relaunchLlamado,
    exitLlamado,
    logs,
    ...resultado
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(salida, null, 2)}\n`, 'utf8');
  console.log(`HARNESS_RESULT:${JSON.stringify(salida)}`);
  return salida;
}

async function escenarioIpc() {
  const token = authService.login('wilmer', 'Wilmer465*').session_token;

  const winPrincipal = await crearVentanaRenderer({ subframes: false });
  const resultadoPrincipal = await ejecutarEn(winPrincipal, crearScriptIpc(token));

  const winSubframes = await crearVentanaRenderer({ subframes: true });
  const resultadoIframe = await ejecutarEn(winSubframes, crearScriptIframe(token));

  const { servidor, puerto } = await crearServidorExterno();
  const winExterno = crearVentana({ subframes: false });
  await winExterno.loadURL(`http://127.0.0.1:${puerto}/`);
  const resultadoExterno = await ejecutarEn(winExterno, crearScriptExterno(token));
  servidor.close();

  return {
    resultadoPrincipal,
    resultadoIframe,
    resultadoExterno,
    prefsSubframes: winSubframes.webContents.getLastWebPreferences(),
    prefsExterno: winExterno.webContents.getLastWebPreferences()
  };
}

async function escenarioRestoreValido() {
  const token = authService.login('wilmer', 'Wilmer465*').session_token;
  const win = await crearVentanaRenderer({ subframes: false });
  const resultado = await ejecutarEn(win, crearScriptRestoreValido(token));
  // El handler de producción programa el reinicio 300 ms después de responder.
  // El `app` del arnés es un doble: esperar aquí permite observar
  // relaunchLlamado/exitLlamado sin cerrar la ventana.
  await new Promise((resolve) => setTimeout(resolve, 700));
  return { resultado };
}

async function escenarioRestoreAjeno() {
  const nombreAjeno = 'farmacia_backup_global_20260101_000000.db';
  const rutaAjena = path.join(backupDir, nombreAjeno);
  const dbAjena = new Database(rutaAjena);
  dbAjena.exec(`
    CREATE TABLE marcador_ajeno (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      valor TEXT NOT NULL
    );
    INSERT INTO marcador_ajeno (valor) VALUES ('archivo ajeno aceptado');
  `);
  dbAjena.close();

  const token = authService.login('wilmer', 'Wilmer465*').session_token;
  const win = await crearVentanaRenderer({ subframes: false });
  const resultado = await ejecutarEn(win, crearScriptRestoreAjeno(token, nombreAjeno));
  await new Promise((resolve) => setTimeout(resolve, 700));

  let inspeccion = null;
  let errorInspeccion = null;
  try {
    closeDb();
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      inspeccion = {
        tablas: db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name),
        marcadorAjeno: db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name='marcador_ajeno'").get().total
      };
    } finally {
      db.close();
    }
  } catch (err) {
    errorInspeccion = err.message;
  }

  return { nombreAjeno, resultado, inspeccion, errorInspeccion };
}

async function escenarioRestoreCorrupto() {
  // Se genera un respaldo auténtico y luego se corrompe su contenido. Así el
  // rechazo prueba la validación de huella, no la ausencia de manifiesto.
  const creado = await backupService.crear(null, true);
  const rutaCorrupta = path.join(backupDir, creado.nombre);
  fs.writeFileSync(rutaCorrupta, Buffer.from('esto no es una base sqlite valida'));

  const token = authService.login('wilmer', 'Wilmer465*').session_token;
  const win = await crearVentanaRenderer({ subframes: false });
  const resultado = await ejecutarEn(win, crearScriptRestoreAjeno(token, creado.nombre));
  await new Promise((resolve) => setTimeout(resolve, 700));

  closeDb();
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  let inspeccion = null;
  try {
    inspeccion = {
      tablas: db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name),
      sedes: db.prepare('SELECT COUNT(*) AS total FROM sedes').get().total
    };
  } finally {
    db.close();
  }

  return { nombreCorrupto: creado.nombre, resultado, inspeccion };
}

app.whenReady().then(async () => {
  try {
    console.log('[harness] whenReady');
    session.defaultSession.setPreloads([preloadArnes]);
    backupService.setDirectorioRespaldos(backupDir);
    backupService.setClaveManifiestoPath(path.join(root, 'backup-signing.key'));
    const cursorPath = path.join(path.dirname(dbPath), 'cloud_sync_state.json');
    console.log('[harness] preparando base');
    await prepareDatabase({ databasePath: dbPath, cursorPath });
    console.log('[harness] base preparada');
    registerIpcHandlers({
      app: testApp,
      shell: testShell,
      rendererIndexPath,
      isDev: false,
      logger: loggerSeguro
    });
    console.log('[harness] handlers registrados');
    registrarCanalesDeArnes();

    let resultado;
    if (scenario === 'restore-valid') resultado = await escenarioRestoreValido();
    else if (scenario === 'restore-foreign') resultado = await escenarioRestoreAjeno();
    else if (scenario === 'restore-corrupt') resultado = await escenarioRestoreCorrupto();
    else resultado = await escenarioIpc();
    console.log('[harness] escenario terminado');

    escribirResultado(resultado);
    setTimeout(() => app.exit(0), 250);
  } catch (err) {
    console.error('[harness] error', err && err.stack ? err.stack : err);
    escribirResultado({ error: err && err.stack ? err.stack : String(err) });
    setTimeout(() => app.exit(1), 250);
  }
});
