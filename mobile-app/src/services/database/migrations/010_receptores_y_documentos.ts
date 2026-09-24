import { Migration } from '../SQLiteService';

export const migration010: Migration = {
  version: 10,
  name: '010_receptores_y_documentos',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS receptores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        documento TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        telefono TEXT,
        correo_electronico TEXT,
        firma_guardada TEXT,
        huella_guardada INTEGER NOT NULL DEFAULT 0,
        documento_adjunto_nombre TEXT,
        documento_adjunto_data TEXT,
        documento_adjunto_tipo TEXT,
        prioridad TEXT NOT NULL DEFAULT 'MEDIA',
        medicamentos_uso TEXT,
        notas TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_receptores_documento ON receptores(documento);
      CREATE INDEX IF NOT EXISTS idx_receptores_nombre ON receptores(nombre);
      CREATE INDEX IF NOT EXISTS idx_receptores_correo ON receptores(correo_electronico);
      CREATE INDEX IF NOT EXISTS idx_receptores_prioridad ON receptores(prioridad);
    `);

    const cols = db.prepare("PRAGMA table_info(entregas)").all().map((c: any) => c.name);
    if (!cols.includes('documento_adjunto_nombre')) {
      await db.execAsync(`ALTER TABLE entregas ADD COLUMN documento_adjunto_nombre TEXT;`);
    }
    if (!cols.includes('documento_adjunto_data')) {
      await db.execAsync(`ALTER TABLE entregas ADD COLUMN documento_adjunto_data TEXT;`);
    }
    if (!cols.includes('documento_adjunto_tipo')) {
      await db.execAsync(`ALTER TABLE entregas ADD COLUMN documento_adjunto_tipo TEXT;`);
    }
  },
};

