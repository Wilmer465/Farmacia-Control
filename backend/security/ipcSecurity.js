'use strict';

const { esOrigenPermitido } = require('../../shared/appOriginPolicy');
const { mensajeSeguro, sanearRespuesta } = require('../../shared/errorSanitizer');

const TEXTO_ORIGEN_NO_AUTORIZADO = 'Origen no autorizado.';

class RemitenteNoAutorizadoError extends Error {
  constructor() {
    super(TEXTO_ORIGEN_NO_AUTORIZADO);
    this.name = 'RemitenteNoAutorizadoError';
  }
}

function validarRemitente(event, opciones = {}) {
  if (!event || typeof event !== 'object') {
    throw new RemitenteNoAutorizadoError();
  }

  const sender = event.sender;
  if (!sender || typeof sender.getURL !== 'function') {
    throw new RemitenteNoAutorizadoError();
  }

  let url;
  try {
    url = sender.getURL();
  } catch {
    throw new RemitenteNoAutorizadoError();
  }

  if (!esOrigenPermitido(url, opciones)) {
    throw new RemitenteNoAutorizadoError();
  }

  // Un iframe no puede heredar el privilegio del frame principal. Si Electron no
  // expone la identidad del frame, se rechaza por diseño (fail closed).
  const marcoPrincipal = sender.mainFrame;
  const marcoRemitente = event.senderFrame;
  if (!marcoPrincipal || !marcoRemitente || marcoRemitente !== marcoPrincipal) {
    throw new RemitenteNoAutorizadoError();
  }

  return url;
}

function crearSeguridadIpc({ isDev = false, rendererIndexPath, logger = console } = {}) {
  const opciones = Object.freeze({ isDev: isDev === true, rendererIndexPath });

  function envolver(handler, { nombre = 'canal' } = {}) {
    if (typeof handler !== 'function') {
      throw new TypeError('El handler IPC debe ser una función.');
    }

    return async function handlerSeguro(event, ...args) {
      try {
        validarRemitente(event, opciones);
      } catch {
        logger.warn(`[ipc] remitente rechazado en ${nombre}`);
        return { ok: false, error: TEXTO_ORIGEN_NO_AUTORIZADO };
      }

      try {
        const resultado = await handler(event, ...args);
        return sanearRespuesta(resultado);
      } catch (err) {
        logger.error(`[ipc] error en ${nombre}:`, err && err.stack ? err.stack : err);
        return { ok: false, error: mensajeSeguro(err) };
      }
    };
  }

  function registrar(ipcMain, nombre, handler) {
    if (!ipcMain || typeof ipcMain.handle !== 'function') {
      throw new TypeError('ipcMain.handle no está disponible.');
    }
    ipcMain.handle(nombre, envolver(handler, { nombre }));
  }

  return Object.freeze({
    opciones,
    envolver,
    registrar,
    validarRemitente: (event) => validarRemitente(event, opciones)
  });
}

module.exports = {
  TEXTO_ORIGEN_NO_AUTORIZADO,
  RemitenteNoAutorizadoError,
  crearSeguridadIpc,
  validarRemitente
};
