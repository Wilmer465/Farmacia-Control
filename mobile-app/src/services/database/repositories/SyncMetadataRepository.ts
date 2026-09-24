import { sqliteService } from '../SQLiteService';

export class SyncMetadataRepository {
  protected db = sqliteService.getDatabase();
  protected tableName = 'sync_metadata';

  async get(key: string): Promise<string | null> {
    const sql = `SELECT value FROM ${this.tableName} WHERE key = ?`;
    const result = await this.db.getFirstAsync(sql, [key]) as { value: string } | null;
    return result?.value || null;
  }

  async set(key: string, value: string): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO ${this.tableName} (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `;
    await this.db.runAsync(sql, [key, value]);
  }

  async getAll(): Promise<{ key: string; value: string; updated_at: string }[]> {
    const sql = `SELECT key, value, updated_at FROM ${this.tableName}`;
    return await this.db.getAllAsync(sql) as { key: string; value: string; updated_at: string }[];
  }

  async getLastPullTimestamp(): Promise<string | null> {
    return this.get('last_pull_timestamp');
  }

  async setLastPullTimestamp(timestamp: string): Promise<void> {
    return this.set('last_pull_timestamp', timestamp);
  }

  async getLastPushTimestamp(): Promise<string | null> {
    return this.get('last_push_timestamp');
  }

  async setLastPushTimestamp(timestamp: string): Promise<void> {
    return this.set('last_push_timestamp', timestamp);
  }

  async getSchemaVersion(): Promise<number> {
    const value = await this.get('schema_version');
    return value ? parseInt(value, 10) : 0;
  }

  async setSchemaVersion(version: number): Promise<void> {
    return this.set('schema_version', version.toString());
  }

  async getDeviceId(): Promise<string | null> {
    return this.get('device_id');
  }

  async setDeviceId(deviceId: string): Promise<void> {
    return this.set('device_id', deviceId);
  }
}

