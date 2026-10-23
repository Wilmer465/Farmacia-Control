const fs = require('fs');
const path = require('path');

const DIAS_RETENCION = 90;
const CAMPOS_METRICAS = Object.freeze([
  'solicitudes',
  'reintentos',
  'bytesEnviados',
  'bytesRecibidos',
  'solicitudesRest',
  'bytesEnviadosRest',
  'bytesRecibidosRest',
  'solicitudesStorage',
  'bytesEnviadosStorage',
  'bytesRecibidosStorage',
  'solicitudesPush',
  'bytesEnviadosPush',
  'bytesRecibidosPush',
  'solicitudesPull',
  'bytesEnviadosPull',
  'bytesRecibidosPull',
  'solicitudesStorageSubida',
  'bytesEnviadosStorageSubida',
  'bytesRecibidosStorageSubida',
  'solicitudesStorageBajada',
  'bytesEnviadosStorageBajada',
  'bytesRecibidosStorageBajada',
  'filasSubidas',
  'filasBajadas',
  'duracionMs'
]);

function numeroSeguro(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function crearContadorSincronizacion({ reloj = Date.now } = {}) {
  const inicio = reloj();
  const totales = Object.fromEntries(CAMPOS_METRICAS.map((campo) => [campo, 0]));
  let fallida = false;

  return {
    registrarSolicitud({
      bytesEnviados = 0,
      bytesRecibidos = 0,
      reintento = false,
      categoria = 'rest',
      operacion = 'rest'
    } = {}) {
      totales.solicitudes += 1;
      totales.bytesEnviados += numeroSeguro(bytesEnviados);
      totales.bytesRecibidos += numeroSeguro(bytesRecibidos);
      const sufijo = categoria === 'storage' ? 'Storage' : 'Rest';
      totales[`solicitudes${sufijo}`] += 1;
      totales[`bytesEnviados${sufijo}`] += numeroSeguro(bytesEnviados);
      totales[`bytesRecibidos${sufijo}`] += numeroSeguro(bytesRecibidos);
      const sufijoOperacion = ['push', 'pull', 'storageSubida', 'storageBajada'].includes(operacion)
        ? operacion.charAt(0).toUpperCase() + operacion.slice(1)
        : null;
      if (sufijoOperacion) {
        totales[`solicitudes${sufijoOperacion}`] += 1;
        totales[`bytesEnviados${sufijoOperacion}`] += numeroSeguro(bytesEnviados);
        totales[`bytesRecibidos${sufijoOperacion}`] += numeroSeguro(bytesRecibidos);
      }
      if (reintento) totales.reintentos += 1;
    },
    registrarFilasSubidas(cantidad) {
      totales.filasSubidas += numeroSeguro(cantidad);
    },
    registrarFilasBajadas(cantidad) {
      totales.filasBajadas += numeroSeguro(cantidad);
    },
    marcarFallo() {
      fallida = true;
    },
    finalizar() {
      return {
        ...totales,
        duracionMs: numeroSeguro(reloj() - inicio),
        fallida
      };
    }
  };
}

function fechaUTC(fecha) {
  return new Date(fecha).toISOString().slice(0, 10);
}

function normalizarDia(dia) {
  if (!dia || typeof dia !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(dia.fecha || '')) return null;
  return {
    fecha: dia.fecha,
    sincronizaciones: numeroSeguro(dia.sincronizaciones),
    fallidas: numeroSeguro(dia.fallidas),
    fallidasStorage: numeroSeguro(dia.fallidasStorage),
    duracionMsStorage: numeroSeguro(dia.duracionMsStorage),
    ...Object.fromEntries(CAMPOS_METRICAS.map((campo) => [campo, numeroSeguro(dia[campo])]))
  };
}

function actualizarMetricasDiarias(resumen, { ruta, ahora = new Date(), maxDias = DIAS_RETENCION, contarSincronizacion = true } = {}) {
  if (!ruta) throw new Error('Se requiere ruta para guardar las métricas locales.');
  const base = path.resolve(ruta);
  let dias = [];
  try {
    const guardado = JSON.parse(fs.readFileSync(base, 'utf8'));
    if (guardado?.version === 1 && Array.isArray(guardado.dias)) {
      dias = guardado.dias.map(normalizarDia).filter(Boolean);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const fecha = fechaUTC(ahora);
  let dia = dias.find((item) => item.fecha === fecha);
  if (!dia) {
    dia = {
      fecha,
      sincronizaciones: 0,
      fallidas: 0,
      fallidasStorage: 0,
      duracionMsStorage: 0,
      ...Object.fromEntries(CAMPOS_METRICAS.map((campo) => [campo, 0]))
    };
    dias.push(dia);
  }

  if (contarSincronizacion) {
    dia.sincronizaciones += 1;
    if (resumen?.fallida) dia.fallidas += 1;
    for (const campo of CAMPOS_METRICAS) dia[campo] += numeroSeguro(resumen?.[campo]);
  } else {
    if (resumen?.fallida) dia.fallidasStorage += 1;
    dia.duracionMsStorage += numeroSeguro(resumen?.duracionMs);
    for (const campo of CAMPOS_METRICAS) {
      if (!['filasSubidas', 'filasBajadas', 'duracionMs'].includes(campo)) {
        dia[campo] += numeroSeguro(resumen?.[campo]);
      }
    }
  }

  const limite = new Date(ahora);
  limite.setUTCDate(limite.getUTCDate() - Math.max(1, numeroSeguro(maxDias)) + 1);
  const fechaLimite = fechaUTC(limite);
  const contenido = {
    version: 1,
    retencionDias: Math.max(1, numeroSeguro(maxDias)),
    dias: dias.filter((item) => item.fecha >= fechaLimite).sort((a, b) => a.fecha.localeCompare(b.fecha))
  };

  fs.mkdirSync(path.dirname(base), { recursive: true });
  const temporal = `${base}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    fs.writeFileSync(temporal, `${JSON.stringify(contenido, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporal, base);
  } finally {
    try { fs.rmSync(temporal, { force: true }); } catch {}
  }
  return contenido;
}

function agregarMetricasDiarias(resumen, opciones = {}) {
  return actualizarMetricasDiarias(resumen, opciones);
}

function agregarTransferenciaDiaria(resumen, opciones = {}) {
  return actualizarMetricasDiarias(resumen, { ...opciones, contarSincronizacion: false });
}

module.exports = {
  DIAS_RETENCION,
  crearContadorSincronizacion,
  agregarMetricasDiarias,
  agregarTransferenciaDiaria
};
