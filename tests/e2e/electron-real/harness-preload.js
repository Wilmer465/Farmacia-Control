'use strict';

// Preload SOLO para el arnés de Etapa 4.2. Se carga ADEMÁS del preload de
// producción mediante session.setPreloads(), para no modificar ni reemplazar la
// superficie real de `window.api`. Usa exclusivamente `electron` para poder
// ejecutarse dentro de un preload sandboxeado.
const { contextBridge, ipcRenderer } = require('electron');

function invocar(canal, ...args) {
  return ipcRenderer.invoke(canal, ...args);
}

contextBridge.exposeInMainWorld('__harness', {
  frameInfo: () => invocar('harness:frameInfoRaw'),
  protegido: () => invocar('harness:protegido'),
  errorRuta: () => invocar('harness:errorRuta'),
  errorControlado: () => invocar('harness:errorControlado'),
  errorSqlite: () => invocar('harness:errorSqlite'),
  prefs: () => invocar('harness:prefs'),
  shellCalls: () => invocar('harness:shellCallsRaw'),
  marcarSede: (nombre) => invocar('harness:marcarSede', nombre),
  contarSede: (nombre) => invocar('harness:contarSede', nombre),
  inyectarDocumento: (id, documento) => invocar('harness:inyectarDocumento', id, documento),
  dbInfo: () => invocar('harness:dbInfo')
});
