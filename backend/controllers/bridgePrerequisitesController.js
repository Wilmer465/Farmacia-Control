'use strict';

const bridgePrerequisitesService = require('../services/bridgePrerequisitesService');

async function verificarPrerrequisitos(service = bridgePrerequisitesService) {
  try {
    return await service.verificarPrerrequisitos();
  } catch {
    return { ok: false, error: 'No se pudo inspeccionar los prerrequisitos de los puentes.' };
  }
}

function crearHandler(service = bridgePrerequisitesService) {
  return async (_event, ...args) => {
    if (args.length !== 0) {
      return { ok: false, error: 'La consulta de prerrequisitos no acepta argumentos.' };
    }
    return verificarPrerrequisitos(service);
  };
}

module.exports = { crearHandler, verificarPrerrequisitos };
