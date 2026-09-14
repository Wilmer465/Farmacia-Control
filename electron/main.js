const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('../backend/ipcHandlers');
const { runMigrations } = require('../backend/database/migrate');
const { seed } = require('../backend/database/seeds/seed');
const { iniciarPlanificadorAutoBackup } = require('../backend/services/backupService');
const { iniciarPlanificadorCloudSync, detenerPlanificadorCloudSync } = require('../backend/services/cloudSyncService');

const isDev = process.env.NODE_ENV === 'development';

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
      backgroundThrottling: false // Mantiene rendimiento óptimo
    }
  });

  // Mostrar la ventana de forma fluida una vez lista para renderizar
  win.once('ready-to-show', () => {
    win.show();
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
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Migraciones y seed corren aquí, DENTRO de Electron, usando el mismo módulo
  // nativo (better-sqlite3) que ya está compilado para este proceso. Nunca deben
  // correrse por fuera con `node` normal: ese binario usa otra versión de ABI
  // y el .node compilado para Electron no carga ahí (y viceversa).
  runMigrations();
  seed(); // idempotente: si ya existen roles/sede/superadmin, no hace nada
  registerIpcHandlers();
  iniciarPlanificadorAutoBackup();
  iniciarPlanificadorCloudSync();
  createWindow();

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

app.on('window-all-closed', () => {
  detenerPlanificadorCloudSync();
  if (process.platform !== 'darwin') app.quit();
});
