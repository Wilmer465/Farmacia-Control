const { ipcMain, app, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const authController = require('./controllers/authController');
const medicamentoController = require('./controllers/medicamentoController');
const loteController = require('./controllers/loteController');
const ordenController = require('./controllers/ordenController');
const despachoController = require('./controllers/despachoController');
const entregaController = require('./controllers/entregaController');
const receptorController = require('./controllers/receptorController');
const solicitudEliminacionController = require('./controllers/solicitudEliminacionController');
const solicitudIntercambioController = require('./controllers/solicitudIntercambioController');
const auditoriaController = require('./controllers/auditoriaController');
const reporteController = require('./controllers/reporteController');
const backupController = require('./controllers/backupController');
const sedeService = require('./services/sedeService');

// Todos los canales IPC del sistema se registran aquí. Nada de handlers sueltos
// en main.js: mantiene un único punto auditable de qué operaciones expone el backend.
function registerIpcHandlers() {
  ipcMain.handle('auth:login', (_event, credenciales) => {
    return authController.login(credenciales);
  });

  ipcMain.handle('auth:logout', (_event, usuarioSesion) => {
    return authController.logout(usuarioSesion);
  });

  ipcMain.handle('medicamentos:listar', () => {
    return medicamentoController.listar();
  });

  ipcMain.handle('sedes:listar', () => {
    try {
      return { ok: true, data: sedeService.listar() };
    } catch (err) {
      console.error('[ipcHandlers] sedes:listar error:', err);
      return { ok: false, error: 'Error interno. Intente nuevamente.' };
    }
  });

  ipcMain.handle('medicamentos:crear', (_event, usuarioSesion, data) => {
    return medicamentoController.crear(usuarioSesion, data);
  });

  ipcMain.handle('medicamentos:actualizar', (_event, usuarioSesion, id, data) => {
    return medicamentoController.actualizar(usuarioSesion, id, data);
  });

  ipcMain.handle('lotes:listar', (_event, usuarioSesion, filtros) => {
    return loteController.listar(usuarioSesion, filtros);
  });

  ipcMain.handle('lotes:crear', (_event, usuarioSesion, data) => {
    return loteController.crear(usuarioSesion, data);
  });

  ipcMain.handle('lotes:ajustar', (_event, usuarioSesion, loteId, data) => {
    return loteController.ajustarCantidades(usuarioSesion, loteId, data);
  });

  ipcMain.handle('ordenes:listar', (_event, usuarioSesion, filtros) => {
    return ordenController.listar(usuarioSesion, filtros);
  });

  ipcMain.handle('ordenes:obtener', (_event, usuarioSesion, id) => {
    return ordenController.obtener(usuarioSesion, id);
  });

  ipcMain.handle('ordenes:crear', (_event, usuarioSesion, data) => {
    return ordenController.crear(usuarioSesion, data);
  });

  ipcMain.handle('ordenes:cancelar', (_event, usuarioSesion, id, data) => {
    return ordenController.cancelar(usuarioSesion, id, data);
  });

  ipcMain.handle('ordenes:actualizarDocumentacion', (_event, usuarioSesion, id, data) => {
    return ordenController.actualizarDocumentacion(usuarioSesion, id, data);
  });

  ipcMain.handle('despachos:listarPorOrden', (_event, usuarioSesion, ordenId) => {
    return despachoController.listarPorOrden(usuarioSesion, ordenId);
  });

  ipcMain.handle('despachos:crear', (_event, usuarioSesion, data) => {
    return despachoController.crear(usuarioSesion, data);
  });

  ipcMain.handle('entregas:listar', (_event, usuarioSesion, filtros) => {
    return entregaController.listar(usuarioSesion, filtros);
  });

  ipcMain.handle('entregas:crear', (_event, usuarioSesion, data) => {
    return entregaController.crear(usuarioSesion, data);
  });

  ipcMain.handle('entregas:capturarHuella', () => {
    return entregaController.capturarHuella();
  });

  ipcMain.handle('receptores:buscar', (_event, documento) => {
    return receptorController.buscar(documento);
  });

  ipcMain.handle('receptores:listar', () => {
    return receptorController.listar();
  });

  ipcMain.handle('receptores:guardar', (_event, data) => {
    return receptorController.guardar(data);
  });

  ipcMain.handle('receptores:actualizar', (_event, id, data) => {
    return receptorController.actualizar(id, data);
  });

  ipcMain.handle('solicitudesEliminacion:listar', (_event, usuarioSesion, filtros) => {
    return solicitudEliminacionController.listar(usuarioSesion, filtros);
  });

  ipcMain.handle('solicitudesEliminacion:crear', (_event, usuarioSesion, data) => {
    return solicitudEliminacionController.crear(usuarioSesion, data);
  });

  ipcMain.handle('solicitudesEliminacion:resolver', (_event, usuarioSesion, id, data) => {
    return solicitudEliminacionController.resolver(usuarioSesion, id, data);
  });

  ipcMain.handle('solicitudesIntercambio:listar', (_event, usuarioSesion, filtros) => {
    return solicitudIntercambioController.listar(usuarioSesion, filtros);
  });

  ipcMain.handle('solicitudesIntercambio:crear', (_event, usuarioSesion, data) => {
    return solicitudIntercambioController.crear(usuarioSesion, data);
  });

  ipcMain.handle('solicitudesIntercambio:resolver', (_event, usuarioSesion, id, data) => {
    return solicitudIntercambioController.resolver(usuarioSesion, id, data);
  });

  ipcMain.handle('auditoria:listar', (_event, usuarioSesion, filtros) => {
    return auditoriaController.listar(usuarioSesion, filtros);
  });

  ipcMain.handle('reportes:diario', (_event, usuarioSesion, filtros) => {
    return reporteController.reporteDiario(usuarioSesion, filtros);
  });

  ipcMain.handle('reportes:dashboard', (_event, usuarioSesion, filtros) => {
    return reporteController.dashboard(usuarioSesion, filtros);
  });

  ipcMain.handle('reportes:conciliacion', (_event, usuarioSesion, filtros) => {
    return reporteController.conciliacion(usuarioSesion, filtros);
  });

  ipcMain.handle('reportes:guardarPdf', async (event, nombreSugerido) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { ok: false, error: 'No se encontró la ventana activa.' };

      const nombreLimpio = path.basename(String(nombreSugerido || 'reporte.pdf'))
        .replace(/[<>:"/\\|?*]/g, '_');
      const nombrePdf = nombreLimpio.toLowerCase().endsWith('.pdf')
        ? nombreLimpio
        : `${nombreLimpio}.pdf`;

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Guardar reporte PDF',
        defaultPath: path.join(app.getPath('documents'), nombrePdf),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (canceled || !filePath) return { ok: false, cancelado: true };

      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        landscape: false,
        preferCSSPageSize: true
      });
      fs.writeFileSync(filePath, pdfBuffer);
      return { ok: true, data: { filePath } };
    } catch (err) {
      console.error('[ipcHandlers] reportes:guardarPdf error:', err);
      return { ok: false, error: 'No se pudo generar el PDF. Intente nuevamente.' };
    }
  });

  ipcMain.handle('backups:listar', (_event, usuarioSesion, filtros) => {
    return backupController.listar(usuarioSesion, filtros);
  });

  ipcMain.handle('backups:crear', (_event, usuarioSesion, opciones) => {
    return backupController.crear(usuarioSesion, opciones);
  });

  ipcMain.handle('backups:ultimo', (_event, usuarioSesion, filtros) => {
    return backupController.ultimoRespaldo(usuarioSesion, filtros);
  });

  ipcMain.handle('backups:obtenerConfig', (_event, usuarioSesion) => {
    return backupController.obtenerConfig(usuarioSesion);
  });

  ipcMain.handle('backups:guardarConfig', (_event, usuarioSesion, config) => {
    return backupController.guardarConfig(usuarioSesion, config);
  });

  // Restaurar cierra la conexión y reemplaza el archivo de la BD. Para garantizar que
  // TODO el proceso (incluidas prepared statements en caché) quede limpio con los datos
  // nuevos, si la restauración fue exitosa reiniciamos la app entera — no basta con
  // recargar la ventana, porque el proceso main mantiene su propio estado.
  ipcMain.handle('backups:restaurar', (_event, usuarioSesion, nombreArchivo) => {
    const resultado = backupController.restaurar(usuarioSesion, nombreArchivo);
    if (resultado.ok) {
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 300); // pequeño margen para que la respuesta IPC llegue al renderer antes de cerrar
    }
    return resultado;
  });
}

module.exports = { registerIpcHandlers };
