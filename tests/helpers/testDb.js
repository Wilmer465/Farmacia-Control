const Database = require('better-sqlite3');
const { setTestDb, closeDb } = require('../../backend/database/connection');
const { runMigrations } = require('../../backend/database/migrate');
const { seed } = require('../../backend/database/seeds/seed');

function createTestDb() {
  // Base de datos en memoria para velocidad y aislamiento
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  setTestDb(db);
  runMigrations();
  seed();
  return db;
}

function teardownTestDb() {
  closeDb();
}

module.exports = { createTestDb, teardownTestDb };
