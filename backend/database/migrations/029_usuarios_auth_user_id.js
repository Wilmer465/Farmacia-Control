// Migración 029: enlace con Supabase Auth nativo (Fase 0 offline-first).
//
// `auth_user_id` guarda el UUID del usuario en `auth.users` de Supabase,
// provisionado por `scripts/provisionar-auth.js` con la service_role.
// Es NULL hasta el provisionamiento y UNIQUE para el enlace 1:1.
// No toca password_hash: el login local con bcrypt sigue intacto y el hash
// nunca se sincroniza (ver cloudSyncService.sanitizarFila).
module.exports = {
  name: '029_usuarios_auth_user_id',
  up(db) {
    const cols = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);
    if (!cols.includes('auth_user_id')) {
      db.exec('ALTER TABLE usuarios ADD COLUMN auth_user_id TEXT;');
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_auth_user_id ON usuarios(auth_user_id);');
  },
  down(db) {
    db.exec('DROP INDEX IF EXISTS idx_usuarios_auth_user_id;');
    const cols = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);
    if (cols.includes('auth_user_id')) {
      db.exec('ALTER TABLE usuarios DROP COLUMN auth_user_id;');
    }
  }
};
