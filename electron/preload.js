const { contextBridge, ipcRenderer } = require('electron');

// El renderer (React) NUNCA toca Node ni el backend directamente.
// Solo puede invocar estos canales explícitos, cada uno mapeado 1:1 a un handler IPC.
contextBridge.exposeInMainWorld('api', {
  auth: {
    login: (credenciales) => ipcRenderer.invoke('auth:login', credenciales),
    logout: (usuarioSesion) => ipcRenderer.invoke('auth:logout', usuarioSesion)
  },
  medicamentos: {
    listar: (usuarioSesion) => ipcRenderer.invoke('medicamentos:listar', usuarioSesion),
    crear: (usuarioSesion, data) => ipcRenderer.invoke('medicamentos:crear', usuarioSesion, data),
    actualizar: (usuarioSesion, id, data) => ipcRenderer.invoke('medicamentos:actualizar', usuarioSesion, id, data)
  },
  sedes: {
    listar: (usuarioSesion) => ipcRenderer.invoke('sedes:listar', usuarioSesion)
  },
  lotes: {
    listar: (usuarioSesion, filtros) => ipcRenderer.invoke('lotes:listar', usuarioSesion, filtros),
    crear: (usuarioSesion, data) => ipcRenderer.invoke('lotes:crear', usuarioSesion, data),
    ajustar: (usuarioSesion, loteId, data) => ipcRenderer.invoke('lotes:ajustar', usuarioSesion, loteId, data)
  },
  ordenes: {
    listar: (usuarioSesion, filtros) => ipcRenderer.invoke('ordenes:listar', usuarioSesion, filtros),
    obtener: (usuarioSesion, id) => ipcRenderer.invoke('ordenes:obtener', usuarioSesion, id),
    crear: (usuarioSesion, data) => ipcRenderer.invoke('ordenes:crear', usuarioSesion, data),
    cancelar: (usuarioSesion, id, data) => ipcRenderer.invoke('ordenes:cancelar', usuarioSesion, id, data),
    actualizarDocumentacion: (usuarioSesion, id, data) => ipcRenderer.invoke('ordenes:actualizarDocumentacion', usuarioSesion, id, data)
  },
  despachos: {
    listarPorOrden: (usuarioSesion, ordenId) => ipcRenderer.invoke('despachos:listarPorOrden', usuarioSesion, ordenId),
    crear: (usuarioSesion, data) => ipcRenderer.invoke('despachos:crear', usuarioSesion, data)
  },
  entregas: {
    listar: (usuarioSesion, filtros) => ipcRenderer.invoke('entregas:listar', usuarioSesion, filtros),
    crear: (usuarioSesion, data) => ipcRenderer.invoke('entregas:crear', usuarioSesion, data),
    capturarHuella: (usuarioSesion) => ipcRenderer.invoke('entregas:capturarHuella', usuarioSesion)
  },
  receptores: {
    buscar: (usuarioSesion, documento) => ipcRenderer.invoke('receptores:buscar', usuarioSesion, documento),
    listar: (usuarioSesion) => ipcRenderer.invoke('receptores:listar', usuarioSesion),
    guardar: (usuarioSesion, data) => ipcRenderer.invoke('receptores:guardar', usuarioSesion, data),
    actualizar: (usuarioSesion, id, data) => ipcRenderer.invoke('receptores:actualizar', usuarioSesion, id, data)
  },
  solicitudesEliminacion: {
    listar: (usuarioSesion, filtros) => ipcRenderer.invoke('solicitudesEliminacion:listar', usuarioSesion, filtros),
    crear: (usuarioSesion, data) => ipcRenderer.invoke('solicitudesEliminacion:crear', usuarioSesion, data),
    resolver: (usuarioSesion, id, data) => ipcRenderer.invoke('solicitudesEliminacion:resolver', usuarioSesion, id, data)
  },
  solicitudesIntercambio: {
    listar: (usuarioSesion, filtros) => ipcRenderer.invoke('solicitudesIntercambio:listar', usuarioSesion, filtros),
    crear: (usuarioSesion, data) => ipcRenderer.invoke('solicitudesIntercambio:crear', usuarioSesion, data),
    resolver: (usuarioSesion, id, data) => ipcRenderer.invoke('solicitudesIntercambio:resolver', usuarioSesion, id, data)
  },
  auditoria: {
    listar: (usuarioSesion, filtros) => ipcRenderer.invoke('auditoria:listar', usuarioSesion, filtros)
  },
  reportes: {
    diario: (usuarioSesion, filtros) => ipcRenderer.invoke('reportes:diario', usuarioSesion, filtros),
    dashboard: (usuarioSesion, filtros) => ipcRenderer.invoke('reportes:dashboard', usuarioSesion, filtros),
    conciliacion: (usuarioSesion, filtros) => ipcRenderer.invoke('reportes:conciliacion', usuarioSesion, filtros),
    guardarPdf: (usuarioSesion, nombreSugerido) => ipcRenderer.invoke('reportes:guardarPdf', usuarioSesion, nombreSugerido)
  },
  backups: {
    listar: (usuarioSesion, filtros) => ipcRenderer.invoke('backups:listar', usuarioSesion, filtros),
    crear: (usuarioSesion, opciones) => ipcRenderer.invoke('backups:crear', usuarioSesion, opciones),
    ultimo: (usuarioSesion, filtros) => ipcRenderer.invoke('backups:ultimo', usuarioSesion, filtros),
    obtenerConfig: (usuarioSesion) => ipcRenderer.invoke('backups:obtenerConfig', usuarioSesion),
    guardarConfig: (usuarioSesion, config) => ipcRenderer.invoke('backups:guardarConfig', usuarioSesion, config),
    restaurar: (usuarioSesion, nombreArchivo) => ipcRenderer.invoke('backups:restaurar', usuarioSesion, nombreArchivo)
  },
  cloudSync: {
    sincronizar: (usuarioSesion, opciones) => ipcRenderer.invoke('cloudSync:sincronizar', usuarioSesion, opciones)
  },
  usuarios: {
    listar: (usuarioSesion) => ipcRenderer.invoke('usuarios:listar', usuarioSesion),
    listarRoles: (usuarioSesion) => ipcRenderer.invoke('usuarios:listarRoles', usuarioSesion),
    crear: (usuarioSesion, data) => ipcRenderer.invoke('usuarios:crear', usuarioSesion, data),
    actualizar: (usuarioSesion, id, data) => ipcRenderer.invoke('usuarios:actualizar', usuarioSesion, id, data),
    cambiarEstado: (usuarioSesion, id, estado) => ipcRenderer.invoke('usuarios:cambiarEstado', usuarioSesion, id, estado)
  }
});
