const { getDb } = require('../database/connection');

function findByUsername(username) {
  const db = getDb();
  if (!username) return null;
  return db.prepare(`
    SELECT u.*, r.nombre AS rol_nombre, s.nombre AS sede_nombre
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    LEFT JOIN sedes s ON s.id = u.sede_id
    WHERE LOWER(u.username) = LOWER(TRIM(?))
  `).get(username);
}

function findById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT u.*, r.nombre AS rol_nombre, s.nombre AS sede_nombre
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    LEFT JOIN sedes s ON s.id = u.sede_id
    WHERE u.id = ?
  `).get(id);
}

module.exports = { findByUsername, findById };
