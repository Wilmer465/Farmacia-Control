const { getDb } = require('../database/connection');

function findAll() {
  const db = getDb();
  return db.prepare('SELECT * FROM medicamentos ORDER BY nombre').all();
}

function findById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM medicamentos WHERE id = ?').get(id);
}

function findByCodigo(codigo) {
  const db = getDb();
  return db.prepare('SELECT * FROM medicamentos WHERE codigo = ?').get(codigo);
}

function create(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO medicamentos
      (codigo, nombre, principio_activo, presentacion, concentracion, laboratorio, unidad_medida, unidades_por_caja, estado)
    VALUES (@codigo, @nombre, @principio_activo, @presentacion, @concentracion, @laboratorio, @unidad_medida, @unidades_por_caja, @estado)
  `);
  const info = stmt.run(data);
  return findById(info.lastInsertRowid);
}

function update(id, data) {
  const db = getDb();
  db.prepare(`
    UPDATE medicamentos SET
      nombre = @nombre,
      principio_activo = @principio_activo,
      presentacion = @presentacion,
      concentracion = @concentracion,
      laboratorio = @laboratorio,
      unidad_medida = @unidad_medida,
      unidades_por_caja = @unidades_por_caja,
      estado = @estado
    WHERE id = @id
  `).run({ ...data, id });
  return findById(id);
}

module.exports = { findAll, findById, findByCodigo, create, update };
