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
const firmaPadController = require('./controllers/firmaPadController');
const bridgePrerequisitesController = require('./controllers/bridgePrerequisitesController');
const IPC_CHANNELS = require('../electron/bridgePrerequisitesChannel');
// Facturación desactivada: sin registros/handlers.
// const facturacionController = require('./controllers/facturacionController');
const { sincronizarEnSegundoPlano } = require('./services/cloudSyncService');
const sedeService = require('./services/sedeService');
const sessionService = require('./services/sessionService');
const { crearSeguridadIpc } = require('./security/ipcSecurity');
const { abrirDocumentoTemporal } = require('../electron/documentOpener');

function responderErrorSesion(err) {
  return { ok: false, error: err.message || 'Sesión inválida.' };
}

// Resuelve la sesión en el proceso main (token opaco). El rol y la sede salen de la BD,
// nunca de lo que mande el renderer. Los errores de sesión y los del servicio se
// separan: un fallo de negocio no debe presentarse como "sesión inválida".
function conValidacionSesion(accion) {
  return (_event, usuarioSesion, ...args) => {
    let sesion;
    try {
      sesion = sessionService.resolverUsuarioDesdeSesion(usuarioSesion);
    } catch (err) {
      return responderErrorSesion(err);
    }

    try {
      return accion(sesion, ...args);
    } catch (err) {
      return { ok: false, error: err.message || 'Error interno. Intente nuevamente.' };
    }
  };
}

function conSyncDespuesDeCambio(nombre, accion) {
  return (...args) => {
    let resultado;
    try {
      resultado = accion(...args);
    } catch (err) {
      return { ok: false, error: err.message || 'Error interno. Intente nuevamente.' };
    }

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

function nombrePdfSeguro(nombreSugerido) {
  const base = path.basename(String(nombreSugerido || 'reporte.pdf'))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
  const nombre = base || 'reporte';
  return nombre.toLowerCase().endsWith('.pdf') ? nombre : `${nombre}.pdf`;
}

// Todos los canales IPC del sistema se registran aquí. Nada de handlers sueltos
// en main.js: mantiene un único punto auditable de qué operaciones expone el
// backend. El envoltorio valida el origen del remitente antes de ejecutar
// cualquier controlador y sanea los errores que vuelven al renderer.
function registerIpcHandlers(opciones = {}) {
  const electron = require('electron');
  const ipcMain = opciones.ipcMain || electron.ipcMain;
  const app = opciones.app || electron.app;
  const dialog = opciones.dialog || electron.dialog;
  const BrowserWindow = opciones.BrowserWindow || electron.BrowserWindow;
  const shell = opciones.shell || electron.shell;
  const isDev = opciones.isDev !== undefined
    ? opciones.isDev === true
    : process.env.NODE_ENV === 'development';
  const rendererIndexPath = opciones.rendererIndexPath ||
    path.join(__dirname, '..', 'dist', 'renderer', 'index.html');
  const seguridad = crearSeguridadIpc({
    isDev,
    rendererIndexPath,
    logger: opciones.logger || console
  });
  const registrar = (nombre, handler) => seguridad.registrar(ipcMain, nombre, handler);

  registrar('auth:login', conSyncDespuesDeCambio('auth:login', (_event, credenciales) => {
    return authController.login(credenciales);
  }));

  registrar('auth:logout', conSyncDespuesDeCambio('auth:logout', conValidacionSesion((usuarioSesion) => {
    return authController.logout(usuarioSesion);
  })));

  registrar('medicamentos:listar', conValidacionSesion(() => {
    return medicamentoController.listar();
  }));

  registrar('sedes:listar', conValidacionSesion((usuarioSesion) => {
    return { ok: true, data: sedeService.listarParaUsuario(usuarioSesion) };
  }));

  registrar('sedes:crear', conSyncDespuesDeCambio('sedes:crear', conValidacionSesion((usuarioSesion, data) => {
    return { ok: true, data: sedeService.crear(usuarioSesion, data) };
  })));

  registrar('sedes:eliminar', conSyncDespuesDeCambio('sedes:eliminar', conValidacionSesion((usuarioSesion, id) => {
    return { ok: true, data: sedeService.eliminar(usuarioSesion, id) };
  })));

  registrar('medicamentos:crear', conSyncDespuesDeCambio('medicamentos:crear', conValidacionSesion((usuarioSesion, data) => {
    return medicamentoController.crear(usuarioSesion, data);
  })));

  registrar('medicamentos:actualizar', conSyncDespuesDeCambio('medicamentos:actualizar', conValidacionSesion((usuarioSesion, id, data) => {
    return medicamentoController.actualizar(usuarioSesion, id, data);
  })));

  registrar('lotes:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return loteController.listar(usuarioSesion, filtros);
  }));

  registrar('lotes:crear', conSyncDespuesDeCambio('lotes:crear', conValidacionSesion((usuarioSesion, data) => {
    return loteController.crear(usuarioSesion, data);
  })));

  registrar('lotes:ajustar', conSyncDespuesDeCambio('lotes:ajustar', conValidacionSesion((usuarioSesion, loteId, data) => {
    return loteController.ajustarCantidades(usuarioSesion, loteId, data);
  })));

  registrar('ordenes:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return ordenController.listar(usuarioSesion, filtros);
  }));

  registrar('ordenes:obtener', conValidacionSesion((usuarioSesion, id) => {
    return ordenController.obtener(usuarioSesion, id);
  }));

  registrar('ordenes:crear', conSyncDespuesDeCambio('ordenes:crear', conValidacionSesion((usuarioSesion, data) => {
    return ordenController.crear(usuarioSesion, data);
  })));

  registrar('ordenes:cancelar', conSyncDespuesDeCambio('ordenes:cancelar', conValidacionSesion((usuarioSesion, id, data) => {
    return ordenController.cancelar(usuarioSesion, id, data);
  })));

  registrar('ordenes:actualizarDocumentacion', conSyncDespuesDeCambio('ordenes:actualizarDocumentacion', conValidacionSesion((usuarioSesion, id, data) => {
    return ordenController.actualizarDocumentacion(usuarioSesion, id, data);
  })));

  registrar('despachos:listarPorOrden', conValidacionSesion((usuarioSesion, ordenId) => {
    return despachoController.listarPorOrden(usuarioSesion, ordenId);
  }));

  registrar('despachos:crear', conSyncDespuesDeCambio('despachos:crear', conValidacionSesion((usuarioSesion, data) => {
    return despachoController.crear(usuarioSesion, data);
  })));

  registrar('entregas:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return entregaController.listar(usuarioSesion, filtros);
  }));

  registrar('entregas:crear', conSyncDespuesDeCambio('entregas:crear', conValidacionSesion((usuarioSesion, data) => {
    return entregaController.crear(usuarioSesion, data);
  })));

  registrar('entregas:capturarHuella', conValidacionSesion(() => {
    return entregaController.capturarHuella();
  }));

  registrar('receptores:buscar', conValidacionSesion((usuarioSesion, documento) => {
    return receptorController.buscar(usuarioSesion, documento);
  }));

  registrar('receptores:listar', conValidacionSesion((usuarioSesion) => {
    return receptorController.listar(usuarioSesion);
  }));

  registrar('receptores:guardar', conSyncDespuesDeCambio('receptores:guardar', conValidacionSesion((usuarioSesion, data) => {
    return receptorController.guardar(usuarioSesion, data);
  })));

  registrar('receptores:actualizar', conSyncDespuesDeCambio('receptores:actualizar', conValidacionSesion((usuarioSesion, id, data) => {
    return receptorController.actualizar(usuarioSesion, id, data);
  })));

  // Facturación desactivada: no registra canales ni almacena datos.

  registrar('solicitudesEliminacion:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return solicitudEliminacionController.listar(usuarioSesion, filtros);
  }));

  registrar('solicitudesEliminacion:crear', conSyncDespuesDeCambio('solicitudesEliminacion:crear', conValidacionSesion((usuarioSesion, data) => {
    return solicitudEliminacionController.crear(usuarioSesion, data);
  })));

  registrar('solicitudesEliminacion:resolver', conSyncDespuesDeCambio('solicitudesEliminacion:resolver', conValidacionSesion((usuarioSesion, id, data) => {
    return solicitudEliminacionController.resolver(usuarioSesion, id, data);
  })));

  registrar('solicitudesIntercambio:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return solicitudIntercambioController.listar(usuarioSesion, filtros);
  }));

  registrar('solicitudesIntercambio:crear', conSyncDespuesDeCambio('solicitudesIntercambio:crear', conValidacionSesion((usuarioSesion, data) => {
    return solicitudIntercambioController.crear(usuarioSesion, data);
  })));

  registrar('solicitudesIntercambio:resolver', conSyncDespuesDeCambio('solicitudesIntercambio:resolver', conValidacionSesion((usuarioSesion, id, data) => {
    return solicitudIntercambioController.resolver(usuarioSesion, id, data);
  })));

  registrar('auditoria:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return auditoriaController.listar(usuarioSesion, filtros);
  }));

  registrar('reportes:diario', conValidacionSesion((usuarioSesion, filtros) => {
    return reporteController.reporteDiario(usuarioSesion, filtros);
  }));

  registrar('reportes:dashboard', conValidacionSesion((usuarioSesion, filtros) => {
    return reporteController.dashboard(usuarioSesion, filtros);
  }));

  registrar('reportes:conciliacion', conValidacionSesion((usuarioSesion, filtros) => {
    return reporteController.conciliacion(usuarioSesion, filtros);
  }));

  registrar('reportes:guardarPdf', async (event, usuarioSesion, nombreSugerido) => {
    try {
      sessionService.resolverUsuarioDesdeSesion(usuarioSesion);
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { ok: false, error: 'No se encontró la ventana activa.' };

      const nombrePdf = nombrePdfSeguro(nombreSugerido);

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

  registrar('backups:listar', conValidacionSesion((usuarioSesion, filtros) => {
    return backupController.listar(usuarioSesion, filtros);
  }));

  registrar('backups:crear', conValidacionSesion((usuarioSesion, opcionesCreacion) => {
    return backupController.crear(usuarioSesion, opcionesCreacion);
  }));

  registrar('backups:ultimo', conValidacionSesion((usuarioSesion, filtros) => {
    return backupController.ultimoRespaldo(usuarioSesion, filtros);
  }));

  registrar('backups:obtenerConfig', conValidacionSesion((usuarioSesion) => {
    return backupController.obtenerConfig(usuarioSesion);
  }));

  registrar('backups:guardarConfig', conValidacionSesion((usuarioSesion, config) => {
    return backupController.guardarConfig(usuarioSesion, config);
  }));

  registrar('backups:consumo', conValidacionSesion((usuarioSesion) => {
    return backupController.consumo(usuarioSesion);
  }));

  registrar('cloudSync:sincronizar', conValidacionSesion((usuarioSesion, opcionesSync) => {
    return cloudSyncController.sincronizar(usuarioSesion, opcionesSync);
  }));

  // Restaurar cierra la conexión y reemplaza el archivo de la BD. Para garantizar que
  // TODO el proceso (incluidas prepared statements en caché) quede limpio con los datos
  // nuevos, si la restauración fue exitosa reiniciamos la app entera — no basta con
  // recargar la ventana, porque el proceso main mantiene su propio estado.
  //
  // La promesa DEBE esperarse: antes se evaluaba `resultado.ok` sobre una Promise
  // (siempre undefined), así que la restauración nunca reiniciaba la app y el
  // renderer mostraba éxito con procesos en memoria aún apuntando a la BD vieja.
  registrar('backups:restaurar', conValidacionSesion(async (usuarioSesion, nombreArchivo) => {
    const resultado = await backupController.restaurar(usuarioSesion, nombreArchivo);
    if (resultado?.ok === true) {
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 300); // pequeño margen para que la respuesta IPC llegue al renderer antes de cerrar
    }
    return resultado;
  }));

  // Gestión de usuarios (Exclusivo Superadmin Wilmer)
  registrar('usuarios:listar', conValidacionSesion((usuarioSesion) => {
    return usuarioController.listar(usuarioSesion);
  }));

  registrar('usuarios:listarRoles', conValidacionSesion((usuarioSesion) => {
    return usuarioController.listarRoles(usuarioSesion);
  }));

  registrar('usuarios:crear', conSyncDespuesDeCambio('usuarios:crear', conValidacionSesion((usuarioSesion, data) => {
    return usuarioController.crear(usuarioSesion, data);
  })));

  registrar('usuarios:actualizar', conSyncDespuesDeCambio('usuarios:actualizar', conValidacionSesion((usuarioSesion, id, data) => {
    return usuarioController.actualizar(usuarioSesion, id, data);
  })));

  registrar('usuarios:cambiarEstado', conSyncDespuesDeCambio('usuarios:cambiarEstado', conValidacionSesion((usuarioSesion, id, estado) => {
    return usuarioController.cambiarEstado(usuarioSesion, id, estado);
  })));

  // Anonimiza la fila del usuario (no la borra) y corta su acceso al quedar en
  // estado ELIMINADO. Solo el superadmin principal puede invocarlo.
  registrar('usuarios:eliminarDefinitivo', conSyncDespuesDeCambio('usuarios:eliminarDefinitivo', conValidacionSesion((usuarioSesion, id) => {
    return usuarioController.eliminarDefinitivo(usuarioSesion, id);
  })));

  // Catálogo CUM (INVIMA) - Solo ADMIN/SUPERADMIN
  registrar('catalogoCum:actualizar', conSyncDespuesDeCambio('catalogoCum:actualizar', conValidacionSesion((usuarioSesion) => {
    return catalogoCumController.actualizarCatalogo(usuarioSesion);
  })));

  registrar('catalogoCum:estado', conValidacionSesion((usuarioSesion) => {
    return catalogoCumController.obtenerEstadoCatalogo(usuarioSesion);
  }));

  registrar('catalogoCum:buscarPorGTIN', conValidacionSesion((usuarioSesion, gtin) => {
    return catalogoCumController.buscarPorGTIN(usuarioSesion, gtin);
  }));

  registrar('catalogoCum:buscarPorCUM', conValidacionSesion((usuarioSesion, cum) => {
    return catalogoCumController.buscarPorCUM(usuarioSesion, cum);
  }));

  registrar('catalogoCum:buscarPorProducto', conValidacionSesion((usuarioSesion, texto, limite) => {
    return catalogoCumController.buscarPorProducto(usuarioSesion, texto, limite);
  }));

  registrar('catalogoCum:crearManual', conSyncDespuesDeCambio('catalogoCum:crearManual', conValidacionSesion((usuarioSesion, data) => {
    return catalogoCumController.crearRegistroManual(usuarioSesion, data);
  })));

  registrar('catalogoCum:crearEmpaque', conSyncDespuesDeCambio('catalogoCum:crearEmpaque', conValidacionSesion((usuarioSesion, data) => {
    return catalogoCumController.crearEmpaque(usuarioSesion, data);
  })));

  registrar('catalogoCum:adjuntarDocumento', conSyncDespuesDeCambio('catalogoCum:adjuntarDocumento', conValidacionSesion((usuarioSesion, id, data) => {
    return catalogoCumController.adjuntarDocumento(usuarioSesion, id, data);
  })));

  registrar('catalogoCum:obtenerDocumento', conValidacionSesion((usuarioSesion, id) => {
    return catalogoCumController.obtenerDocumento(usuarioSesion, id);
  }));

  // Abre el PDF/imagen con el visor del sistema. El renderer nunca recibe una
  // ruta ni construye un data URL navegable.
  registrar('catalogoCum:mostrarDocumento', conValidacionSesion(async (usuarioSesion, id) => {
    const resultado = catalogoCumController.obtenerDocumento(usuarioSesion, id);
    if (!resultado.ok) return resultado;
    if (!resultado.data || !resultado.data.documento_adjunto_data) {
      return { ok: false, error: 'No hay documento adjunto para este registro.' };
    }
    const abierto = await abrirDocumentoTemporal(resultado.data, {
      shell,
      directorioTemporal: app && typeof app.getPath === 'function' ? app.getPath('temp') : undefined
    });
    return { ok: true, data: abierto };
  }));

  registrar('catalogoCum:progresoActualizacion', conValidacionSesion((usuarioSesion) => {
    return catalogoCumController.obtenerProgreso(usuarioSesion);
  }));

  registrar('catalogoCum:cancelarActualizacion', conValidacionSesion((usuarioSesion) => {
    return catalogoCumController.cancelarActualizacion(usuarioSesion);
  }));

  // Recepción con escaneo - INVENTARIO/ADMIN/SUPERADMIN
  registrar('recepcion:escanear', conValidacionSesion((usuarioSesion, codigoBarras) => {
    return recepcionController.procesarEscaneo(usuarioSesion, codigoBarras);
  }));

  registrar('recepcion:registrar', conSyncDespuesDeCambio('recepcion:registrar', conValidacionSesion((usuarioSesion, data) => {
    return recepcionController.registrarRecepcion(usuarioSesion, data);
  })));

  registrar('recepcion:historial', conValidacionSesion((usuarioSesion, filtros) => {
    return recepcionController.obtenerHistorialRecepciones(usuarioSesion, filtros);
  }));

  // Firma en pad Wacom STU-540 (STU SDK directo vía helper nativo).
  // capturar es async: se retorna la promesa para que ipcMain la resuelva
  // (no envolver en { ok, data } sincrónico).
  registrar('firmaPad:detectar', conValidacionSesion(() => {
    return firmaPadController.detectar();
  }));

  registrar('firmaPad:capturar', conValidacionSesion((usuarioSesion, datos) => {
    return firmaPadController.capturar(usuarioSesion, datos);
  }));

  // La consulta exige sesión: revela rutas e inventario de archivos del equipo.
  // El controlador no acepta ningún argumento además del token de sesión.
  registrar(
    IPC_CHANNELS.VERIFICAR_PRERREQUISITOS_PUENTES,
    conValidacionSesion(() => bridgePrerequisitesController.verificarPrerrequisitos())
  );
}

module.exports = { registerIpcHandlers };
