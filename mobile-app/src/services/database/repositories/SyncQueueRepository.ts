import { SyncQueueItem } from '../../../types/domain';
import { sqliteService } from '../SQLiteService';
import { SYNC_QUEUE_STATUS } from '../../../constants/syncStates';

export class SyncQueueRepository {
  protected db = sqliteService.getDatabase();
  protected tableName = 'sync_queue';

  async findPending(limit: number = 100): Promise<SyncQueueItem[]> {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE status = ? 
      ORDER BY created_at ASC 
      LIMIT ?
    `;
    return await this.db.getAllAsync(sql, [SYNC_QUEUE_STATUS.PENDING, limit]) as SyncQueueItem[];
  }

  async findByIdempotencyKey(key: string): Promise<SyncQueueItem | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE idempotency_key = ?`;
    return await this.db.getFirstAsync(sql, [key]) as SyncQueueItem | null;
  }

  async findByEntity(entity: string, entityId: number): Promise<SyncQueueItem | null> {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE entity = ? AND entity_id = ? AND status IN (?, ?)
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return await this.db.getFirstAsync(sql, [entity, entityId, SYNC_QUEUE_STATUS.PENDING, SYNC_QUEUE_STATUS.SYNCING]) as SyncQueueItem | null;
  }

  async add(item: Omit<SyncQueueItem, 'id' | 'created_at' | 'synced_at' | 'attempts' | 'status' | 'version'> & { 
    attempts?: number; 
    status?: string; 
    version?: number 
  }): Promise<number> {
    const sql = `
      INSERT INTO ${this.tableName} (
        local_id, remote_id, operation_type, entity, entity_id, payload, 
        user_id, sede_id, status, attempts, version, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.runAsync(sql, [
      item.local_id,
      item.remote_id || null,
      item.operation_type,
      item.entity,
      item.entity_id || null,
      item.payload,
      item.user_id,
      item.sede_id || null,
      item.status || SYNC_QUEUE_STATUS.PENDING,
      item.attempts || 0,
      item.version || 1,
      item.idempotency_key
    ]);
    
    const lastId = await this.db.getFirstAsync('SELECT last_insert_rowid() as id') as { id: number };
    return lastId.id;
  }

  async markSyncing(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    const sql = `UPDATE ${this.tableName} SET status = ? WHERE id IN (${placeholders})`;
    await this.db.runAsync(sql, [SYNC_QUEUE_STATUS.SYNCING, ...ids]);
  }

  async markSynced(id: number, remoteId: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName} 
      SET status = ?, synced_at = datetime('now'), remote_id = ? 
      WHERE id = ?
    `;
    await this.db.runAsync(sql, [SYNC_QUEUE_STATUS.SYNCED, remoteId, id]);
  }

  async markFailed(id: number, error: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName} 
      SET status = ?, last_error = ?, attempts = attempts + 1 
      WHERE id = ?
    `;
    await this.db.runAsync(sql, [SYNC_QUEUE_STATUS.FAILED, error, id]);
  }

  async markConflict(id: number, serverData: any): Promise<void> {
    const sql = `
      UPDATE ${this.tableName} 
      SET status = ?, last_error = ? 
      WHERE id = ?
    `;
    await this.db.runAsync(sql, [SYNC_QUEUE_STATUS.CONFLICT, JSON.stringify(serverData), id]);
  }

  async incrementAttempts(id: number): Promise<void> {
    const sql = `UPDATE ${this.tableName} SET attempts = attempts + 1 WHERE id = ?`;
    await this.db.runAsync(sql, [id]);
  }

  async getPendingCount(): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = ?`;
    const result = await this.db.getFirstAsync(sql, [SYNC_QUEUE_STATUS.PENDING]) as { count: number } | null;
    return result?.count || 0;
  }

  async getFailedCount(): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = ?`;
    const result = await this.db.getFirstAsync(sql, [SYNC_QUEUE_STATUS.FAILED]) as { count: number } | null;
    return result?.count || 0;
  }

  async getConflictCount(): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = ?`;
    const result = await this.db.getFirstAsync(sql, [SYNC_QUEUE_STATUS.CONFLICT]) as { count: number } | null;
    return result?.count || 0;
  }

  async cleanupOldSynced(olderThanDays: number = 30): Promise<number> {
    const sql = `
      DELETE FROM ${this.tableName} 
      WHERE status = ? AND synced_at < datetime('now', ?)
    `;
    await this.db.runAsync(sql, [SYNC_QUEUE_STATUS.SYNCED, `-${olderThanDays} days`]);
    return await this.db.getFirstAsync('SELECT changes() as count') as { count: number } | null;
  }

  async getStats(): Promise<{ pending: number; syncing: number; synced: number; failed: number; conflict: number }> {
    const sql = `
      SELECT status, COUNT(*) as count 
      FROM ${this.tableName} 
      GROUP BY status
    `;
    const results = await this.db.getAllAsync(sql) as { status: string; count: number }[];
    
    return {
      pending: results.find(r => r.status === SYNC_QUEUE_STATUS.PENDING)?.count || 0,
      syncing: results.find(r => r.status === SYNC_QUEUE_STATUS.SYNCING)?.count || 0,
      synced: results.find(r => r.status === SYNC_QUEUE_STATUS.SYNCED)?.count || 0,
      failed: results.find(r => r.status === SYNC_QUEUE_STATUS.FAILED)?.count || 0,
      conflict: results.find(r => r.status === SYNC_QUEUE_STATUS.CONFLICT)?.count || 0,
    };
  }
}

