// Migración 027: impedir stock total negativo a nivel de BD.
// `lotes` solo tenía CHECK en cajas/sueltas (002), así que un total negativo
// podía colarse por UPDATE directo (intercambios concurrentes, ajustes).
// SQLite no permite ADD CHECK por ALTER, así que se usan triggers.
module.exports = {
  name: '027_lotes_total_no_negativo',
  up(db) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_lotes_total_no_negativo_insert
      BEFORE INSERT ON lotes
      FOR EACH ROW
      WHEN NEW.cantidad_total_unidades < 0
      BEGIN
        SELECT RAISE(ABORT, 'STOCK_NEGATIVO: el stock total no puede ser negativo.');
      END;
      CREATE TRIGGER IF NOT EXISTS trg_lotes_total_no_negativo_update
      BEFORE UPDATE OF cantidad_total_unidades ON lotes
      FOR EACH ROW
      WHEN NEW.cantidad_total_unidades < 0
      BEGIN
        SELECT RAISE(ABORT, 'STOCK_NEGATIVO: el stock total no puede ser negativo.');
      END;
    `);
  },
  down(db) {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_lotes_total_no_negativo_insert;
      DROP TRIGGER IF EXISTS trg_lotes_total_no_negativo_update;
    `);
  }
};
