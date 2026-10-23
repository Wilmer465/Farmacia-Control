// Transporte Supabase directo para el sync offline-first (Fase 1).
//
// La cola (pending/syncing/synced/failed/conflict) sigue viviendo en SQLite
// local y la gestiona SyncEngine. Este proveedor solo habla con la nube:
//   push  = SyncQueue pendiente -> sobres sync_records (+ blobs a Storage)
//   pull  = sync_records -> ServerChange[] para aplicar en orden FK
//
// Seguridad: anon + authenticated con RLS por sede. JAMÁS service_role en el
// móvil. Sin EXPO_PUBLIC_SUPABASE_* todo sigue en local (habilitado()=false).
// Sin conexión (expo-network) no se intenta nada: la cola espera.
import * as Network from 'expo-network';
import * as Crypto from 'expo-crypto';
import { SUPABASE_CONFIG, supabaseHabilitado } from '../../constants/config';
import { SecureStorage } from '../storage/SecureStorage';
import { esDescriptorBlob } from '../../constants/syncEnvelope';
import {
  sanitizarFila,
  extraerMarcaTemporal,
  debeExternalizar,
  rutaBlob,
  descriptorBlob,
  compararLWW,
  construirSobre,
} from '../../utils/syncPayload';
import type { SyncQueueItem } from '../../types/domain';
import type { PushResult, PullResult, ServerChange } from '../../types/sync';

export const SB_KEYS = Object.freeze({
  ACCESS: 'sb_access_token',
  REFRESH: 'sb_refresh_token',
  EXPIRY: 'sb_expiry',
});

interface SesionSb {
  access: string;
  refresh: string | null;
  expiry: number;
}

type FetchImpl = typeof fetch;

function idFilaDe(item: SyncQueueItem): string {
  return String(item.entity_id ?? item.local_id ?? item.id);
}

export class SupabaseSyncProvider {
  private fetchImpl: FetchImpl;

  constructor(fetchImpl?: FetchImpl) {
    this.fetchImpl = fetchImpl || fetch;
  }

  habilitado(): boolean {
    return supabaseHabilitado();
  }

  async hayConexion(): Promise<boolean> {
    try {
      const estado = await Network.getNetworkStateAsync();
      return Boolean(estado.isConnected) && estado.isInternetReachable !== false;
    } catch {
      return false;
    }
  }

  async leerSesion(): Promise<SesionSb | null> {
    const [access, refresh, expiry] = await Promise.all([
      SecureStorage.getItem(SB_KEYS.ACCESS),
      SecureStorage.getItem(SB_KEYS.REFRESH),
      SecureStorage.getItem(SB_KEYS.EXPIRY),
    ]);
    if (!access) return null;
    return { access, refresh, expiry: parseInt(expiry || '0', 10) || 0 };
  }

  // Token válido o renovado. Lanza si no hay sesión (el llamador cae a la cola).
  async asegurarToken(): Promise<string> {
    const sesion = await this.leerSesion();
    if (!sesion) throw new Error('Sin sesión Supabase.');
    if (Date.now() < sesion.expiry - 60 * 1000) return sesion.access;
    if (!sesion.refresh) throw new Error('Sesión Supabase expirada.');
    const res = await this.fetchImpl(
      `${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_CONFIG.anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: sesion.refresh }),
      }
    );
    if (!res.ok) throw new Error('No se pudo renovar la sesión Supabase.');
    const datos = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    const expiry = Date.now() + datos.expires_in * 1000;
    await Promise.all([
      SecureStorage.setItem(SB_KEYS.ACCESS, datos.access_token),
      datos.refresh_token
        ? SecureStorage.setItem(SB_KEYS.REFRESH, datos.refresh_token)
        : Promise.resolve(),
      SecureStorage.setItem(SB_KEYS.EXPIRY, String(expiry)),
    ]);
    return datos.access_token;
  }

  private async rest(path: string, token: string, opciones: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(`${SUPABASE_CONFIG.url}/rest/v1/${path}`, {
      ...opciones,
      headers: {
        apikey: SUPABASE_CONFIG.anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...((opciones.headers as Record<string, string>) || {}),
      },
    });
  }

  // Sube un lote de la cola. Devuelve PushResult compatible con SyncEngine
  // (claves snake_case en runtime + camelCase del tipo).
  async subirLote(items: SyncQueueItem[]): Promise<PushResult> {
    const resultados: Array<Record<string, unknown>> = [];
    if (items.length === 0) {
      return { results: [], syncedCount: 0, failedCount: 0, conflictCount: 0 };
    }
    let token: string;
    try {
      token = await this.asegurarToken();
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Sin sesión Supabase.';
      for (const item of items) {
        resultados.push(this.resultado(item, 'error', mensaje));
      }
      return this.empaquetar(resultados);
    }

    const sobres: Array<Record<string, unknown>> = [];
    const dueños = new Map<number, SyncQueueItem>();
    for (const item of items) {
      let fila: Record<string, unknown>;
      try {
        fila = typeof item.payload === 'string' ? JSON.parse(item.payload) : { ...(item.payload as object) };
      } catch {
        resultados.push(this.resultado(item, 'error', 'Payload local ilegible.'));
        continue;
      }
      // El id local viaja aparte: el sobre usa record_id namespaced.
      const filaSync = { ...fila, id: idFilaDe(item) };
      try {
        await this.externalizarBlobs(item, filaSync, token);
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : 'Fallo subiendo adjunto.';
        resultados.push(this.resultado(item, 'error', mensaje));
        continue;
      }
      const sobre = construirSobre(item.entity as string, filaSync, 'id');
      // Marca temporal del cambio: la de la fila, o la del encolado.
      sobre.local_updated_at = extraerMarcaTemporal(
        filaSync,
        (item as { created_at?: string }).created_at || new Date().toISOString()
      );
      sobres.push(sobre as unknown as Record<string, unknown>);
      dueños.set(sobres.length - 1, item);
    }

    const TAMANO_LOTE = 100;
    for (let i = 0; i < sobres.length; i += TAMANO_LOTE) {
      const trozo = sobres.slice(i, i + TAMANO_LOTE);
      const itemsTrozo = trozo.map((_, k) => dueños.get(i + k) as SyncQueueItem);
      try {
        await this.upsertSobres(trozo, token);
        for (const item of itemsTrozo) {
          resultados.push(this.resultado(item, 'synced'));
        }
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : 'Fallo de red.';
        for (const item of itemsTrozo) {
          resultados.push(this.resultado(item, 'error', mensaje));
        }
      }
    }
    return this.empaquetar(resultados);
  }

  private resultado(item: SyncQueueItem, estado: string, error?: string): Record<string, unknown> {
    const recordId = this.recordIdDe(item);
    return {
      idempotencyKey: item.idempotency_key,
      idempotency_key: item.idempotency_key,
      status: estado,
      remoteId: undefined,
      remote_id: recordId,
      error,
    };
  }

  private empaquetar(resultados: Array<Record<string, unknown>>): PushResult {
    return {
      results: resultados as unknown as PushResult['results'],
      syncedCount: resultados.filter((r) => r.status === 'synced').length,
      failedCount: resultados.filter((r) => r.status === 'error').length,
      conflictCount: resultados.filter((r) => r.status === 'conflict').length,
    };
  }

  private recordIdDe(item: SyncQueueItem): string {
    const sede =
      item.sede_id === null || item.sede_id === undefined ? 'global' : String(item.sede_id);
    return `${sede}:${item.entity}:${idFilaDe(item)}`;
  }

  private async upsertSobres(
    sobres: Array<Record<string, unknown>>,
    token: string
  ): Promise<void> {
    const enviar = async (tk: string): Promise<Response> =>
      this.rest('sync_records', tk, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(sobres),
      });
    let res = await enviar(token);
    if (res.status === 401) {
      // Token vencido entre asegurarToken y el upsert: un reintento con renovación.
      const nuevo = await this.asegurarTokenForzado();
      res = await enviar(nuevo);
    }
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      throw new Error(`Supabase ${res.status}: ${detalle || res.statusText}`);
    }
  }

  private async asegurarTokenForzado(): Promise<string> {
    // Fuerza renovación ignorando un access aún vigente pero rechazado.
    const refresh = await SecureStorage.getItem(SB_KEYS.REFRESH);
    if (!refresh) throw new Error('Sesión Supabase expirada.');
    const res = await this.fetchImpl(
      `${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_CONFIG.anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refresh }),
      }
    );
    if (!res.ok) throw new Error('No se pudo renovar la sesión Supabase.');
    const datos = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    const expiry = Date.now() + datos.expires_in * 1000;
    await Promise.all([
      SecureStorage.setItem(SB_KEYS.ACCESS, datos.access_token),
      datos.refresh_token
        ? SecureStorage.setItem(SB_KEYS.REFRESH, datos.refresh_token)
        : Promise.resolve(),
      SecureStorage.setItem(SB_KEYS.EXPIRY, String(expiry)),
    ]);
    return datos.access_token;
  }

  // Saca del sobre los blobs grandes a Storage (como texto base64, con hash).
  // Mutación in-place de `fila`: campo -> descriptor {__blob_ref, __sha256, __size}.
  private async externalizarBlobs(
    item: SyncQueueItem,
    fila: Record<string, unknown>,
    token: string
  ): Promise<void> {
    const { CAMPOS_BLOB } = await import('../../utils/syncPayload');
    const ambito =
      item.sede_id === null || item.sede_id === undefined ? 'global' : String(item.sede_id);
    const recordId = this.recordIdDe(item);
    for (const campo of CAMPOS_BLOB as readonly string[]) {
      const valor = fila[campo];
      if (!debeExternalizar(campo, valor)) continue;
      const texto = valor as string;
      const sha = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        texto
      );
      const ref = rutaBlob(ambito, item.entity as string, recordId, campo);
      const res = await this.fetchImpl(
        `${SUPABASE_CONFIG.url}/storage/v1/object/blobs/${ref}`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_CONFIG.anonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
            'x-upsert': 'true',
          },
          body: texto,
        }
      );
      if (!res.ok) {
        const detalle = await res.text().catch(() => '');
        throw new Error(`Adjunto ${campo}: Supabase ${res.status} ${detalle}`);
      }
      fila[campo] = descriptorBlob(ref, sha, texto.length);
    }
  }

  // Baja incremental. RLS ya filtra por sede; `tablas` es prefiltrado cliente.
  async bajar(
    tablas: string[],
    cursor: string | null,
    limite: number
  ): Promise<PullResult> {
    const token = await this.asegurarToken();
    const cambios: ServerChange[] = [];
    let offset = 0;
    let maxCursor = cursor;
    let hayMas = true;
    const filtroTiempo = cursor ? `&synced_at=gte.${encodeURIComponent(cursor)}` : '';
    while (hayMas) {
      const res = await this.rest(
        `sync_records?select=table_name,record_id,data,local_updated_at,synced_at` +
          `&order=synced_at.asc&limit=${limite}&offset=${offset}${filtroTiempo}`,
        token,
        { method: 'GET' }
      );
      if (!res.ok) {
        const detalle = await res.text().catch(() => '');
        throw new Error(`Supabase ${res.status}: ${detalle || res.statusText}`);
      }
      const filas = (await res.json()) as Array<{
        table_name: string;
        record_id: string;
        data: Record<string, unknown>;
        local_updated_at: string;
        synced_at: string;
      }>;
      for (const f of filas) {
        if (tablas.length > 0 && !tablas.includes(f.table_name)) continue;
        cambios.push({
          entity: f.table_name as ServerChange['entity'],
          operation: 'UPDATE',
          data: sanitizarFila(f.data || {}),
          server_timestamp: f.synced_at,
        });
        if (!maxCursor || f.synced_at > maxCursor) maxCursor = f.synced_at;
      }
      hayMas = filas.length === limite;
      // Seguridad: RLS + prefiltrado pueden devolver menos filas útiles que el
      // límite; se pagina igual hasta una página corta.
      if (filas.length < limite) hayMas = false;
      else offset += limite;
    }
    return { changes: cambios, cursor: maxCursor || cursor || '', hasMore: false };
  }

  // Descarga y verifica un blob por descriptor (bajo demanda, no en el pull).
  async descargarBlob(descriptor: {
    __blob_ref: string;
    __sha256: string;
  }): Promise<string> {
    const token = await this.asegurarToken();
    const res = await this.fetchImpl(
      `${SUPABASE_CONFIG.url}/storage/v1/object/blobs/${descriptor.__blob_ref}`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_CONFIG.anonKey,
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!res.ok) throw new Error(`Adjunto no disponible (${res.status}).`);
    const texto = await res.text();
    const sha = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, texto);
    if (sha !== descriptor.__sha256) throw new Error('Adjunto corrupto (hash).');
    return texto;
  }

  // ¿Este valor es descriptor? (para la UI al abrir detalles/documentos).
  esDescriptor(valor: unknown): boolean {
    return esDescriptorBlob(valor);
  }

  // LWW para convergencia en el pull: 'aplicar' o 'conflicto'.
  // `pendienteTs` = marca del cambio local aún no subido (null = no hay).
  resolverAplicacion(
    marcaServidor: string,
    pendienteTs: string | null
  ): 'aplicar' | 'conflicto' {
    if (!pendienteTs) return 'aplicar';
    return compararLWW(pendienteTs, marcaServidor) < 0 ? 'conflicto' : 'aplicar';
  }
}

export const supabaseSyncProvider = new SupabaseSyncProvider();
