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
const catalogoCumController = require('./controllers/catalogoCumController');
const recepcionController = require('./controllers/recepcionController');
const facturacionController = require('./controllers/facturacionController');
const firmaPadController = require('./controllers/firmaPadController');
const { sincronizarEnSegundoPlano } = require('./services/cloudSyncService');
const sedeService = require('./services/sedeService');
const sessionService = require('./services/sessionService');

function responderErrorSesion(err) {
  return { ok: false, error: err.message || 'Sesión inválida.' };
}

// Resuelve la sesión en el proceso main (token opaco). El rol y la sede salen de la BD,
// nunca de lo que mande el renderer.
function conValidacionSesion(accion) {
  return (_event, usuarioSesion, ...args) => {
    try {
      const sesion = sessionService.resolverUsuarioDesdeSesion(usuarioSesion);
      return accion(sesion, ...args);
    } catch (err) {
      return responderErrorSesion(err);
    }
  };
}

function conSyncDespuesDeCambio(nombre, accion) {
  return (...args) => {
    const resultado = accion(...args);
    const programar = (res) => {
      if (res?.ok === true) sincronizarEnSegundoPlano(nombre);
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

  ipcMain.handle('medicamentos:listar', conValidacionSesion(() => {
    return medicamentoController.listar();
  }));

  ipcMain.handle('sedes:listar', conValidacionSesion(() => {
    try {
      return { ok: true, data: sedeService.listar() };
    } catch (err) {
      console.error('[ipcHandlers] sedes:listar error:', err);
      return { ok: false, error: 'Error interno. Intente nuevamente.' };
    }
  }));

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

  ipcMain.handle('entregas:capturarHuella', conValidacionSesion(() => {
    return entregaController.capturarHuella();
  }));

  ipcMain.handle('receptores:buscar', conValidacionSesion((usuarioSesion, documento) => {
    return receptorController.buscar(usuarioSesion, documento);
  }));

  ipcMain.handle('receptores:listar', conValidacionSesion((usuarioSesion) => {
    return receptorController.listar(usuarioSesion);
  }));

  ipcMain.handle('receptores:guardar', conSyncDespuesDeCambio('receptores:guardar', conValidacionSesion((usuarioSesion, data) => {
    return receptorController.guardar(usuarioSesion, data);
  })));

  ipcMain.handle('receptores:actualizar', conSyncDespuesDeCambio('receptores:actualizar', conValidacionSesion((usuarioSesion, id, data) => {
    return receptorController.actualizar(usuarioSesion, id, data);
  })));

  ipcMain.handle('facturacion:clientes', conValidacionSesion((usuarioSesion, filtros) => facturacionController.clientes(usuarioSesion, filtros)));
  ipcMain.handle('facturacion:guardarCliente', conSyncDespuesDeCambio('facturacion:guardarCliente', conValidacionSesion((usuarioSesion, data) => facturacionController.guardarCliente(usuarioSesion, data))));
  ipcMain.handle('facturacion:catalogos', conValidacionSesion((usuarioSesion, filtros) => facturacionController.catalogos(usuarioSesion, filtros)));
  ipcMain.handle('facturacion:configuracion', conValidacionSesion((usuarioSesion, filtros) => facturacionController.configuracion(usuarioSesion, filtros)));
  ipcMain.handle('facturacion:guardarConfiguracion', conSyncDespuesDeCambio('facturacion:guardarConfiguracion', conValidacionSesion((usuarioSesion, data) => facturacionController.guardarConfiguracion(usuarioSesion, data))));
  ipcMain.handle('facturacion:listar', conValidacionSesion((usuarioSesion, filtros) => facturacionController.listar(usuarioSesion, filtros)));
  ipcMain.handle('facturacion:cartera', conValidacionSesion((usuarioSesion, filtros) => facturacionController.cartera(usuarioSesion, filtros)));
  ipcMain.handle('facturacion:reportes', conValidacionSesion((usuarioSesion, filtros) => facturacionController.reportes(usuarioSesion, filtros)));
  ipcMain.handle('facturacion:colaDian', conValidacionSesion((usuarioSesion, filtros) => facturacionController.colaDian(usuarioSesion, filtros)));
  ipcMain.handle('facturacion:prepararDian', conSyncDespuesDeCambio('facturacion:prepararDian', conValidacionSesion((usuarioSesion, id) => facturacionController.prepararDocumentoDian(usuarioSesion, id))));
  ipcMain.handle('facturacion:transmitirDian', conSyncDespuesDeCambio('facturacion:transmitirDian', conValidacionSesion((usuarioSesion, id) => facturacionController.transmitirDocumentoDian(usuarioSesion, id))));
  ipcMain.handle('facturacion:consultarEstadoDian', conSyncDespuesDeCambio('facturacion:consultarEstadoDian', conValidacionSesion((usuarioSesion, id) => facturacionController.consultarEstadoDian(usuarioSesion, id))));
  ipcMain.handle('facturacion:crearFactura', conSyncDespuesDeCambio('facturacion:crearFactura', conValidacionSesion((usuarioSesion, data) => facturacionController.crearFactura(usuarioSesion, data))));
  ipcMain.handle('facturacion:crearNotaCredito', conSyncDespuesDeCambio('facturacion:crearNotaCredito', conValidacionSesion((usuarioSesion, data) => facturacionController.crearNotaCredito(usuarioSesion, data))));
  ipcMain.handle('facturacion:crearNotaDebito', conSyncDespuesDeCambio('facturacion:crearNotaDebito', conValidacionSesion((usuarioSesion, data) => facturacionController.crearNotaDebito(usuarioSesion, data))));
  ipcMain.handle('facturacion:pago', conSyncDespuesDeCambio('facturacion:pago', conValidacionSesion((usuarioSesion, id, data) => facturacionController.pago(usuarioSesion, id, data))));

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

  ipcMain.handle('reportes:guardarPdf', async (event, usuarioSesion, nombreSugerido) => {
    try {
      sessionService.resolverUsuarioDesdeSesion(usuarioSesion);
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
      if (err instanceof sessionService.SesionError) {
        return { ok: false, error: err.message };
      }
      console.error('[ipcHandlers] reportes:guardarPdf error:', err);
      return { ok: false, error: 'No se pudo generar el PDF. Intente nuevamente.' };
    }
  });

  ipcMain.handle('backups:listar', conValidacionSesion((usuarioSesion, filtros) => {
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

  ipcMain.handle('backups:consumo', conValidacionSesion((usuarioSesion) => {
    return backupController.consumo(usuarioSesion);
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

  // Anonimiza la fila del usuario (no la borra) y corta su acceso al quedar en
  // estado ELIMINADO. Solo el superadmin principal puede invocarlo.
  ipcMain.handle('usuarios:eliminarDefinitivo', conSyncDespuesDeCambio('usuarios:eliminarDefinitivo', conValidacionSesion((usuarioSesion, id) => {
    return usuarioController.eliminarDefinitivo(usuarioSesion, id);
  })));

  // Catálogo CUM (INVIMA) - Solo ADMIN/SUPERADMIN
  ipcMain.handle('catalogoCum:actualizar', conSyncDespuesDeCambio('catalogoCum:actualizar', conValidacionSesion((usuarioSesion) => {
    return catalogoCumController.actualizarCatalogo(usuarioSesion);
  })));

  ipcMain.handle('catalogoCum:estado', conValidacionSesion((usuarioSesion) => {
    return catalogoCumController.obtenerEstadoCatalogo(usuarioSesion);
  }));

  ipcMain.handle('catalogoCum:buscarPorGTIN', conValidacionSesion((usuarioSesion, gtin) => {
    return catalogoCumController.buscarPorGTIN(usuarioSesion, gtin);
  }));

  ipcMain.handle('catalogoCum:buscarPorCUM', conValidacionSesion((usuarioSesion, cum) => {
    return catalogoCumController.buscarPorCUM(usuarioSesion, cum);
  }));

  ipcMain.handle('catalogoCum:buscarPorProducto', conValidacionSesion((usuarioSesion, texto, limite) => {
    return catalogoCumController.buscarPorProducto(usuarioSesion, texto, limite);
  }));

  ipcMain.handle('catalogoCum:crearManual', conSyncDespuesDeCambio('catalogoCum:crearManual', conValidacionSesion((usuarioSesion, data) => {
    return catalogoCumController.crearRegistroManual(usuarioSesion, data);
  })));

  ipcMain.handle('catalogoCum:crearEmpaque', conSyncDespuesDeCambio('catalogoCum:crearEmpaque', conValidacionSesion((usuarioSesion, data) => {
    return catalogoCumController.crearEmpaque(usuarioSesion, data);
  })));

  ipcMain.handle('catalogoCum:adjuntarDocumento', conSyncDespuesDeCambio('catalogoCum:adjuntarDocumento', conValidacionSesion((usuarioSesion, id, data) => {
    return catalogoCumController.adjuntarDocumento(usuarioSesion, id, data);
  })));

  ipcMain.handle('catalogoCum:obtenerDocumento', conValidacionSesion((usuarioSesion, id) => {
    return catalogoCumController.obtenerDocumento(usuarioSesion, id);
  }));

  ipcMain.handle('catalogoCum:progresoActualizacion', conValidacionSesion((usuarioSesion) => {
    return catalogoCumController.obtenerProgreso(usuarioSesion);
  }));

  ipcMain.handle('catalogoCum:cancelarActualizacion', conValidacionSesion((usuarioSesion) => {
    return catalogoCumController.cancelarActualizacion(usuarioSesion);
  }));

  // Recepción con escaneo - INVENTARIO/ADMIN/SUPERADMIN
  ipcMain.handle('recepcion:escanear', conValidacionSesion((usuarioSesion, codigoBarras) => {
    return recepcionController.procesarEscaneo(usuarioSesion, codigoBarras);
  }));

  ipcMain.handle('recepcion:registrar', conSyncDespuesDeCambio('recepcion:registrar', conValidacionSesion((usuarioSesion, data) => {
    return recepcionController.registrarRecepcion(usuarioSesion, data);
  })));

  ipcMain.handle('recepcion:historial', conValidacionSesion((usuarioSesion, filtros) => {
    return recepcionController.obtenerHistorialRecepciones(usuarioSesion, filtros);
  }));

  // Firma en pad Wacom STU-540 (STU SDK directo vía helper nativo).
  // capturar es async: se retorna la promesa para que ipcMain la resuelva
  // (no envolver en { ok, data } sincrónico).
  ipcMain.handle('firmaPad:detectar', conValidacionSesion(() => {
    return firmaPadController.detectar();
  }));

  ipcMain.handle('firmaPad:capturar', conValidacionSesion((usuarioSesion, datos) => {
    return firmaPadController.capturar(usuarioSesion, datos);
  }));
}

module.exports = { registerIpcHandlers };
