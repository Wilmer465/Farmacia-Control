// Espejo móvil de shared/syncEnvelope.js (Fase 0 offline-first).
// MANTENER SINCRONIZADO con el módulo desktop: RLS, push y pull dependen
// de que los valores y el formato de record_id coincidan.

export const TABLAS_GLOBALES: readonly string[] = Object.freeze([
  'roles',
  'sedes',
  'catalogo_cum',
  'catalogo_empaques',
  'catalogo_actualizaciones',
]);

export const CAMPOS_BLOB: readonly string[] = Object.freeze([
  'firma_data',
  'documento_adjunto_data',
]);

// Umbral en caracteres base64 (~64 KB). Por encima se externaliza a Storage.
export const UMBRAL_BLOB_BASE64 = 65536;

export function esTablaGlobal(tabla: string): boolean {
  return (TABLAS_GLOBALES as readonly string[]).includes(tabla);
}

export function ambitoPara(tabla: string, fila: Record<string, unknown>): string {
  if (esTablaGlobal(tabla)) return 'global';
  const sede = (fila as { sede_id?: unknown } | null)?.sede_id;
  if (sede === null || sede === undefined) return 'global';
  return String(sede);
}

export function construirRecordId(ambito: string | number, tabla: string, id: string | number): string {
  return `${ambito}:${tabla}:${id}`;
}

export function construirRecordIdParaFila(
  tabla: string,
  fila: Record<string, unknown>,
  pk: string
): string {
  return construirRecordId(ambitoPara(tabla, fila), tabla, String(fila[pk]));
}

export interface RecordIdParseado {
  ambito: string;
  tabla: string;
  id: string;
}

export function parsearRecordId(recordId: string): RecordIdParseado | null {
  if (typeof recordId !== 'string') return null;
  const partes = recordId.split(':');
  if (partes.length !== 3 || !partes[0] || !partes[1] || !partes[2]) return null;
  return { ambito: partes[0], tabla: partes[1], id: partes[2] };
}

export function esDescriptorBlob(valor: unknown): boolean {
  if (!valor || typeof valor !== 'object') return false;
  const v = valor as Record<string, unknown>;
  return (
    typeof v.__blob_ref === 'string' &&
    typeof v.__sha256 === 'string' &&
    typeof v.__size === 'number'
  );
}
