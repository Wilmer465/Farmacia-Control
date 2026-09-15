// Migración 020: flag es_superadmin_principal para autorización de gestión de usuarios.
// Antes se verificaba `username === 'wilmer'` en código, lo cual es frágil.
// Con este flag la autorización sale de la BD (cargada server-side desde la sesión),
// nunca del objeto que mande el renderer.
const name = '020_superadmin_principal_flag';

function up(db) {
  const cols = db.prepare(`PRAGMA table_info("usuarios")`).all().map((c) => c.name);
  if (!cols.includes('es_superadmin_principal')) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN es_superadmin_principal INTEGER NOT NULL DEFAULT 0`);
  }
  // Marcar a Wilmer como principal (case-insensitive). No toca password_hash.
  db.prepare(`
    UPDATE usuarios SET es_superadmin_principal = 1
    WHERE LOWER(username) = LOWER('wilmer')
  `).run();
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usuarios_principal ON usuarios(es_superadmin_principal)`);
}

module.exports = { name, up };
