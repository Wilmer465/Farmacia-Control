import { Migration } from '../SQLiteService';

export const migration023: Migration = {
  version: 23,
  name: '023_mobile_sync_queue',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id TEXT NOT NULL UNIQUE,
        remote_id TEXT,
        operation_type TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id INTEGER,
        payload TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        sede_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        idempotency_key TEXT NOT NULL UNIQUE
      );

      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity, entity_id);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue(user_id);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_idempotency ON sync_queue(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);

      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
  down: async (db: any) => {
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_sync_queue_created;
      DROP INDEX IF EXISTS idx_sync_queue_idempotency;
      DROP INDEX IF EXISTS idx_sync_queue_user;
      DROP INDEX IF EXISTS idx_sync_queue_entity;
      DROP INDEX IF EXISTS idx_sync_queue_status;
      DROP TABLE IF EXISTS sync_queue;
      DROP TABLE IF EXISTS sync_metadata;
    `);
  },
};

