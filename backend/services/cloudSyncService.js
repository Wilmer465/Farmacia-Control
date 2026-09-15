const fs = require('fs');
const path = require('path');
const { getDb, resolveDbPath } = require('../database/connection');
const permisoService = require('./permisoService');
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = require('../config/supabaseConfig');
const { ROLES } = require('../../shared/constants');

class CloudSyncError extends Error {}
let syncInterval = null;
let syncEnCurso = false;
let syncDebounceTimer = null;

// SEGURIDAD: columnas que NUNCA salen a la nube. password_hash no se sincroniza:
// cada sede gestiona credenciales en local. Agregar aquí futuros secretos.
const COLUMNAS_SENSIBLES = new Set(['password_hash', 'password', 'token', 'secret']);

function sanitizarFila(row) {
  if (!row || typeof row !== 'object') return row;
  let limpia = null;
  for (const key of Object.keys(row)) {
    if (COLUMNAS_SENSIBLES.has(key.toLowerCase())) {
      if (!limpia) limpia = { ...row };
      delete limpia[key];
    }
  }
  return limpia || row;
}

const RECENT_UPLOAD_WINDOW_MS = 30 * 60 * 1000;

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

function rutaSyncState() {
  const dbPath = resolveDbPath();
  return path.join(path.dirname(dbPath), 'cloud_sync_state.json');
}

function leerSyncState() {
  try {
    const ruta = rutaSyncState();
    if (fs.existsSync(ruta)) {
      return JSON.parse(fs.readFileSync(ruta, 'utf8'));
    }
  } catch (err) {
    console.warn('[cloudSync] Error leyendo sync_state:', err.message);
  }
  return { last_sync_timestamp: null, last_sync_direction: null };
}

function guardarSyncState(state) {
  try {
    const ruta = rutaSyncState();
    fs.writeFileSync(ruta, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[cloudSync] Error guardando sync_state:', err.message);
  }
}

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

async function supabaseRequest(pathRequest, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new CloudSyncError('Falta configurar SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY.');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathRequest}`, {
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

function getTableColumns(db, table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().map((col) => col.name);
}

function primaryKeyFor(db, table) {
  const info = db.prepare(`PRAGMA table_info("${table}")`).all();
  const pk = info.find((col) => col.pk);
  return pk?.name || 'id';
}

function insertOrReplace(db, table, row) {
  const cols = getTableColumns(db, table);
  const names = cols.filter((col) => Object.prototype.hasOwnProperty.call(row, col));
  if (!names.length) return;
  const placeholders = names.map((name) => `@${name}`).join(', ');
  const quoted = names.map((name) => `"${name}"`).join(', ');
  db.prepare(`INSERT OR REPLACE INTO "${table}" (${quoted}) VALUES (${placeholders})`).run(row);
}

// Sincronización incremental (Delta): lee solo registros cambiados si existe last_sync_timestamp
function getRowsToSync(db, table, lastSyncTimestamp) {
  const cols = getTableColumns(db, table);
  const dateCol = ['updated_at', 'fecha_actualizacion', 'fecha', 'created_at', 'fecha_solicitud', 'fecha_creacion'].find((c) => cols.includes(c));

  if (!lastSyncTimestamp || !dateCol) {
    return db.prepare(`SELECT * FROM "${table}"`).all();
  }

  return db.prepare(`SELECT * FROM "${table}" WHERE "${dateCol}" >= ?`).all(lastSyncTimestamp);
}

function recentTimestamp() {
  return new Date(Date.now() - RECENT_UPLOAD_WINDOW_MS).toISOString();
}

async function subir(lastSyncTimestamp, { permitirSubidaTotal = true } = {}) {
  const db = getDb();
  const payload = [];
  const since = lastSyncTimestamp || (permitirSubidaTotal ? null : recentTimestamp());

  for (const table of SYNC_TABLES) {
    const pk = primaryKeyFor(db, table);
    const rows = getRowsToSync(db, table, since);

    for (const row of rows) {
      const recordId = String(row[pk]);
      if (!recordId) continue;
      payload.push({
        table_name: table,
        record_id: recordId,
        data: sanitizarFila(row),
        local_updated_at: row.updated_at || row.fecha_actualizacion || row.fecha || row.created_at || new Date().toISOString()
      });
    }
  }

  if (payload.length === 0) return 0;

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

async function bajar(lastSyncTimestamp, { permitirBajadaTotal = true } = {}) {
  if (!lastSyncTimestamp && !permitirBajadaTotal) return 0;

  const db = getDb();
  let recibidos = 0;

  db.pragma('foreign_keys = OFF');
  const tx = db.transaction((records) => {
    for (const table of SYNC_TABLES) {
      const tableRecords = records.filter((item) => item.table_name === table);
      for (const item of tableRecords) {
        if (item.data && typeof item.data === 'object') {
          let fila = sanitizarFila(item.data);
          // SEGURIDAD: al bajar usuarios, nunca sobrescribir el hash local con
          // dato de nube (que viene sin password_hash). Preservar el local.
          if (table === 'usuarios' && fila.id != null) {
            try {
              const local = db.prepare('SELECT password_hash FROM usuarios WHERE id = ?').get(fila.id);
              if (local && local.password_hash) {
                fila = { ...fila, password_hash: local.password_hash };
              } else if (!fila.password_hash) {
                // Usuario nuevo sin hash en nube: no se puede crear sin credencial.
                continue;
              }
            } catch (_) { /* si falla, se inserta sanitizado */ }
          }
          insertOrReplace(db, table, fila);
          recibidos += 1;
        }
      }
    }
  });

  let offset = 0;
  const limit = 1000;
  const timeFilter = lastSyncTimestamp ? `&synced_at=gte.${encodeURIComponent(lastSyncTimestamp)}` : '';

  while (true) {
    const records = await supabaseRequest(
      `sync_records?select=table_name,record_id,data&order=table_name.asc&limit=${limit}&offset=${offset}${timeFilter}`,
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
  return sincronizarInterno({ direccion, permitirSubidaTotal: true, permitirBajadaTotal: true });
}

async function sincronizarInterno({
  direccion = 'AMBAS',
  permitirSubidaTotal = false,
  permitirBajadaTotal = false
} = {}) {
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
  const state = leerSyncState();
  const lastSync = state.last_sync_timestamp;
  let subidos = 0;
  let bajados = 0;

  try {
    if (direccion === 'SUBIR' || direccion === 'AMBAS') subidos = await subir(lastSync, { permitirSubidaTotal });
    if (direccion === 'BAJAR' || direccion === 'AMBAS') bajados = await bajar(lastSync, { permitirBajadaTotal });

    const fin = new Date().toISOString();
    guardarSyncState({
      last_sync_timestamp: inicio,
      last_sync_direction: direccion,
      last_run_fin: fin,
      subidos,
      bajados
    });

    return {
      inicio,
      fin,
      subidos,
      bajados,
      direccion,
      esDelta: Boolean(lastSync)
    };
  } finally {
    syncEnCurso = false;
  }
}

async function sincronizarAutomaticamente() {
  try {
    const res = await sincronizarInterno({
      direccion: 'AMBAS',
      permitirSubidaTotal: false,
      permitirBajadaTotal: false
    });
    if (!res.omitida) {
      console.log(`[cloudSync] Sincronización automática OK (${res.esDelta ? 'Delta' : 'Total'}): ${res.subidos} subidos, ${res.bajados} bajados.`);
    }
  } catch (err) {
    console.warn(`[cloudSync] Sincronización automática omitida: ${err.message}`);
  }
}

function iniciarPlanificadorCloudSync({ intervaloMs = 5 * 60 * 1000, ejecutarAlInicio = true } = {}) {
  if (syncInterval) return;
  if (ejecutarAlInicio) {
    setTimeout(sincronizarAutomaticamente, 90 * 1000);
  }
  syncInterval = setInterval(sincronizarAutomaticamente, intervaloMs);
  console.log(`[cloudSync] Planificador Supabase iniciado cada ${Math.round(intervaloMs / 1000)} segundos.`);
}

function sincronizarEnSegundoPlano(motivo = 'cambio-local') {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(async () => {
    syncDebounceTimer = null;
    try {
      const res = await sincronizarInterno({
        direccion: 'SUBIR',
        permitirSubidaTotal: false,
        permitirBajadaTotal: false
      });
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
