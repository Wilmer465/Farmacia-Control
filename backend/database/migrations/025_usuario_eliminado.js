// Migración 025: rastro de la eliminación definitiva de un usuario.
//
// La fila de `usuarios` NUNCA se borra: `auditoria.usuario_id`, órdenes,
// despachos y aprobaciones la referencian y deben seguir siendo legibles. La
// eliminación anonimiza nombre, username y credencial, y deja en estas columnas
// cuándo y por mano de quién se hizo, que es lo que hoy no quedaba registrado en
// ningún sitio al pasar una cuenta a INACTIVO.
module.exports = {
  name: '025_usuario_eliminado',
  up(db) {
    const cols = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);

    if (!cols.includes('eliminado_en')) {
      db.exec('ALTER TABLE usuarios ADD COLUMN eliminado_en TEXT');
    }
    if (!cols.includes('eliminado_por')) {
      db.exec('ALTER TABLE usuarios ADD COLUMN eliminado_por INTEGER');
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_usuarios_eliminado
        ON usuarios(estado, eliminado_en)
    `);
  },
  down(db) {
    db.exec('DROP INDEX IF EXISTS idx_usuarios_eliminado');
    const cols = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);
    for (const col of ['eliminado_en', 'eliminado_por']) {
      if (cols.includes(col)) db.exec(`ALTER TABLE usuarios DROP COLUMN ${col}`);
    }
  }
};
