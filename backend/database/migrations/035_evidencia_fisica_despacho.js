// Evidencias confiables para la entrega física. Las columnas empiezan en 0:
// los booleanos históricos enviados por el renderer no son prueba de hardware.
module.exports = {
  name: '035_evidencia_fisica_despacho',
  up(db) {
    const cols = db.prepare('PRAGMA table_info(ordenes)').all().map((c) => c.name);
    if (!cols.includes('firma_wacom_verificada')) {
      db.exec('ALTER TABLE ordenes ADD COLUMN firma_wacom_verificada INTEGER NOT NULL DEFAULT 0;');
    }
    if (!cols.includes('huella_identidad_verificada')) {
      db.exec('ALTER TABLE ordenes ADD COLUMN huella_identidad_verificada INTEGER NOT NULL DEFAULT 0;');
    }
  }
};
