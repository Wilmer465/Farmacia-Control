import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import { DB_CONFIG } from '../../constants/config';
import { Migration } from '../../types/database';
export type { Migration } from '../../types/database';
import * as migrations from './migrations';

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

    this.db = openDatabaseSync(DB_CONFIG.name);
    
    await this.enableForeignKeys();
    await this.runMigrations();
    await this.createIndexes();
    
    console.log('[SQLiteService] Database initialized successfully');
  }

  private async enableForeignKeys(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.execAsync('PRAGMA foreign_keys = ON;');
    await this.db.execAsync('PRAGMA journal_mode = WAL;');
    await this.db.execAsync('PRAGMA synchronous = NORMAL;');
    await this.db.execAsync('PRAGMA cache_size = -2000;');
    await this.db.execAsync('PRAGMA temp_store = MEMORY;');
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const currentVersion = this.getUserVersion();
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

  private getUserVersion(): number {
    if (!this.db) return 0;
    const result = this.db.getFirstSync('PRAGMA user_version;') as { user_version: number };
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
    const result = await db.getFirstAsync("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();") as { size: number };
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
