// Lógica pura del sobre sync_records (Fase 1-3 offline-first).
//
// Sin dependencias de plataforma: desktop la usa directo (CommonJS) y el móvil
// usa su espejo (mobile-app/src/utils/syncPayload.ts). Mantener sincronizados.
//
// Cubre: sanitización, marca temporal, decisión blob, LWW y el espejo JS de la
// regla RLS `fila_sync_visible` (contrato probado en tests/sync-offline/).
const {
  TABLAS_GLOBALES,
  CAMPOS_BLOB,
  UMBRAL_BLOB_BASE64,
  esTablaGlobal,
  ambitoPara,
  construirRecordId,
  construirRecordIdParaFila,
  parsearRecordId,
  esDescriptorBlob
} = require('./syncEnvelope');

// Columnas que NUNCA salen a la nube (cada sede gestiona credenciales en local).
const COLUMNAS_SENSIBLES = new Set(['password_hash', 'password', 'token', 'secret']);

// Columnas candidatas a marca temporal, en orden de preferencia. Debe coincidir
// con getRowsToSync de cloudSyncService y con el provider móvil.
const COLUMNAS_MARCA_TEMPORAL = Object.freeze([
  'updated_at',
  'fecha_actualizacion',
  'actualizado_en',
  'fecha',
  'created_at',
  'creado_en',
  'fecha_solicitud',
  'fecha_creacion',
  'fecha_importacion',
  'fecha_resolucion'
]);

function sanitizarFila(row) {
  if (!row || typeof row !== 'object') return row;
  let limpia = null;
  for (const key of Object.keys(row)) {
    if (COLUMNAS_SENSIBLES.has(String(key).toLowerCase())) {
      if (!limpia) limpia = { ...row };
      delete limpia[key];
    }
  }
  return limpia || row;
}

function extraerMarcaTemporal(fila, alternativa) {
  if (fila && typeof fila === 'object') {
    for (const col of COLUMNAS_MARCA_TEMPORAL) {
      if (fila[col]) return String(fila[col]);
    }
  }
  return alternativa || new Date().toISOString();
}

// ¿Este campo debe externalizarse a storage.blobs? Solo strings base64 grandes
// de los campos declarados. Los descriptores ya subidos no se re-suben.
function debeExternalizar(campo, valor, umbral = UMBRAL_BLOB_BASE64) {
  if (!CAMPOS_BLOB.includes(campo)) return false;
  if (typeof valor !== 'string' || valor.length <= umbral) return false;
  if (esDescriptorBlob(valor)) return false;
  try {
    if (esDescriptorBlob(JSON.parse(valor))) return false;
  } catch {
    // no es JSON: es binario pendiente de subir
  }
  return true;
}

function rutaBlob(ambito, tabla, recordId, campo) {
  return `${ambito}/${tabla}/${recordId}/${campo}`;
}

function descriptorBlob(referencia, sha256, tamano) {
  return { __blob_ref: referencia, __sha256: sha256, __size: tamano };
}

// Last-writer-wins por marca local; a igualdad gana el servidor (0 = empate).
// Las marcas son ISO-8601 con hora; la comparación lexicográfica equivale a la
// cronológica cuando ambas tienen el mismo formato (garantizado por el writer).
function compararLWW(marcaLocal, marcaServidor) {
  const a = marcaLocal || '';
  const b = marcaServidor || '';
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// Espejo JS de public.fila_sync_visible (supabase/migrations/001...).
// Contrato: lo que esta función niega, RLS lo niega. Pensada para prefiltrado
// en cliente y para tests sin red.
function filaVisibleParaSede({ tabla, data, recordId, sedeId, rol }) {
  if (rol === 'SUPERADMIN') return true;
  if (TABLAS_GLOBALES.includes(tabla)) return true;
  const sede = sedeId === null || sedeId === undefined ? null : String(sedeId);
  if (data && typeof data === 'object' && data.sede_id !== null && data.sede_id !== undefined) {
    return String(data.sede_id) === sede;
  }
  // Compatibilidad con filas globales viejas: sin sede_id y record 'global:...'.
  if (typeof recordId === 'string' && recordId.startsWith('global:')) return true;
  return false;
}

// Construye el sobre listo para upsert. `fila` ya debe venir sanitizada y con
// los blobs grandes reemplazados por descriptores (lo hace cada plataforma).
function construirSobre(tabla, fila, pk) {
  const recordId = construirRecordIdParaFila(tabla, fila, pk);
  return {
    table_name: tabla,
    record_id: recordId,
    data: sanitizarFila(fila),
    local_updated_at: extraerMarcaTemporal(fila, null)
  };
}

// SQLite (better-sqlite3 y expo-sqlite) no enlaza objetos: descriptores y JSON
// van como texto. Copia con valores objeto serializados.
function normalizarValoresFila(fila) {
  if (!fila || typeof fila !== 'object') return fila;
  const copia = { ...fila };
  for (const key of Object.keys(copia)) {
    const v = copia[key];
    if (v !== null && typeof v === 'object') {
      try {
        copia[key] = JSON.stringify(v);
      } catch {
        copia[key] = null;
      }
    }
  }
  return copia;
}

module.exports = {
  COLUMNAS_SENSIBLES,
  COLUMNAS_MARCA_TEMPORAL,
  sanitizarFila,
  extraerMarcaTemporal,
  debeExternalizar,
  rutaBlob,
  descriptorBlob,
  compararLWW,
  filaVisibleParaSede,
  construirSobre,
  normalizarValoresFila,
  // Re-exportados para consumidores de un solo módulo:
  TABLAS_GLOBALES,
  CAMPOS_BLOB,
  UMBRAL_BLOB_BASE64,
  esTablaGlobal,
  ambitoPara,
  construirRecordId,
  construirRecordIdParaFila,
  parsearRecordId,
  esDescriptorBlob
};
