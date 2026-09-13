export const inventarioApi = {
  medicamentos: {
    listar: () => window.api.medicamentos.listar(),
    crear: (usuario, data) => window.api.medicamentos.crear(usuario, data),
    actualizar: (usuario, id, data) => window.api.medicamentos.actualizar(usuario, id, data)
  },
  sedes: {
    listar: () => window.api.sedes.listar()
  },
  lotes: {
    listar: (usuario, filtros) => window.api.lotes.listar(usuario, filtros),
    crear: (usuario, data) => window.api.lotes.crear(usuario, data),
    ajustar: (usuario, loteId, data) => window.api.lotes.ajustar(usuario, loteId, data)
  },
  ordenes: {
    listar: (usuario, filtros) => window.api.ordenes.listar(usuario, filtros),
    obtener: (usuario, id) => window.api.ordenes.obtener(usuario, id),
    crear: (usuario, data) => window.api.ordenes.crear(usuario, data),
    cancelar: (usuario, id, data) => window.api.ordenes.cancelar(usuario, id, data),
    actualizarDocumentacion: (usuario, id, data) => window.api.ordenes.actualizarDocumentacion(usuario, id, data)
  },
  despachos: {
    listarPorOrden: (usuario, ordenId) => window.api.despachos.listarPorOrden(usuario, ordenId),
    crear: (usuario, data) => window.api.despachos.crear(usuario, data)
  },
  entregas: {
    listar: (usuario, filtros) => window.api.entregas.listar(usuario, filtros),
    crear: (usuario, data) => window.api.entregas.crear(usuario, data),
    capturarHuella: () => window.api.entregas.capturarHuella()
  },
  receptores: {
    buscar: (documento) => window.api.receptores.buscar(documento),
    listar: () => window.api.receptores.listar(),
    guardar: (data) => window.api.receptores.guardar(data),
    actualizar: (id, data) => window.api.receptores.actualizar(id, data)
  },
  solicitudesEliminacion: {
    listar: (usuario, filtros) => window.api.solicitudesEliminacion.listar(usuario, filtros),
    crear: (usuario, data) => window.api.solicitudesEliminacion.crear(usuario, data),
    resolver: (usuario, id, data) => window.api.solicitudesEliminacion.resolver(usuario, id, data)
  },
  solicitudesIntercambio: {
    listar: (usuario, filtros) => window.api.solicitudesIntercambio.listar(usuario, filtros),
    crear: (usuario, data) => window.api.solicitudesIntercambio.crear(usuario, data),
    resolver: (usuario, id, data) => window.api.solicitudesIntercambio.resolver(usuario, id, data)
  },
  auditoria: {
    listar: (usuario, filtros) => window.api.auditoria.listar(usuario, filtros)
  },
  reportes: {
    diario: (usuario, filtros) => window.api.reportes.diario(usuario, filtros),
    dashboard: (usuario, filtros) => window.api.reportes.dashboard(usuario, filtros),
    conciliacion: (usuario, filtros) => window.api.reportes.conciliacion(usuario, filtros),
    guardarPdf: (nombreSugerido) => window.api.reportes.guardarPdf(nombreSugerido)
  },
  backups: {
    listar: (usuario, filtros) => window.api.backups.listar(usuario, filtros),
    crear: (usuario, opciones) => window.api.backups.crear(usuario, opciones),
    ultimo: (usuario, filtros) => window.api.backups.ultimo(usuario, filtros),
    obtenerConfig: (usuario) => window.api.backups.obtenerConfig(usuario),
    guardarConfig: (usuario, config) => window.api.backups.guardarConfig(usuario, config),
    restaurar: (usuario, nombreArchivo) => window.api.backups.restaurar(usuario, nombreArchivo)
  },
  cloudSync: {
    sincronizar: (usuario, opciones) => window.api.cloudSync.sincronizar(usuario, opciones)
  }
};
