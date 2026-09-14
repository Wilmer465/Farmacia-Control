// Migración 019: tabla de rate limiting para login
module.exports = {
  name: '019_rate_limiting',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rate_limit_login (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        intento_count INTEGER NOT NULL DEFAULT 1,
        primer_intento TEXT NOT NULL DEFAULT (datetime('now')),
        ultimo_intento TEXT NOT NULL DEFAULT (datetime('now')),
        bloqueado_hasta TEXT
      )
    `);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_username ON rate_limit_login(username);`);
  }
};