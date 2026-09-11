const { getDb } = require('../database/connection');

function findAll() {
  const db = getDb();
  return db.prepare('SELECT id, nombre, ciudad FROM sedes ORDER BY nombre').all();
}

function findById(id) {
  const db = getDb();
  return db.prepare('SELECT id, nombre, ciudad FROM sedes WHERE id = ?').get(id);
}

module.exports = { findAll, findById };
