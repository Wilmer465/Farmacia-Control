export const inventarioApi = {
  medicamentos: {
    listar: (usuario) => window.api.medicamentos.listar(usuario),
    crear: (usuario, data) => window.api.medicamentos.crear(usuario, data),
    actualizar: (usuario, id, data) => window.api.medicamentos.actualizar(usuario, id, data)
  },
  sedes: {
    listar: (usuario) => window.api.sedes.listar(usuario)
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
    capturarHuella: (usuario) => window.api.entregas.capturarHuella(usuario)
  },
  receptores: {
    buscar: (usuario, documento) => window.api.receptores.buscar(usuario, documento),
    listar: (usuario) => window.api.receptores.listar(usuario),
    guardar: (usuario, data) => window.api.receptores.guardar(usuario, data),
    actualizar: (usuario, id, data) => window.api.receptores.actualizar(usuario, id, data)
  },
  facturacion: {
    clientes: (usuario, filtros) => window.api.facturacion.clientes(usuario, filtros),
    guardarCliente: (usuario, data) => window.api.facturacion.guardarCliente(usuario, data),
    catalogos: (usuario, filtros) => window.api.facturacion.catalogos(usuario, filtros),
    configuracion: (usuario, filtros) => window.api.facturacion.configuracion(usuario, filtros),
    guardarConfiguracion: (usuario, data) => window.api.facturacion.guardarConfiguracion(usuario, data),
    listar: (usuario, filtros) => window.api.facturacion.listar(usuario, filtros),
    cartera: (usuario, filtros) => window.api.facturacion.cartera(usuario, filtros),
    reportes: (usuario, filtros) => window.api.facturacion.reportes(usuario, filtros),
    colaDian: (usuario, filtros) => window.api.facturacion.colaDian(usuario, filtros),
    prepararDian: (usuario, id) => window.api.facturacion.prepararDian(usuario, id),
    transmitirDian: (usuario, id) => window.api.facturacion.transmitirDian(usuario, id),
    consultarEstadoDian: (usuario, id) => window.api.facturacion.consultarEstadoDian(usuario, id),
    crearFactura: (usuario, data) => window.api.facturacion.crearFactura(usuario, data),
    crearNotaCredito: (usuario, data) => window.api.facturacion.crearNotaCredito(usuario, data),
    crearNotaDebito: (usuario, data) => window.api.facturacion.crearNotaDebito(usuario, data),
    registrarPago: (usuario, id, data) => window.api.facturacion.registrarPago(usuario, id, data)
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
    guardarPdf: (usuario, nombreSugerido) => window.api.reportes.guardarPdf(usuario, nombreSugerido)
  },
  backups: {
    listar: (usuario, filtros) => window.api.backups.listar(usuario, filtros),
    crear: (usuario, opciones) => window.api.backups.crear(usuario, opciones),
    ultimo: (usuario, filtros) => window.api.backups.ultimo(usuario, filtros),
    obtenerConfig: (usuario) => window.api.backups.obtenerConfig(usuario),
    guardarConfig: (usuario, config) => window.api.backups.guardarConfig(usuario, config),
    consumo: (usuario) => window.api.backups.consumo(usuario),
    restaurar: (usuario, nombreArchivo) => window.api.backups.restaurar(usuario, nombreArchivo)
  },
  cloudSync: {
    sincronizar: (usuario, opciones) => window.api.cloudSync.sincronizar(usuario, opciones)
  },
  usuarios: {
    listar: (usuario) => window.api.usuarios.listar(usuario),
    listarRoles: (usuario) => window.api.usuarios.listarRoles(usuario),
    crear: (usuario, data) => window.api.usuarios.crear(usuario, data),
    actualizar: (usuario, id, data) => window.api.usuarios.actualizar(usuario, id, data),
    cambiarEstado: (usuario, id, estado) => window.api.usuarios.cambiarEstado(usuario, id, estado),
    eliminarDefinitivo: (usuario, id) => window.api.usuarios.eliminarDefinitivo(usuario, id)
  },
  catalogoCum: {
    actualizar: (usuario) => window.api.catalogoCum.actualizar(usuario),
    estado: (usuario) => window.api.catalogoCum.estado(usuario),
    buscarPorGTIN: (usuario, gtin) => window.api.catalogoCum.buscarPorGTIN(usuario, gtin),
    buscarPorCUM: (usuario, cum) => window.api.catalogoCum.buscarPorCUM(usuario, cum),
    buscarPorProducto: (usuario, texto, limite) => window.api.catalogoCum.buscarPorProducto(usuario, texto, limite),
    crearManual: (usuario, data) => window.api.catalogoCum.crearManual(usuario, data),
    crearEmpaque: (usuario, data) => window.api.catalogoCum.crearEmpaque(usuario, data),
    adjuntarDocumento: (usuario, id, data) => window.api.catalogoCum.adjuntarDocumento(usuario, id, data),
    obtenerDocumento: (usuario, id) => window.api.catalogoCum.obtenerDocumento(usuario, id),
    progresoActualizacion: (usuario) => window.api.catalogoCum.progresoActualizacion(usuario),
    cancelarActualizacion: (usuario) => window.api.catalogoCum.cancelarActualizacion(usuario)
  },
  recepcion: {
    escanear: (usuario, codigoBarras) => window.api.recepcion.escanear(usuario, codigoBarras),
    registrar: (usuario, data) => window.api.recepcion.registrar(usuario, data),
    historial: (usuario, filtros) => window.api.recepcion.historial(usuario, filtros)
  },
  firmaPad: {
    detectar: (usuario) => window.api.firmaPad.detectar(usuario),
    capturar: (usuario, datos) => window.api.firmaPad.capturar(usuario, datos)
  }
};
