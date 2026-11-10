const { app, BrowserWindow, dialog, session } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('../backend/ipcHandlers');
const { iniciarServidorHttp } = require('../backend/server');
const { seed } = require('../backend/database/seeds/seed');
const { mantenimientoAlCerrar, resolveDbPath, closeDb, getDb } = require('../backend/database/connection');
const { prepareDatabase, validateDatabase } = require('../backend/database/startupRecovery');
const { iniciarPlanificadorAutoBackup } = require('../backend/services/backupService');
const { iniciarPlanificadorCloudSync, detenerPlanificadorCloudSync } = require('../backend/services/cloudSyncService');

const isDev = process.env.NODE_ENV === 'development';
const tieneInstancia = app.requestSingleInstanceLock();
let estadoArranque = 'PREPARING';

if (!tieneInstancia) app.quit();

// Flags de alto rendimiento Chromium
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-http-cache', 'false');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#f1f5f9', // Evita flash blanco al abrir
    show: false, // Se muestra solo cuando está listo para pintar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false, // Desactivar corrector ortográfico para ahorrar CPU/RAM
      backgroundThrottling: true // Permitir throttling en segundo plano: menos CPU
    }
  });

  // Mostrar la ventana de forma fluida una vez lista para renderizar
  win.once('ready-to-show', () => {
    clearTimeout(forzarVisible);
    win.show();
  });

  // Red de seguridad: si la pagina nunca emite 'ready-to-show' (Vite caido,
  // error de carga), la ventana se muestra igual con el error visible en vez
  // de dejar un proceso fantasma sin ventana.
  const forzarVisible = setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      console.warn('[main] ready-to-show no disparo: forzando ventana visible.');
      win.show();
    }
  }, 8000);

  win.webContents.on('did-fail-load', (_event, codigo, descripcion, url) => {
    console.error(`[main] Fallo cargando ${url}: [${codigo}] ${descripcion}`);
    clearTimeout(forzarVisible);
    if (!win.isDestroyed()) win.show();
  });

  // CSP estricta en producción; en desarrollo permite 'unsafe-inline' y 'unsafe-eval' para HMR de Vite
  const csp = isDev
    ? "default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: http://localhost:5173; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    : "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  }
}

app.whenReady().then(async () => {
  if (!tieneInstancia) return;
  // Migraciones y seed corren aquí, DENTRO de Electron, usando el mismo módulo
  // nativo (better-sqlite3) que ya está compilado para este proceso. Nunca deben
  // correrse por fuera con `node` normal: ese binario usa otra versión de ABI
  // y el .node compilado para Electron no carga ahí (y viceversa).
  //
  // Van en try/catch para que un fallo de BD muestre un error visible en vez
  // de dejar un proceso fantasma sin ventana (la ventana se crea siempre).
  try {
    const databasePath = resolveDbPath();
    const cursorPath = path.join(path.dirname(databasePath), 'cloud_sync_state.json');
    const resultadoPrep = await prepareDatabase({ databasePath, cursorPath });
    if (!resultadoPrep.migrated) {
      const db = getDb();
      db.transaction(() => seed({ db }))();
      validateDatabase(databasePath, { requireComplete: true });
    }
  } catch (err) {
    estadoArranque = 'FAILED';
    const detalleArranque = err && typeof err.message === 'string' ? err.message : String(err);
    console.error('[main] Preparación segura de SQLite fallida:', err && err.stack ? err.stack : detalleArranque);
    try {
      closeDb();
    } catch (closeError) {
      console.error('[main] No se pudo cerrar SQLite después del fallo de arranque:', closeError.message);
    }
    dialog.showErrorBox(
      'No se puede iniciar Farmacia Control',
      `La base local no pasó las comprobaciones de seguridad o requiere recuperación. No se habilitaron escrituras ni sincronización. Conserve los archivos de recuperación y contacte soporte.\n\nDetalle técnico: ${detalleArranque}`
    );
    app.quit();
    return;
  }

  try { registerIpcHandlers(); } catch (err) {
    estadoArranque = 'FAILED';
    console.error('[main] Fallo registrando handlers IPC:', err.message);
    dialog.showErrorBox('Error al iniciar Farmacia Control', 'No se pudieron preparar los servicios locales.');
    app.quit();
    return;
  }

  // Las pruebas de escritorio usan una SQLite sintética aislada y no deben
  // iniciar servicios de red o trabajos en segundo plano.
  if (process.env.NODE_ENV !== 'test') {
    // El servidor para clientes móviles se activa solo después de validar SQLite.
    try { await iniciarServidorHttp(); } catch (err) {
      console.error('[main] No se pudo iniciar la API HTTP de autenticacion:', err.message);
    }

    iniciarPlanificadorAutoBackup();
    iniciarPlanificadorCloudSync();
  }
  createWindow();
  estadoArranque = 'READY';

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  
  // Prevenir cierre inesperado del proceso
  process.on('uncaughtException', (err) => {
    console.error('[main] Uncaught exception:', err);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[main] Unhandled rejection at:', promise, 'reason:', reason);
  });
});

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  detenerPlanificadorCloudSync();
  if (estadoArranque === 'READY') {
    try { mantenimientoAlCerrar(); } catch (err) {
      console.error('[main] Falló el mantenimiento SQLite al cerrar:', err.message);
    }
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (estadoArranque !== 'READY') return;
  try { mantenimientoAlCerrar(); } catch (err) {
    console.error('[main] Falló el mantenimiento SQLite antes de salir:', err.message);
  }
});
