import { openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { DB_CONFIG } from '../../constants/config';
import { Migration } from '../../types/database';
export type { Migration } from '../../types/database';
import * as migrations from './migrations';

// En web, expo-sqlite monta un VFS de OPFS en el directorio `expo-sqlite`. Ese
// VFS reparte un numero FIJO de ficheros entre todas las bases de la app y la
// capacidad se deriva de lo que ya hay en el directorio, no de una constante:
// los ficheros que deja una carga interrumpida (journal, -wal, -shm) siguen
// consumiendo ranuras en la siguiente carga y abren la base con
// "cannot create file" / sqlite3_open_v2.
const VFS_DIR_WEB = 'expo-sqlite';
const VFS_HEADER_PATH_SIZE = 512;

function decodificarRutaSqlite(header: Uint8Array): string {
  const fin = header.indexOf(0);
  return fin > 0 ? new TextDecoder().decode(header.subarray(0, fin)) : '';
}

// lib.dom.d.ts de TypeScript 5.5 no declara la iteracion asincrona de
// FileSystemDirectoryHandle (entries/keys/values), que si implementan los
// navegadores. Se tipa solo la parte que se usa.
type DirectoryHandleEnumerable = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

export class SQLiteService {
  private db: SQLiteDatabase | null = null;
  private static instance: SQLiteService;

  private constructor() {}

  static getInstance(): SQLiteService {
    if (!SQLiteService.instance) {
      SQLiteService.instance = new SQLiteService();
    }
    return SQLiteService.instance;
  }

  async initialize(): Promise<void> {
    if (this.db) return;

    let purgaBloqueada = false;
    if (Platform.OS === 'web') {
      purgaBloqueada = (await this.limpiarOpfsResiduo()) > 0;
    }

    try {
      this.db = await openDatabaseAsync(DB_CONFIG.name);
    } catch (error) {
      if (Platform.OS !== 'web') throw error;
      const causa = (error as Error)?.message || String(error);
      const pista = purgaBloqueada
        ? 'El almacenamiento de la pestana anterior sigue bloqueando los ficheros. ' +
          'Haz una recarga forzada (Ctrl+Shift+R) para cerrar el worker de SQLite.'
        : 'Vuelve a cargar la pagina para reintentar la limpieza.';
      throw new Error(
        `No se pudo abrir la base de datos en web (${causa}). ${pista} ` +
        'Si persiste, borra el almacenamiento del sitio ' +
        '(DevTools > Application > Clear site data).'
      );
    }

    await this.enableForeignKeys();
    await this.runMigrations();
    await this.createIndexes();
    
    console.log('[SQLiteService] Database initialized successfully');
  }

  // Debe ejecutarse ANTES del primer openDatabaseAsync: en ese momento el worker
  // todavia no ha creado el VFS, asi que ningun fichero tiene un access handle
  // abierto y se pueden eliminar. Se conserva solo el fichero de la base actual.
  // Devuelve cuantos residuos NO se pudieron borrar por estar bloqueados.
  private async limpiarOpfsResiduo(): Promise<number> {
    let bloqueados = 0;

    try {
      if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
        console.warn('[SQLiteService] OPFS no disponible; se omite la limpieza del VFS.');
        return 0;
      }

      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle(VFS_DIR_WEB, { create: true });

      const conservar: string[] = [];
      const aBorrar: string[] = [];

      for await (const [name, handle] of (dir as DirectoryHandleEnumerable).entries()) {
        if (handle.kind !== 'file') continue;
        try {
          const archivo = await (handle as FileSystemFileHandle).getFile();
          if (archivo.size === 0) continue; // ranura libre recien creada
          const header = new Uint8Array(
            await archivo.slice(0, VFS_HEADER_PATH_SIZE).arrayBuffer()
          );
          const ruta = decodificarRutaSqlite(header);
          if (!ruta) continue; // ranura sin asociar: se conserva como hueco libre
          const base = ruta.split('/').pop() || '';
          if (base === DB_CONFIG.name) conservar.push(name);
          else aBorrar.push(name);
        } catch (error) {
          console.warn(`[SQLiteService] No se pudo inspeccionar el fichero OPFS "${name}":`, error);
        }
      }

      let purgados = 0;
      for (const name of aBorrar) {
        try {
          await dir.removeEntry(name);
          purgados += 1;
        } catch (error) {
          bloqueados += 1;
          console.warn(
            `[SQLiteService] No se pudo borrar el residuo OPFS "${name}" ` +
            '(lo tiene bloqueado el worker de la carga anterior):', error
          );
        }
      }

      if (purgados > 0 || bloqueados > 0) {
        console.log(
          `[SQLiteService] Web: VFS depurado -> ${purgados} residuo(s) eliminado(s), ` +
          `${bloqueados} bloqueado(s), ${conservar.length} base conservada.`
        );
      }
    } catch (error) {
      // La limpieza es preventiva: si falla, el open sigue su curso.
      console.warn('[SQLiteService] No se pudo limpiar el directorio OPFS del VFS:', error);
    }

    return bloqueados;
  }

  private async enableForeignKeys(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.execAsync('PRAGMA foreign_keys = ON;');
    // WAL multiplica los ficheros en OPFS (-wal y -shm) sobre un pool de capacidad
    // fija. En web el navegador siempre esta en linea y no hay concurrencia que
    // justificar WAL, asi que se usa el journal por defecto.
    if (Platform.OS !== 'web') {
      await this.db.execAsync('PRAGMA journal_mode = WAL;');
    }
    await this.db.execAsync('PRAGMA synchronous = NORMAL;');
    await this.db.execAsync('PRAGMA cache_size = -2000;');
    await this.db.execAsync('PRAGMA temp_store = MEMORY;');
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const currentVersion = await this.getUserVersion();
    const sortedMigrations = Object.values(migrations).sort((a, b) => a.version - b.version);

    for (const migration of sortedMigrations) {
      if (migration.version > currentVersion) {
        console.log(`[SQLiteService] Running migration ${migration.version}: ${migration.name}`);
        await migration.up(this.db);
        await this.setUserVersion(migration.version);
        console.log(`[SQLiteService] Migration ${migration.version} completed`);
      }
    }
  }

  private async getUserVersion(): Promise<number> {
    if (!this.db) return 0;
    const result = await this.db.getFirstAsync('PRAGMA user_version;') as { user_version: number } | null;
    return result?.user_version || 0;
  }

  private async setUserVersion(version: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.execAsync(`PRAGMA user_version = ${version};`);
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_lotes_medicamento_sede ON lotes(medicamento_id, sede_id);',
      'CREATE INDEX IF NOT EXISTS idx_lotes_vencimiento ON lotes(fecha_vencimiento);',
      'CREATE INDEX IF NOT EXISTS idx_lotes_numero ON lotes(numero_lote);',
      'CREATE INDEX IF NOT EXISTS idx_movimientos_lote ON movimientos_inventario(lote_id);',
      'CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos_inventario(fecha);',
      'CREATE INDEX IF NOT EXISTS idx_movimientos_sede ON movimientos_inventario(sede_id);',
      'CREATE INDEX IF NOT EXISTS idx_ordenes_sede_estado ON ordenes(sede_id, estado);',
      'CREATE INDEX IF NOT EXISTS idx_ordenes_fecha ON ordenes(fecha_creacion);',
      'CREATE INDEX IF NOT EXISTS idx_despachos_orden ON despachos(orden_id);',
      'CREATE INDEX IF NOT EXISTS idx_despachos_sede ON despachos(sede_id);',
      'CREATE INDEX IF NOT EXISTS idx_entregas_orden ON entregas(orden_id);',
      'CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);',
      'CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity, entity_id);',
      'CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_sync_queue_idempotency ON sync_queue(idempotency_key);',
      'CREATE INDEX IF NOT EXISTS idx_notificaciones_fecha ON notificaciones_locales(fecha);',
      'CREATE INDEX IF NOT EXISTS idx_mensajes_fecha ON mensajes_locales(fecha);',
      'CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha);',
      'CREATE INDEX IF NOT EXISTS idx_dispositivos_usuario ON dispositivos(usuario_id);',
    ];

    for (const indexSql of indexes) {
      try {
        await this.db.execAsync(indexSql);
      } catch (error) {
        console.warn('[SQLiteService] Index creation warning:', error);
      }
    }
  }

  getDatabase(): SQLiteDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  // Transaction helper
  async transaction<T>(callback: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
    if (!this.db) throw new Error('Database not initialized');
    
    let result: T | undefined;
    await this.db.withTransactionAsync(async () => {
      result = await callback(this.db!);
    });
    return result!;
  }

  // Raw query helpers
  async execute(sql: string, params: any[] = []): Promise<void> {
    const db = this.getDatabase();
    await db.runAsync(sql, params);
  }

  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    const db = this.getDatabase();
    return await db.getAllAsync(sql, params) as T[];
  }

  async queryFirst<T>(sql: string, params: any[] = []): Promise<T | null> {
    const db = this.getDatabase();
    return await db.getFirstAsync(sql, params) as T | null;
  }

  async count(sql: string, params: any[] = []): Promise<number> {
    const result = await this.queryFirst<{ count: number }>(sql, params);
    return result?.count || 0;
  }

  // Batch operations
  async executeBatch(statements: string[]): Promise<void> {
    const db = this.getDatabase();
    await db.withTransactionAsync(async () => {
      for (const sql of statements) {
        await db.execAsync(sql);
      }
    });
  }

  async vacuum(): Promise<void> {
    const db = this.getDatabase();
    await db.execAsync('VACUUM;');
  }

  async getDatabaseSize(): Promise<number> {
    const db = this.getDatabase();
    const result = await db.getFirstAsync("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();") as { size: number } | null;
    return result?.size || 0;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.db) return false;
      const result = await this.db.getFirstAsync('SELECT 1 as ok;') as { ok: number } | null;
      return result?.ok === 1;
    } catch {
      return false;
    }
  }
}

export const sqliteService = SQLiteService.getInstance();
export default sqliteService;
