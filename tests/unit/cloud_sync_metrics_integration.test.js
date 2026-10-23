const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SUPABASE_URL = 'https://sync-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-only';

// Aisla el servicio de sincronizacion del binario SQLite y de la BD real; estos
// casos no necesitan consultar ni modificar una base local o remota.
const rutaConexion = require.resolve('../../backend/database/connection');
let filasPorTabla = {};
require.cache[rutaConexion] = {
  id: rutaConexion,
  filename: rutaConexion,
  loaded: true,
  exports: {
    getDb: () => ({
      pragma: () => {},
      transaction: (callback) => callback,
      prepare: (sql) => ({
        all: () => {
          const tablaInfo = sql.match(/^PRAGMA table_info\("([^"]+)"\)$/);
          if (tablaInfo) return [{ name: 'id', pk: 1 }];
          const tablaDatos = sql.match(/^SELECT \* FROM "([^"]+)"/);
          if (tablaDatos) return filasPorTabla[tablaDatos[1]] || [];
          return [];
        }
      })
    }),
    resolveDbPath: () => path.join(os.tmpdir(), 'farmacia-cloud-sync-test.db')
  }
};

const cloudSyncService = require('../../backend/services/cloudSyncService');
let carpetaTemporal;
let fetchOriginal;

function rutasTemporales() {
  carpetaTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-cloud-sync-test-'));
  const rutaEstado = path.join(carpetaTemporal, 'state.json');
  const rutaMetricas = path.join(carpetaTemporal, 'metrics.json');
  fs.writeFileSync(rutaEstado, JSON.stringify({ last_sync_timestamp: '2099-01-01T00:00:00.000Z' }));
  return { rutaEstado, rutaMetricas };
}

beforeEach(() => {
  fetchOriginal = global.fetch;
  filasPorTabla = {};
});

afterEach(() => {
  global.fetch = fetchOriginal;
  if (carpetaTemporal) fs.rmSync(carpetaTemporal, { recursive: true, force: true });
  carpetaTemporal = null;
});

test('una sincronizacion vacia registra solicitudes y filas en el archivo local aislado', async () => {
  const rutas = rutasTemporales();
  global.fetch = async () => new Response('[]', { status: 200 });

  const resultado = await cloudSyncService.sincronizarInterno({
    direccion: 'BAJAR',
    permitirBajadaTotal: false,
    ...rutas
  });
  const dia = JSON.parse(fs.readFileSync(rutas.rutaMetricas, 'utf8')).dias[0];

  assert.equal(resultado.bajados, 0);
  assert.equal(dia.sincronizaciones, 1);
  assert.equal(dia.fallidas, 0);
  assert.equal(dia.solicitudes, 1);
  assert.equal(dia.solicitudesRest, 1);
  assert.equal(dia.solicitudesPull, 1);
  assert.equal(dia.filasBajadas, 0);
  assert.equal(dia.bytesRecibidos, 2);
});

test('una subida registra filas y bytes del upsert REST', async () => {
  const rutas = rutasTemporales();
  filasPorTabla.roles = [{ id: 1, nombre: 'ADMIN' }];
  let cuerpoEnviado = '';
  global.fetch = async (_url, opciones) => {
    cuerpoEnviado = opciones.body;
    return new Response(null, { status: 204 });
  };

  const resultado = await cloudSyncService.sincronizarInterno({ direccion: 'SUBIR', ...rutas });
  const dia = JSON.parse(fs.readFileSync(rutas.rutaMetricas, 'utf8')).dias[0];

  assert.equal(resultado.subidos, 1);
  assert.equal(dia.filasSubidas, 1);
  assert.equal(dia.solicitudesRest, 1);
  assert.equal(dia.solicitudesPush, 1);
  assert.equal(dia.bytesEnviados, Buffer.byteLength(cuerpoEnviado));
  assert.equal(cuerpoEnviado.includes('ADMIN'), true);
});

test('un 429 temporal reintentado se mide por intento y la respuesta final se procesa', async () => {
  const rutas = rutasTemporales();
  let solicitudes = 0;
  global.fetch = async () => {
    solicitudes += 1;
    if (solicitudes === 1) return new Response('esperar', { status: 429, headers: { 'Retry-After': '0' } });
    return new Response('[]', { status: 200 });
  };

  await cloudSyncService.sincronizarInterno({ direccion: 'BAJAR', ...rutas });
  const dia = JSON.parse(fs.readFileSync(rutas.rutaMetricas, 'utf8')).dias[0];

  assert.equal(solicitudes, 2);
  assert.equal(dia.solicitudes, 2);
  assert.equal(dia.reintentos, 1);
  assert.equal(dia.bytesEnviados, 0);
  assert.equal(dia.bytesRecibidos, Buffer.byteLength('esperar[]'));
  assert.equal(dia.fallidas, 0);
});

test('un fallo de sincronizacion no avanza el cursor y queda registrado', async () => {
  const rutas = rutasTemporales();
  global.fetch = async () => new Response('esperar', { status: 429, headers: { 'Retry-After': '0' } });

  await assert.rejects(cloudSyncService.sincronizarInterno({ direccion: 'BAJAR', ...rutas }));
  const estado = JSON.parse(fs.readFileSync(rutas.rutaEstado, 'utf8'));
  const dia = JSON.parse(fs.readFileSync(rutas.rutaMetricas, 'utf8')).dias[0];

  assert.equal(estado.last_sync_timestamp, '2099-01-01T00:00:00.000Z');
  assert.equal(dia.sincronizaciones, 1);
  assert.equal(dia.fallidas, 1);
  assert.equal(dia.solicitudes, 3);
  assert.equal(dia.reintentos, 2);
});
