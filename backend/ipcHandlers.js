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
const cloudSyncController = require('./controllers/cloudSyncController');
const usuarioController = require('./controllers/usuarioController');
const { sincronizarEnSegundoPlano } = require('./services/cloudSyncService');
const sedeService = require('./services/sedeService');

// Valida la estructura mínima de usuarioSesion para prevenir escalación de privilegios
// desde un frontend comprometido.
function validarUsuarioSesion(usuarioSesion) {
  if (!usuarioSesion || typeof usuarioSesion !== 'object') {
    throw new Error('Sesión de usuario inválida: objeto faltante o malformado');
  }
  // Para SUPERADMIN, sede_id es null intencionalmente (acceso global a todas las sedes)
  const required = ['id', 'username', 'rol_nombre', 'estado'];
  for (const field of required) {
    if (usuarioSesion[field] === undefined || usuarioSesion[field] === null) {
      throw new Error(`Sesión de usuario inválida: campo '${field}' faltante`);
    }
  }
  if (!('sede_id' in usuarioSesion)) {
    throw new Error("Sesión de usuario inválida: campo 'sede_id' faltante");
  }
  if (
    typeof usuarioSesion.id !== 'number' ||
    (usuarioSesion.sede_id !== null && typeof usuarioSesion.sede_id !== 'number')
  ) {
    throw new Error('Sesión de usuario inválida: tipos de campos incorrectos');
  }
  return true;
}

// Wrapper que valida usuarioSesion antes de pasar al controlador
function conValidacionSesion(accion) {
  return (_event, usuarioSesion, ...args) => {
    validarUsuarioSesion(usuarioSesion);
    return accion(usuarioSesion, ...args);
  };
}

function conSyncDespuesDeCambio(nombre, accion) {
  return (...args) => {
    const resultado = accion(...args);
    const programar = (res) => {
      if (!res || res.ok !== false) sincronizarEnSegundoPlano(nombre);
      return res;
    };
    if (resultado && typeof resultado.then === 'function') {
      return resultado.then(programar);
    }
    return programar(resultado);
  };
}

// Todos los canales IPC del sistema se registran aquí. Nada de handlers sueltos
// en main.js: mantiene un único punto auditable de qué operaciones expone el backend.
function registerIpcHandlers() {
  ipcMain.handle('auth:login', conSyncDespuesDeCambio('auth:login', (_event, credenciales) => {
    return authController.login(credenciales);
  }));

ipcMain.handle('auth:logout', conSyncDespuesDeCambio('auth:logout', conValidacionSesion((usuarioSesion) => {
    return authController.logout(usuarioSesion);
  })));

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

  ipcMain.handle('medicamentos:crear', conSyncDespuesDeCambio('medicamentos:crear', conValidacionSesion((usuarioSesion, data) => {
    return medicamentoController.crear(usuarioSesion, data);
  })));

  ipcMain.handle('medicamentos:actualizar', conSyncDespuesDeCambio('medicamentos:actualizar', conValidacionSesion((usuarioSesion, id, data) => {
    return medicamentoController.actualizar(usuarioSesion, id, data);
  })));

  ipcMain.handle('lotes:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return loteController.listar(usuarioSesion, filtros);
  }));

  ipcMain.handle('lotes:crear', conSyncDespuesDeCambio('lotes:crear', conValidacionSesion((usuarioSesion, data) => {
    return loteController.crear(usuarioSesion, data);
  })));

  ipcMain.handle('lotes:ajustar', conSyncDespuesDeCambio('lotes:ajustar', conValidacionSesion((usuarioSesion, loteId, data) => {
    return loteController.ajustarCantidades(usuarioSesion, loteId, data);
  })));

  ipcMain.handle('ordenes:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return ordenController.listar(usuarioSesion, filtros);
  }));

  ipcMain.handle('ordenes:obtener', conValidacionSesion((usuarioSesion, id) => {
    return ordenController.obtener(usuarioSesion, id);
  }));

  ipcMain.handle('ordenes:crear', conSyncDespuesDeCambio('ordenes:crear', conValidacionSesion((usuarioSesion, data) => {
    return ordenController.crear(usuarioSesion, data);
  })));

  ipcMain.handle('ordenes:cancelar', conSyncDespuesDeCambio('ordenes:cancelar', conValidacionSesion((usuarioSesion, id, data) => {
    return ordenController.cancelar(usuarioSesion, id, data);
  })));

  ipcMain.handle('ordenes:actualizarDocumentacion', conSyncDespuesDeCambio('ordenes:actualizarDocumentacion', conValidacionSesion((usuarioSesion, id, data) => {
    return ordenController.actualizarDocumentacion(usuarioSesion, id, data);
  })));

  ipcMain.handle('despachos:listarPorOrden', conValidacionSesion((usuarioSesion, ordenId) => {
    return despachoController.listarPorOrden(usuarioSesion, ordenId);
  }));

  ipcMain.handle('despachos:crear', conSyncDespuesDeCambio('despachos:crear', conValidacionSesion((usuarioSesion, data) => {
    return despachoController.crear(usuarioSesion, data);
  })));

  ipcMain.handle('entregas:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return entregaController.listar(usuarioSesion, filtros);
  }));

  ipcMain.handle('entregas:crear', conSyncDespuesDeCambio('entregas:crear', conValidacionSesion((usuarioSesion, data) => {
    return entregaController.crear(usuarioSesion, data);
  })));

  ipcMain.handle('entregas:capturarHuella', () => {
    return entregaController.capturarHuella();
  });

  ipcMain.handle('receptores:buscar', (_event, documento) => {
    return receptorController.buscar(documento);
  });

  ipcMain.handle('receptores:listar', () => {
    return receptorController.listar();
  });

  ipcMain.handle('receptores:guardar', conSyncDespuesDeCambio('receptores:guardar', (data) => {
    return receptorController.guardar(data);
  }));

  ipcMain.handle('receptores:actualizar', conSyncDespuesDeCambio('receptores:actualizar', (id, data) => {
    return receptorController.actualizar(id, data);
  }));

  ipcMain.handle('solicitudesEliminacion:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return solicitudEliminacionController.listar(usuarioSesion, filtros);
  }));

  ipcMain.handle('solicitudesEliminacion:crear', conSyncDespuesDeCambio('solicitudesEliminacion:crear', conValidacionSesion((usuarioSesion, data) => {
    return solicitudEliminacionController.crear(usuarioSesion, data);
  })));

  ipcMain.handle('solicitudesEliminacion:resolver', conSyncDespuesDeCambio('solicitudesEliminacion:resolver', conValidacionSesion((usuarioSesion, id, data) => {
    return solicitudEliminacionController.resolver(usuarioSesion, id, data);
  })));

  ipcMain.handle('solicitudesIntercambio:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return solicitudIntercambioController.listar(usuarioSesion, filtros);
  }));

  ipcMain.handle('solicitudesIntercambio:crear', conSyncDespuesDeCambio('solicitudesIntercambio:crear', conValidacionSesion((usuarioSesion, data) => {
    return solicitudIntercambioController.crear(usuarioSesion, data);
  })));

  ipcMain.handle('solicitudesIntercambio:resolver', conSyncDespuesDeCambio('solicitudesIntercambio:resolver', conValidacionSesion((usuarioSesion, id, data) => {
    return solicitudIntercambioController.resolver(usuarioSesion, id, data);
  })));

  ipcMain.handle('auditoria:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return auditoriaController.listar(usuarioSesion, filtros);
  }));

  ipcMain.handle('reportes:diario', conValidacionSesion((usuarioSesion, filtros) => {
    return reporteController.reporteDiario(usuarioSesion, filtros);
  }));

  ipcMain.handle('reportes:dashboard', conValidacionSesion((usuarioSesion, filtros) => {
    return reporteController.dashboard(usuarioSesion, filtros);
  }));

  ipcMain.handle('reportes:conciliacion', conValidacionSesion((usuarioSesion, filtros) => {
    return reporteController.conciliacion(usuarioSesion, filtros);
  }));

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

  ipcMain.handle('backups:listar', conValidacionSesion((_event, usuarioSesion, filtros) => {
    return backupController.listar(usuarioSesion, filtros);
  }));

ipcMain.handle('backups:crear', conValidacionSesion((usuarioSesion, opciones) => {
    return backupController.crear(usuarioSesion, opciones);
  }));

  ipcMain.handle('backups:ultimo', conValidacionSesion((usuarioSesion, filtros) => {
    return backupController.ultimoRespaldo(usuarioSesion, filtros);
  }));

  ipcMain.handle('backups:obtenerConfig', conValidacionSesion((usuarioSesion) => {
    return backupController.obtenerConfig(usuarioSesion);
  }));

  ipcMain.handle('backups:guardarConfig', conValidacionSesion((usuarioSesion, config) => {
    return backupController.guardarConfig(usuarioSesion, config);
  }));

  ipcMain.handle('cloudSync:sincronizar', conValidacionSesion((usuarioSesion, opciones) => {
    return cloudSyncController.sincronizar(usuarioSesion, opciones);
  }));

  // Restaurar cierra la conexión y reemplaza el archivo de la BD. Para garantizar que
  // TODO el proceso (incluidas prepared statements en caché) quede limpio con los datos
  // nuevos, si la restauración fue exitosa reiniciamos la app entera — no basta con
  // recargar la ventana, porque el proceso main mantiene su propio estado.
ipcMain.handle('backups:restaurar', conSyncDespuesDeCambio('backups:restaurar', conValidacionSesion((usuarioSesion, nombreArchivo) => {
    const resultado = backupController.restaurar(usuarioSesion, nombreArchivo);
    if (resultado.ok) {
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 300); // pequeño margen para que la respuesta IPC llegue al renderer antes de cerrar
    }
    return resultado;
  })));

  // Gestión de usuarios (Exclusivo Superadmin Wilmer)
  ipcMain.handle('usuarios:listar', conValidacionSesion((usuarioSesion) => {
    return usuarioController.listar(usuarioSesion);
  }));

  ipcMain.handle('usuarios:listarRoles', conValidacionSesion((usuarioSesion) => {
    return usuarioController.listarRoles(usuarioSesion);
  }));

  ipcMain.handle('usuarios:crear', conSyncDespuesDeCambio('usuarios:crear', conValidacionSesion((usuarioSesion, data) => {
    return usuarioController.crear(usuarioSesion, data);
  })));

  ipcMain.handle('usuarios:actualizar', conSyncDespuesDeCambio('usuarios:actualizar', conValidacionSesion((usuarioSesion, id, data) => {
    return usuarioController.actualizar(usuarioSesion, id, data);
  })));

  ipcMain.handle('usuarios:cambiarEstado', conSyncDespuesDeCambio('usuarios:cambiarEstado', conValidacionSesion((usuarioSesion, id, estado) => {
    return usuarioController.cambiarEstado(usuarioSesion, id, estado);
  })));
}

module.exports = { registerIpcHandlers };
