// Convención del sobre sync_records (Fase 0 offline-first).
//
// Fuente de verdad compartida entre desktop (este módulo, CommonJS) y móvil
// (espejo en mobile-app/src/constants/syncEnvelope.ts). Si se cambia un valor
// aquí, cambiarlo allá: RLS, push y pull dependen de que coincidan.
//
// * record_id namespaced para evitar colisiones entre sedes con IDs locales
//   autoincrementales: 'global:<tabla>:<id>' o '<sede_id>:<tabla>:<id>'.
// * Tablas globales: legibles por todo authenticated en RLS.
// * Blobs: campos que superando UMBRAL_BLOB_BASE64 no viajan inline en `data`
//   sino a storage.blobs '<sede>/<tabla>/<record_id>/<campo>' con descriptor
//   {__blob_ref, __sha256, __size}. La huella es solo flag, no blob.
const TABLAS_GLOBALES = Object.freeze([
  'roles',
  'sedes',
  'catalogo_cum',
  'catalogo_empaques',
  'catalogo_actualizaciones'
]);

const CAMPOS_BLOB = Object.freeze(['firma_data', 'documento_adjunto_data']);

// Umbral en caracteres base64 (~64 KB). Por encima se externaliza a Storage.
const UMBRAL_BLOB_BASE64 = 65536;

function esTablaGlobal(tabla) {
  return TABLAS_GLOBALES.includes(tabla);
}

// Ambito del sobre: 'global' o el sede_id como texto. Las filas globales
// (catálogos, roles, sedes) no llevan sede aunque la tabla tenga la columna.
function ambitoPara(tabla, fila) {
  if (esTablaGlobal(tabla)) return 'global';
  const sede = fila && fila.sede_id !== null && fila.sede_id !== undefined
    ? String(fila.sede_id)
    : null;
  return sede || 'global';
}

function construirRecordId({ ambito, tabla, id }) {
  const a = ambito === null || ambito === undefined ? 'global' : String(ambito);
  return `${a}:${tabla}:${id}`;
}

function construirRecordIdParaFila(tabla, fila, pk) {
  return construirRecordId({ ambito: ambitoPara(tabla, fila), tabla, id: String(fila[pk]) });
}

// 'sede:tabla:id' -> { ambito, tabla, id }. Devuelve null si no cumple el formato.
function parsearRecordId(recordId) {
  if (typeof recordId !== 'string') return null;
  const partes = recordId.split(':');
  if (partes.length !== 3 || !partes[0] || !partes[1] || !partes[2]) return null;
  return { ambito: partes[0], tabla: partes[1], id: partes[2] };
}

function esDescriptorBlob(valor) {
  return Boolean(valor && typeof valor === 'object'
    && typeof valor.__blob_ref === 'string'
    && typeof valor.__sha256 === 'string'
    && typeof valor.__size === 'number');
}

module.exports = {
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
