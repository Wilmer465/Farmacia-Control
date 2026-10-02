// Migración 023: flag debe_restablecer_contrasena en usuarios.
//
// Un usuario creado en la sede A y propagado a la sede B llega por cloudSync SIN
// password_hash: `sanitizarFila` (cloudSyncService.js:15) lo excluye por diseño
// y `bajar()` antes descartaba la fila con `continue` (:200-203), con lo que el
// usuario sencillamente no existía en la otra sede.
//
// La estrategia adoptada es propagar el usuario SIN credencial y marcarlo para
// restablecimiento forzado. Este flag es el estado que hace explícita esa
// condición: 0 = credencial vigente (valor por defecto, nunca cambia a un
// usuario sano), 1 = debe establecer una nueva.
//
// `password_hash` sigue siendo NOT NULL en el esquema, así que quien inserte la
// fila desde la nube debe generar una credencial aleatoria inservible en lugar
// de dejar el campo vacío.
module.exports = {
  name: '023_debe_restablecer_contrasena',
  up(db) {
    const cols = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);

    if (!cols.includes('debe_restablecer_contrasena')) {
      db.exec(
        'ALTER TABLE usuarios ADD COLUMN debe_restablecer_contrasena INTEGER NOT NULL DEFAULT 0'
      );
    }

    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_usuarios_restablecer ON usuarios(debe_restablecer_contrasena)'
    );
  },
  down(db) {
    db.exec('DROP INDEX IF EXISTS idx_usuarios_restablecer');
    db.exec('ALTER TABLE usuarios DROP COLUMN debe_restablecer_contrasena');
  }
};