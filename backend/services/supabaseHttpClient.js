const MAX_REINTENTOS = 2;
const ESPERA_BASE_MS = 500;
const RETRY_AFTER_MAX_MS = 5000;

function bytesDelCuerpo(cuerpo) {
  if (cuerpo === null || cuerpo === undefined) return 0;
  if (typeof cuerpo === 'string') return Buffer.byteLength(cuerpo, 'utf8');
  if (Buffer.isBuffer(cuerpo)) return cuerpo.byteLength;
  if (ArrayBuffer.isView(cuerpo)) return cuerpo.byteLength;
  if (cuerpo instanceof ArrayBuffer) return cuerpo.byteLength;
  return 0;
}

function esReintentableMetodo(method = 'GET', headers = {}) {
  const metodo = String(method).toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(metodo)) return true;
  const cabeceras = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  return Boolean(metodo === 'POST' && (
    cabeceras['x-upsert'] === 'true'
    || cabeceras.prefer?.includes('resolution=merge-duplicates')
  ));
}

function esErrorTransitorio(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function demoraRetryAfter(valor, ahora = Date.now()) {
  if (!valor) return null;
  const segundos = Number(valor);
  const ms = Number.isFinite(segundos) ? segundos * 1000 : Date.parse(valor) - ahora;
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.min(RETRY_AFTER_MAX_MS, ms));
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function solicitarConReintentos(url, options = {}, {
  fetchImpl = globalThis.fetch,
  esperarImpl = esperar,
  maxReintentos = MAX_REINTENTOS,
  demoraBaseMs = ESPERA_BASE_MS,
  ahora = Date.now,
  alIntento = () => {}
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch no está disponible en este runtime.');
  const intentosPermitidos = Math.min(5, Math.max(0, Math.floor(Number(maxReintentos) || 0)));
  const bytesEnviados = bytesDelCuerpo(options.body);
  const reintentarMetodo = esReintentableMetodo(options.method, options.headers);

  for (let intento = 0; ; intento += 1) {
    let respuesta;
    try {
      respuesta = await fetchImpl(url, options);
    } catch (error) {
      const puedeReintentar = reintentarMetodo && intento < intentosPermitidos;
      alIntento({ bytesEnviados, bytesRecibidos: 0, reintento: intento > 0, status: null });
      if (!puedeReintentar) throw error;
      await esperarImpl(demoraBaseMs * (2 ** intento));
      continue;
    }

    const puedeReintentar = reintentarMetodo
      && esErrorTransitorio(respuesta.status)
      && intento < intentosPermitidos;
    if (puedeReintentar) {
      const cuerpo = await respuesta.arrayBuffer();
      alIntento({
        bytesEnviados,
        bytesRecibidos: cuerpo.byteLength,
        reintento: intento > 0,
        status: respuesta.status
      });
      const demoraServidor = demoraRetryAfter(respuesta.headers?.get('retry-after'), ahora());
      await esperarImpl(demoraServidor ?? demoraBaseMs * (2 ** intento));
      continue;
    }

    const cuerpo = await respuesta.arrayBuffer();
    alIntento({
      bytesEnviados,
      bytesRecibidos: cuerpo.byteLength,
      reintento: intento > 0,
      status: respuesta.status
    });
    return {
      status: respuesta.status,
      statusText: respuesta.statusText,
      ok: respuesta.ok,
      headers: respuesta.headers,
      texto: Buffer.from(cuerpo).toString('utf8'),
      bytesEnviados,
      bytesRecibidos: cuerpo.byteLength,
      reintentos: intento
    };
  }
}

module.exports = {
  MAX_REINTENTOS,
  bytesDelCuerpo,
  esReintentableMetodo,
  esErrorTransitorio,
  demoraRetryAfter,
  solicitarConReintentos
};
