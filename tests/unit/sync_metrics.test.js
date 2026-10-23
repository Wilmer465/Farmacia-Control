const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  crearContadorSincronizacion,
  agregarMetricasDiarias,
  agregarTransferenciaDiaria
} = require('../../backend/services/syncMetrics');

const carpetasTemporales = [];

function prepararRuta() {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-sync-metrics-'));
  carpetasTemporales.push(carpeta);
  return path.join(carpeta, 'cloud_sync_metrics.json');
}

afterEach(() => {
  for (const carpeta of carpetasTemporales.splice(0)) {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

test('registra una sincronizacion vacia sin solicitudes ni filas', () => {
  let reloj = 100;
  const contador = crearContadorSincronizacion({ reloj: () => reloj });
  reloj = 125;
  const resumen = contador.finalizar();
  const guardado = agregarMetricasDiarias(resumen, {
    ruta: prepararRuta(),
    ahora: new Date('2026-10-23T12:00:00.000Z')
  });

  assert.equal(guardado.dias[0].sincronizaciones, 1);
  assert.equal(guardado.dias[0].solicitudes, 0);
  assert.equal(guardado.dias[0].filasSubidas, 0);
  assert.equal(guardado.dias[0].duracionMs, 25);
});

test('agrega solicitudes, filas, errores y bytes por dia sin guardar campos ajenos', () => {
  const ruta = prepararRuta();
  const fecha = new Date('2026-10-23T12:00:00.000Z');
  const contador = crearContadorSincronizacion();
  contador.registrarSolicitud({ bytesEnviados: 20, bytesRecibidos: 12, categoria: 'rest', operacion: 'push' });
  contador.registrarSolicitud({ bytesEnviados: 5, bytesRecibidos: 7, categoria: 'storage', operacion: 'storageSubida', reintento: true });
  contador.registrarFilasSubidas(3);
  contador.registrarFilasBajadas(2);
  contador.marcarFallo();

  const guardado = agregarMetricasDiarias({ ...contador.finalizar(), username: 'dato-privado' }, { ruta, ahora: fecha });
  const dia = guardado.dias[0];
  assert.equal(dia.sincronizaciones, 1);
  assert.equal(dia.fallidas, 1);
  assert.equal(dia.solicitudes, 2);
  assert.equal(dia.reintentos, 1);
  assert.equal(dia.bytesEnviados, 25);
  assert.equal(dia.bytesRecibidos, 19);
  assert.equal(dia.solicitudesRest, 1);
  assert.equal(dia.solicitudesStorage, 1);
  assert.equal(dia.solicitudesPush, 1);
  assert.equal(dia.solicitudesStorageSubida, 1);
  assert.equal(dia.filasSubidas, 3);
  assert.equal(dia.filasBajadas, 2);
  assert.equal('username' in dia, false);
  assert.equal('username' in JSON.parse(fs.readFileSync(ruta, 'utf8')), false);
});

test('las descargas bajo demanda agregan trafico sin contarlas como sincronizacion', () => {
  const ruta = prepararRuta();
  const fecha = new Date('2026-10-23T12:00:00.000Z');
  agregarTransferenciaDiaria({
    solicitudes: 1,
    solicitudesStorage: 1,
    bytesEnviados: 0,
    bytesRecibidos: 2048,
    bytesRecibidosStorage: 2048,
    solicitudesStorageBajada: 1,
    bytesRecibidosStorageBajada: 2048,
    reintentos: 0,
    duracionMs: 17
  }, { ruta, ahora: fecha });

  const guardado = agregarMetricasDiarias({}, { ruta, ahora: fecha });
  assert.equal(guardado.dias[0].sincronizaciones, 1);
  assert.equal(guardado.dias[0].solicitudesStorage, 1);
  assert.equal(guardado.dias[0].bytesRecibidosStorage, 2048);
  assert.equal(guardado.dias[0].bytesRecibidosStorageBajada, 2048);
  assert.equal(guardado.dias[0].duracionMsStorage, 17);
});

test('retiene como maximo 90 dias de resumen', () => {
  const ruta = prepararRuta();
  const anterior = new Date('2026-07-01T12:00:00.000Z');
  agregarMetricasDiarias({}, { ruta, ahora: anterior });
  const reciente = new Date('2026-10-23T12:00:00.000Z');
  const guardado = agregarMetricasDiarias({}, { ruta, ahora: reciente });

  assert.deepEqual(guardado.dias.map((dia) => dia.fecha), ['2026-10-23']);
});
