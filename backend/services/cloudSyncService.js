const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const { getDb, resolveDbPath } = require('../database/connection');
const permisoService = require('./permisoService');
const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, syncHabilitado } = require('../config/supabaseConfig');
const { ROLES } = require('../../shared/constants');
// Convención del sobre offline-first (Fase 1-3): record_id namespaced, sanitizado,
// marcas temporales, blobs por referencia y LWW. Espejo móvil en utils/syncPayload.ts.
const {
  CAMPOS_BLOB,
  sanitizarFila,
  extraerMarcaTemporal,
  debeExternalizar,
  rutaBlob,
  descriptorBlob,
  normalizarValoresFila,
  ambitoPara
} = require('../../shared/syncPayload');

class CloudSyncError extends Error {}
let syncInterval = null;
let syncEnCurso = false;
let syncDebounceTimer = null;

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
  'auditoria',
  'catalogo_cum',
  'catalogo_empaques',
  'catalogo_actualizaciones'
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
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function supabaseRequest(pathRequest, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new CloudSyncError('Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
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

// Sincronización incremental (Delta): lee solo registros cambiados si existe last_sync_timestamp.
// La lista incluye las columnas reales de este esquema (catalogo_cum usa
// creado_en/actualizado_en, catalogo_actualizaciones fecha_importacion).
// `>=` con cursor=inicio es at-least-once a propósito: los registros creados
// DURANTE la subida tienen ts > inicio y se reenvían la próxima vez (los
// duplicados los resuelve merge-duplicates en nube). Con `>` se perderían.
function getRowsToSync(db, table, lastSyncTimestamp) {
  const cols = getTableColumns(db, table);
  const dateCol = ['updated_at', 'fecha_actualizacion', 'fecha', 'created_at', 'fecha_solicitud', 'fecha_creacion', 'creado_en', 'actualizado_en', 'fecha_importacion', 'fecha_resolucion', 'fecha_actualizacion'].find((c) => cols.includes(c));

  if (!lastSyncTimestamp || !dateCol) {
    return db.prepare(`SELECT * FROM "${table}"`).all();
  }

  return db.prepare(`SELECT * FROM "${table}" WHERE "${dateCol}" >= ?`).all(lastSyncTimestamp);
}

function recentTimestamp() {
  return new Date(Date.now() - RECENT_UPLOAD_WINDOW_MS).toISOString();
}

// Blobs grandes a storage.blobs con service_role (SOLO main, nunca renderer
// ni móvil). Se guardan como texto base64 con x-upsert: el mismo formato que
// escribe y lee el móvil, con hash para verificar integridad al descargar.
async function subirBlob(referencia, textoBase64) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/blobs/${referencia}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: Buffer.from(textoBase64, 'utf8')
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new CloudSyncError(`Storage respondió ${res.status}: ${detalle || res.statusText}`);
  }
}

// Descarga bajo demanda un blob por descriptor (verifica hash). Para vistas de
// detalle/documento, no para el pull automático.
async function descargarBlob(descriptor) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new CloudSyncError('Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/blobs/${descriptor.__blob_ref}`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!res.ok) throw new CloudSyncError(`Adjunto no disponible (${res.status}).`);
  const texto = await res.text();
  const sha = nodeCrypto.createHash('sha256').update(texto, 'utf8').digest('hex');
  if (sha !== descriptor.__sha256) throw new CloudSyncError('Adjunto corrupto (hash).');
  return texto;
}

function sha256Hex(texto) {
  return nodeCrypto.createHash('sha256').update(texto, 'utf8').digest('hex');
}

async function subir(lastSyncTimestamp, { permitirSubidaTotal = true } = {}) {
  const db = getDb();
  const payload = [];
  const since = lastSyncTimestamp || (permitirSubidaTotal ? null : recentTimestamp());
  const adjuntosFallidos = [];

  for (const table of SYNC_TABLES) {
    const pk = primaryKeyFor(db, table);
    const rows = getRowsToSync(db, table, since);

    for (const row of rows) {
      if (row[pk] === null || row[pk] === undefined) continue;
      const fila = { ...row };
      // Externaliza blobs grandes antes de sanitizar: el descriptor (ruta,
      // hash, tamaño) es lo que viaja en `data`, nunca el binario.
      const ambito = ambitoPara(table, fila);
      const recordId = `${ambito}:${table}:${row[pk]}`;
      let filaCompleta = true;
      for (const campo of CAMPOS_BLOB) {
        if (!debeExternalizar(campo, fila[campo])) continue;
        const texto = fila[campo];
        const referencia = rutaBlob(ambito, table, recordId, campo);
        try {
          await subirBlob(referencia, texto);
          fila[campo] = descriptorBlob(referencia, sha256Hex(texto), texto.length);
        } catch (err) {
          // La fila se omite este ciclo (el servidor conserva el descriptor
          // anterior) y el cursor no avanza: nada se pierde, se reintenta.
          adjuntosFallidos.push(`${table}:${row[pk]}.${campo} (${err.message})`);
          filaCompleta = false;
          console.warn(`[cloudSync] Adjunto pendiente ${referencia}: ${err.message}`);
          break;
        }
      }
      if (!filaCompleta) continue;
      payload.push({
        table_name: table,
        record_id: recordId,
        data: sanitizarFila(fila),
        local_updated_at: extraerMarcaTemporal(row, new Date().toISOString())
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
  if (adjuntosFallidos.length > 0) {
    throw new CloudSyncError(
      `Subidos ${payload.length} registros pero ${adjuntosFallidos.length} adjuntos quedaron pendientes: ${adjuntosFallidos.join('; ')}`
    );
  }
  return payload.length;
}

async function bajar(lastSyncTimestamp, { permitirBajadaTotal = true } = {}) {
  if (!lastSyncTimestamp && !permitirBajadaTotal) return 0;

  const db = getDb();
  let recibidos = 0;

  db.pragma('foreign_keys = OFF');
  try {
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
            // Descriptores de blob y JSON viajan como objetos: a SQLite como texto.
            insertOrReplace(db, table, normalizarValoresFila(fila));
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
        `sync_records?select=table_name,record_id,data,local_updated_at,synced_at&order=synced_at.asc&limit=${limit}&offset=${offset}${timeFilter}`,
        { method: 'GET' }
      );
      if (!records?.length) break;
      tx(records);
      if (records.length < limit) break;
      offset += limit;
    }

    // Con FK apagadas durante el REPLACE, SQLite no revalida al reactivar:
    // se verifica explícito y NO se avanza el cursor si hay huérfanos.
    const violaciones = db.prepare('PRAGMA foreign_key_check').all();
    if (violaciones.length > 0) {
      throw new CloudSyncError(`La bajada dejó ${violaciones.length} violación(es) de clave foránea; no se avanza el cursor.`);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
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
  const { syncHabilitado } = require('../config/supabaseConfig');
  if (!syncHabilitado) return;

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
  descargarBlob,
  CloudSyncError,
  SYNC_TABLES
};
