import { Migration } from '../SQLiteService';

export const migration012: Migration = {
  version: 12,
  name: '012_orden_documentacion',
  up: async (db: any) => {
    const colsResult = await db.getAllAsync("PRAGMA table_info(ordenes)");
    const cols = colsResult.map((c: any) => c.name);
    
    if (!cols.includes('receptor_nombre')) await db.execAsync("ALTER TABLE ordenes ADD COLUMN receptor_nombre TEXT;");
    if (!cols.includes('receptor_documento')) await db.execAsync("ALTER TABLE ordenes ADD COLUMN receptor_documento TEXT;");
    if (!cols.includes('receptor_telefono')) await db.execAsync("ALTER TABLE ordenes ADD COLUMN receptor_telefono TEXT;");
    if (!cols.includes('receptor_correo')) await db.execAsync("ALTER TABLE ordenes ADD COLUMN receptor_correo TEXT;");
    if (!cols.includes('firma_data')) await db.execAsync("ALTER TABLE ordenes ADD COLUMN firma_data TEXT;");
    if (!cols.includes('huella_registrada')) await db.execAsync("ALTER TABLE ordenes ADD COLUMN huella_registrada INTEGER NOT NULL DEFAULT 0;");
    if (!cols.includes('documento_adjunto_nombre')) await db.execAsync("ALTER TABLE ordenes ADD COLUMN documento_adjunto_nombre TEXT;");
    if (!cols.includes('documento_adjunto_data')) await db.execAsync("ALTER TABLE ordenes ADD COLUMN documento_adjunto_data TEXT;");
    if (!cols.includes('documento_adjunto_tipo')) await db.execAsync("ALTER TABLE ordenes ADD COLUMN documento_adjunto_tipo TEXT;");
    if (!cols.includes('documentacion_completa')) await db.execAsync("ALTER TABLE ordenes ADD COLUMN documentacion_completa INTEGER NOT NULL DEFAULT 0;");
    if (!cols.includes('elementos_faltantes')) await db.execAsync("ALTER TABLE ordenes ADD COLUMN elementos_faltantes TEXT;");

    await db.execAsync("UPDATE ordenes SET estado = 'PENDIENTE' WHERE estado = 'CONFIRMADA';");
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_ordenes_documentacion ON ordenes(documentacion_completa);");
  },
};

