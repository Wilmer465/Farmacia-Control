// Espejo móvil de shared/syncPayload.js (Fase 1-3 offline-first).
// MANTENER SINCRONIZADO con el módulo desktop.
import {
  TABLAS_GLOBALES,
  CAMPOS_BLOB,
  UMBRAL_BLOB_BASE64,
  esTablaGlobal,
  ambitoPara,
  construirRecordId,
  construirRecordIdParaFila,
  parsearRecordId,
  esDescriptorBlob,
} from '../constants/syncEnvelope';

export {
  TABLAS_GLOBALES,
  CAMPOS_BLOB,
  UMBRAL_BLOB_BASE64,
  esTablaGlobal,
  ambitoPara,
  construirRecordId,
  construirRecordIdParaFila,
  parsearRecordId,
  esDescriptorBlob,
};

export const COLUMNAS_SENSIBLES: ReadonlySet<string> = new Set([
  'password_hash',
  'password',
  'token',
  'secret',
]);

export const COLUMNAS_MARCA_TEMPORAL: readonly string[] = Object.freeze([
  'updated_at',
  'fecha_actualizacion',
  'actualizado_en',
  'fecha',
  'created_at',
  'creado_en',
  'fecha_solicitud',
  'fecha_creacion',
  'fecha_importacion',
  'fecha_resolucion',
]);

export function sanitizarFila<T extends Record<string, unknown>>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  let limpia: Record<string, unknown> | null = null;
  for (const key of Object.keys(row)) {
    if (COLUMNAS_SENSIBLES.has(key.toLowerCase())) {
      if (!limpia) limpia = { ...(row as Record<string, unknown>) };
      delete limpia[key];
    }
  }
  return ((limpia || row) as unknown) as T;
}

export function extraerMarcaTemporal(
  fila: Record<string, unknown> | null | undefined,
  alternativa?: string | null
): string {
  if (fila && typeof fila === 'object') {
    for (const col of COLUMNAS_MARCA_TEMPORAL) {
      const v = fila[col];
      if (v) return String(v);
    }
  }
  return alternativa || new Date().toISOString();
}

export function debeExternalizar(
  campo: string,
  valor: unknown,
  umbral: number = UMBRAL_BLOB_BASE64
): boolean {
  if (!(CAMPOS_BLOB as readonly string[]).includes(campo)) return false;
  if (typeof valor !== 'string' || valor.length <= umbral) return false;
  try {
    if (esDescriptorBlob(JSON.parse(valor))) return false;
  } catch {
    // no es JSON: binario pendiente de subir
  }
  return true;
}

export function rutaBlob(
  ambito: string | number,
  tabla: string,
  recordId: string,
  campo: string
): string {
  return `${ambito}/${tabla}/${recordId}/${campo}`;
}

export interface DescriptorBlob {
  __blob_ref: string;
  __sha256: string;
  __size: number;
}

export function descriptorBlob(
  referencia: string,
  sha256: string,
  tamano: number
): DescriptorBlob {
  return { __blob_ref: referencia, __sha256: sha256, __size: tamano };
}

// -1 local más viejo, 0 empate (gana servidor), 1 local más nuevo.
export function compararLWW(
  marcaLocal: string | null | undefined,
  marcaServidor: string | null | undefined
): -1 | 0 | 1 {
  const a = marcaLocal || '';
  const b = marcaServidor || '';
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export interface Visibilidad {
  tabla: string;
  data: Record<string, unknown> | null | undefined;
  recordId?: string | null;
  sedeId: string | number | null | undefined;
  rol?: string | null;
}

export function filaVisibleParaSede({
  tabla,
  data,
  recordId,
  sedeId,
  rol,
}: Visibilidad): boolean {
  if (rol === 'SUPERADMIN') return true;
  if ((TABLAS_GLOBALES as readonly string[]).includes(tabla)) return true;
  const sede = sedeId === null || sedeId === undefined ? null : String(sedeId);
  if (data && typeof data === 'object' && data.sede_id !== null && data.sede_id !== undefined) {
    return String(data.sede_id) === sede;
  }
  if (typeof recordId === 'string' && recordId.startsWith('global:')) return true;
  return false;
}

export interface SobreSync {
  table_name: string;
  record_id: string;
  data: Record<string, unknown>;
  local_updated_at: string;
}

export function construirSobre(
  tabla: string,
  fila: Record<string, unknown>,
  pk: string
): SobreSync {
  return {
    table_name: tabla,
    record_id: construirRecordIdParaFila(tabla, fila, pk),
    data: sanitizarFila(fila),
    local_updated_at: extraerMarcaTemporal(fila, null),
  };
}

// SQLite no enlaza objetos: descriptores y JSON van como texto.
export function normalizarValoresFila<T extends Record<string, unknown>>(fila: T): T {
  if (!fila || typeof fila !== 'object') return fila;
  const copia: Record<string, unknown> = { ...(fila as Record<string, unknown>) };
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
  return copia as unknown as T;
}
