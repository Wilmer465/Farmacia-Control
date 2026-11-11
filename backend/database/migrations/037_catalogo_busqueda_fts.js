// Índice de texto derivado del catálogo. La tabla sanitaria sigue siendo la
// fuente de verdad; FTS se puede reconstruir con su comando rebuild.
module.exports = {
  name: '037_catalogo_busqueda_fts',
  up(db) {
    try {
      db.exec(`
      CREATE VIRTUAL TABLE catalogo_cum_fts USING fts5(
        producto, descripcioncomercial, principio_activo, fabricante,
        laboratorio, concentracion, forma_farmaceutica, registro_sanitario,
        content='catalogo_cum', content_rowid='id',
        tokenize='trigram remove_diacritics 1'
      );
      CREATE TRIGGER catalogo_cum_fts_insert AFTER INSERT ON catalogo_cum BEGIN
        INSERT INTO catalogo_cum_fts(rowid, producto, descripcioncomercial, principio_activo, fabricante, laboratorio, concentracion, forma_farmaceutica, registro_sanitario)
        VALUES (new.id, new.producto, new.descripcioncomercial, new.principio_activo, new.fabricante, new.laboratorio, new.concentracion, new.forma_farmaceutica, new.registro_sanitario);
      END;
      CREATE TRIGGER catalogo_cum_fts_delete AFTER DELETE ON catalogo_cum BEGIN
        INSERT INTO catalogo_cum_fts(catalogo_cum_fts, rowid, producto, descripcioncomercial, principio_activo, fabricante, laboratorio, concentracion, forma_farmaceutica, registro_sanitario)
        VALUES ('delete', old.id, old.producto, old.descripcioncomercial, old.principio_activo, old.fabricante, old.laboratorio, old.concentracion, old.forma_farmaceutica, old.registro_sanitario);
      END;
      CREATE TRIGGER catalogo_cum_fts_update AFTER UPDATE OF
        producto, descripcioncomercial, principio_activo, fabricante, laboratorio,
        concentracion, forma_farmaceutica, registro_sanitario ON catalogo_cum BEGIN
        INSERT INTO catalogo_cum_fts(catalogo_cum_fts, rowid, producto, descripcioncomercial, principio_activo, fabricante, laboratorio, concentracion, forma_farmaceutica, registro_sanitario)
        VALUES ('delete', old.id, old.producto, old.descripcioncomercial, old.principio_activo, old.fabricante, old.laboratorio, old.concentracion, old.forma_farmaceutica, old.registro_sanitario);
        INSERT INTO catalogo_cum_fts(rowid, producto, descripcioncomercial, principio_activo, fabricante, laboratorio, concentracion, forma_farmaceutica, registro_sanitario)
        VALUES (new.id, new.producto, new.descripcioncomercial, new.principio_activo, new.fabricante, new.laboratorio, new.concentracion, new.forma_farmaceutica, new.registro_sanitario);
      END;
      INSERT INTO catalogo_cum_fts(catalogo_cum_fts) VALUES ('rebuild');
      `);
    } catch (error) {
      // Algunas compilaciones SQLite de terceros no incluyen FTS5. La
      // migración se considera aplicada y el servicio usa su fallback LIKE;
      // un índice opcional no debe impedir abrir una instalación existente.
      if (/fts5|no such module/i.test(error.message)) {
        console.warn('[migrate] FTS5 no disponible; se conserva búsqueda LIKE.');
        return;
      }
      throw error;
    }
  },
  down(db) {
    db.exec(`
      DROP TRIGGER IF EXISTS catalogo_cum_fts_insert;
      DROP TRIGGER IF EXISTS catalogo_cum_fts_delete;
      DROP TRIGGER IF EXISTS catalogo_cum_fts_update;
      DROP TABLE IF EXISTS catalogo_cum_fts;
    `);
  }
};
