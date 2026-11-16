'use strict';

const { URL } = require('node:url');
const { esOrigenPermitido } = require('../shared/appOriginPolicy');

// La única salida permitida al navegador externo es HTTPS: nada de file://,
// javascript:, data: ni protocolos registrados por terceros.
function esAperturaExternaPermitida(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parseada = new URL(url);
    return parseada.protocol === 'https:' && Boolean(parseada.hostname);
  } catch {
    return false;
  }
}

function crearPoliticaNavegacion(opciones = {}) {
  return Object.freeze({
    esNavegacionPermitida: (url) => esOrigenPermitido(url, opciones),
    esAperturaExternaPermitida
  });
}

module.exports = {
  crearPoliticaNavegacion,
  esAperturaExternaPermitida
};
