// Migracion 011: Agregar correo_electronico a receptores y telefono si faltara
module.exports = {
  name: '011_receptor_correo_y_telefono',
  up(db) {
    const cols = db.prepare("PRAGMA table_info(receptores)").all().map(c => c.name);
    if (!cols.includes('telefono')) {
      db.exec("ALTER TABLE receptores ADD COLUMN telefono TEXT;");
    }
    if (!cols.includes('correo_electronico')) {
      db.exec("ALTER TABLE receptores ADD COLUMN correo_electronico TEXT;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_receptores_correo ON receptores(correo_electronico);");
  }
};
