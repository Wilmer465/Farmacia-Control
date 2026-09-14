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

function listar() {
  const db = getDb();
  return db.prepare(`
    SELECT u.id, u.nombre, u.username, u.rol_id, r.nombre AS rol_nombre,
           u.sede_id, s.nombre AS sede_nombre, u.estado, u.created_at
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    LEFT JOIN sedes s ON s.id = u.sede_id
    ORDER BY u.id ASC
  `).all();
}

function listarRoles() {
  const db = getDb();
  return db.prepare('SELECT id, nombre, descripcion FROM roles ORDER BY id ASC').all();
}

function crear({ nombre, username, password_hash, rol_id, sede_id, estado = 'ACTIVO' }) {
  const db = getDb();
  const res = db.prepare(`
    INSERT INTO usuarios (nombre, username, password_hash, rol_id, sede_id, estado)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(nombre, username, password_hash, rol_id, sede_id ?? null, estado);
  return findById(res.lastInsertRowid);
}

function actualizar(id, { nombre, rol_id, sede_id, estado, password_hash }) {
  const db = getDb();
  if (password_hash) {
    db.prepare(`
      UPDATE usuarios
      SET nombre = ?, rol_id = ?, sede_id = ?, estado = ?, password_hash = ?
      WHERE id = ?
    `).run(nombre, rol_id, sede_id ?? null, estado, password_hash, id);
  } else {
    db.prepare(`
      UPDATE usuarios
      SET nombre = ?, rol_id = ?, sede_id = ?, estado = ?
      WHERE id = ?
    `).run(nombre, rol_id, sede_id ?? null, estado, id);
  }
  return findById(id);
}

function cambiarEstado(id, estado) {
  const db = getDb();
  db.prepare('UPDATE usuarios SET estado = ? WHERE id = ?').run(estado, id);
  return findById(id);
}

module.exports = {
  findByUsername,
  findById,
  listar,
  listarRoles,
  crear,
  actualizar,
  cambiarEstado
};
