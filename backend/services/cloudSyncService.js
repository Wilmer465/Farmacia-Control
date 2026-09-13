const { getDb } = require('../database/connection');
const permisoService = require('./permisoService');
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = require('../config/supabaseConfig');
const { ROLES } = require('../../shared/constants');

class CloudSyncError extends Error {}
let syncInterval = null;
let syncEnCurso = false;

const SYNC_TABLES = [
  'roles',
  'sedes',
  'usuarios',
  'medicamentos',
  'lotes',
  'receptores',
  'ordenes',
  'orden_detalles',
  'despachos',
  'despacho_detalle',
  'entregas',
  'solicitudes_eliminacion',
  'solicitudes_intercambio',
  'movimientos_inventario',
  'auditoria'
];

function verificarPermiso(usuarioSesion) {
  if (![ROLES.SUPERADMIN, ROLES.ADMIN].includes(usuarioSesion?.rol_nombre)) {
    throw new permisoService.PermisoError('Solo Superadmin o Administrador pueden sincronizar con la nube.');
  }
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new CloudSyncError('Falta configurar SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY.');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: headers(options.headers || {})
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new CloudSyncError(`Supabase respondió ${res.status}: ${detalle || res.statusText}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function allRows(db, table) {
  return db.prepare(`SELECT * FROM "${table}"`).all();
}

function primaryKeyFor(db, table) {
  const info = db.prepare(`PRAGMA table_info("${table}")`).all();
  const pk = info.find((col) => col.pk);
  return pk?.name || 'id';
}

function insertOrReplace(db, table, row) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((col) => col.name);
  const names = cols.filter((col) => Object.prototype.hasOwnProperty.call(row, col));
  if (!names.length) return;
  const placeholders = names.map((name) => `@${name}`).join(', ');
  const quoted = names.map((name) => `"${name}"`).join(', ');
  db.prepare(`INSERT OR REPLACE INTO "${table}" (${quoted}) VALUES (${placeholders})`).run(row);
}

async function subir() {
  const db = getDb();
  const payload = [];
  for (const table of SYNC_TABLES) {
    const pk = primaryKeyFor(db, table);
    for (const row of allRows(db, table)) {
      const recordId = String(row[pk]);
      if (!recordId) continue;
      payload.push({
        table_name: table,
        record_id: recordId,
        data: row,
        local_updated_at: row.updated_at || row.fecha_actualizacion || row.fecha || row.created_at || new Date().toISOString()
      });
    }
  }

  const chunkSize = 300;
  for (let i = 0; i < payload.length; i += chunkSize) {
    await supabaseRequest('sync_records', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload.slice(i, i + chunkSize))
    });
  }
  return payload.length;
}

async function bajar() {
  const db = getDb();
  let recibidos = 0;

  db.pragma('foreign_keys = OFF');
  const tx = db.transaction((records) => {
    for (const table of SYNC_TABLES) {
      const tableRecords = records.filter((item) => item.table_name === table);
      for (const item of tableRecords) {
        if (item.data && typeof item.data === 'object') {
          insertOrReplace(db, table, item.data);
          recibidos += 1;
        }
      }
    }
  });

  let offset = 0;
  const limit = 1000;
  while (true) {
    const records = await supabaseRequest(
      `sync_records?select=table_name,record_id,data&order=table_name.asc&limit=${limit}&offset=${offset}`,
      { method: 'GET' }
    );
    if (!records?.length) break;
    tx(records);
    if (records.length < limit) break;
    offset += limit;
  }
  db.pragma('foreign_keys = ON');
  return recibidos;
}

async function sincronizar(usuarioSesion, { direccion = 'AMBAS' } = {}) {
  verificarPermiso(usuarioSesion);
  return sincronizarInterno({ direccion });
}

async function sincronizarInterno({ direccion = 'AMBAS' } = {}) {
  if (syncEnCurso) {
    return {
      inicio: new Date().toISOString(),
      fin: new Date().toISOString(),
      subidos: 0,
      bajados: 0,
      direccion,
      omitida: true
    };
  }

  syncEnCurso = true;
  const inicio = new Date().toISOString();
  let subidos = 0;
  let bajados = 0;

  try {
    if (direccion === 'SUBIR' || direccion === 'AMBAS') subidos = await subir();
    if (direccion === 'BAJAR' || direccion === 'AMBAS') bajados = await bajar();

    return {
      inicio,
      fin: new Date().toISOString(),
      subidos,
      bajados,
      direccion
    };
  } finally {
    syncEnCurso = false;
  }
}

async function sincronizarAutomaticamente() {
  try {
    const res = await sincronizarInterno({ direccion: 'AMBAS' });
    if (!res.omitida) {
      console.log(`[cloudSync] Sincronización automática OK: ${res.subidos} subidos, ${res.bajados} bajados.`);
    }
  } catch (err) {
    console.warn(`[cloudSync] Sincronización automática omitida: ${err.message}`);
  }
}

function iniciarPlanificadorCloudSync({ intervaloMs = 5 * 60 * 1000, ejecutarAlInicio = true } = {}) {
  if (syncInterval) return;
  if (ejecutarAlInicio) {
    setTimeout(sincronizarAutomaticamente, 15 * 1000);
  }
  syncInterval = setInterval(sincronizarAutomaticamente, intervaloMs);
  console.log(`[cloudSync] Planificador Supabase iniciado cada ${Math.round(intervaloMs / 1000)} segundos.`);
}

function sincronizarEnSegundoPlano(motivo = 'cambio-local') {
  setTimeout(async () => {
    try {
      const res = await sincronizarInterno({ direccion: 'SUBIR' });
      if (!res.omitida) {
        console.log(`[cloudSync] Cambio local sincronizado (${motivo}): ${res.subidos} registros subidos.`);
      }
    } catch (err) {
      console.warn(`[cloudSync] Cambio local pendiente (${motivo}): ${err.message}`);
    }
  }, 500);
}

function detenerPlanificadorCloudSync() {
  if (!syncInterval) return;
  clearInterval(syncInterval);
  syncInterval = null;
}

module.exports = {
  sincronizar,
  sincronizarEnSegundoPlano,
  iniciarPlanificadorCloudSync,
  detenerPlanificadorCloudSync,
  CloudSyncError,
  SYNC_TABLES
};
