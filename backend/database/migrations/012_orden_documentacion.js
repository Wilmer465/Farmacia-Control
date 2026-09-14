// Migración 012: la documentación de quien recibe se captura al GENERAR la orden
// (no al despachar). Las órdenes nacen directamente en estado PENDIENTE
// (sin flujo de confirmación previo).
module.exports = {
  name: '012_orden_documentacion',
  up(db) {
    const cols = db.prepare("PRAGMA table_info(ordenes)").all().map(c => c.name);

    if (!cols.includes('receptor_nombre')) db.exec("ALTER TABLE ordenes ADD COLUMN receptor_nombre TEXT;");
    if (!cols.includes('receptor_documento')) db.exec("ALTER TABLE ordenes ADD COLUMN receptor_documento TEXT;");
    if (!cols.includes('receptor_telefono')) db.exec("ALTER TABLE ordenes ADD COLUMN receptor_telefono TEXT;");
    if (!cols.includes('receptor_correo')) db.exec("ALTER TABLE ordenes ADD COLUMN receptor_correo TEXT;");
    if (!cols.includes('firma_data')) db.exec("ALTER TABLE ordenes ADD COLUMN firma_data TEXT;");
    if (!cols.includes('huella_registrada')) db.exec("ALTER TABLE ordenes ADD COLUMN huella_registrada INTEGER NOT NULL DEFAULT 0;");
    if (!cols.includes('documento_adjunto_nombre')) db.exec("ALTER TABLE ordenes ADD COLUMN documento_adjunto_nombre TEXT;");
    if (!cols.includes('documento_adjunto_data')) db.exec("ALTER TABLE ordenes ADD COLUMN documento_adjunto_data TEXT;");
    if (!cols.includes('documento_adjunto_tipo')) db.exec("ALTER TABLE ordenes ADD COLUMN documento_adjunto_tipo TEXT;");
    if (!cols.includes('documentacion_completa')) db.exec("ALTER TABLE ordenes ADD COLUMN documentacion_completa INTEGER NOT NULL DEFAULT 0;");
    if (!cols.includes('elementos_faltantes')) db.exec("ALTER TABLE ordenes ADD COLUMN elementos_faltantes TEXT;");

    // Las órdenes nacen en estado PENDIENTE (sin flujo de confirmación previo).
    db.exec("UPDATE ordenes SET estado = 'PENDIENTE' WHERE estado = 'CONFIRMADA';");

    db.exec("CREATE INDEX IF NOT EXISTS idx_ordenes_documentacion ON ordenes(documentacion_completa);");
  }
};