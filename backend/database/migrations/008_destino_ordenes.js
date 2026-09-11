// Migración 008: Soporte para salidas/órdenes a otros municipios o veredas exentas de firma y huella.
module.exports = {
  name: '008_destino_ordenes',
  up(db) {
    // Añadir columnas a ordenes si no existen
    try {
      db.exec(`
        ALTER TABLE ordenes ADD COLUMN tipo_destino TEXT NOT NULL DEFAULT 'LOCAL';
        ALTER TABLE ordenes ADD COLUMN destino_detalle TEXT;
      `);
    } catch (e) {
      // Columnas ya creadas
    }

    try {
      db.exec(`
        ALTER TABLE entregas ADD COLUMN tipo_destino TEXT NOT NULL DEFAULT 'LOCAL';
        ALTER TABLE entregas ADD COLUMN destino_detalle TEXT;
      `);
    } catch (e) {
      // Columnas ya creadas
    }
  }
};
