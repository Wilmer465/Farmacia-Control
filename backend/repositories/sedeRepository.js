const { getDb } = require('../database/connection');

function findAll() {
  const db = getDb();
  return db.prepare('SELECT id, nombre, ciudad, estado FROM sedes ORDER BY nombre').all();
}

function findById(id) {
  const db = getDb();
  return db.prepare('SELECT id, nombre, ciudad, estado FROM sedes WHERE id = ?').get(id);
}

function contarReferencias(id) {
  const db = getDb();
  const sedeId = Number(id);
  const tablas = [
    ['usuarios', 'sede_id'],
    ['lotes', 'sede_id'],
    ['ordenes', 'sede_id'],
    ['despachos', 'sede_id'],
    ['entregas', 'sede_id'],
    ['movimientos_inventario', 'sede_id'],
    ['solicitudes_eliminacion', 'sede_id'],
    ['solicitudes_intercambio', 'sede_origen_id'],
    ['solicitudes_intercambio', 'sede_destino_id'],
    ['clientes_facturacion', 'sede_id'],
    ['facturas', 'sede_id'],
    ['pagos_factura', 'sede_id'],
    ['facturacion_config', 'sede_id'],
    ['auditoria', 'sede_id']
  ];
  const refs = [];
  for (const [tabla, col] of tablas) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${col} = ?`).get(sedeId);
      if (row && Number(row.n) > 0) refs.push({ tabla, cantidad: Number(row.n) });
    } catch {
      // tabla/columna inexistente en esquemas parciales de test: ignorar
    }
  }
  return refs;
}

function eliminar(id) {
  const db = getDb();
  const res = db.prepare('DELETE FROM sedes WHERE id = ?').run(Number(id));
  return res.changes > 0;
}

// Creación de sedes. Solo el superadministrador principal puede alta de sedes:
// es la única operación que cambia la lista del selector global del SUPERADMIN,
// así que el control de acceso centralizado en sedeService lo protege.
function crear({ nombre, ciudad }) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO sedes (nombre, ciudad, estado) VALUES (?, ?, ?)'
  );
  const res = stmt.run(
    (nombre || '').trim(),
    (ciudad || '').trim() || null,
    'ACTIVO'
  );
  return findById(res.lastInsertRowid);
}

module.exports = { findAll, findById, crear, contarReferencias, eliminar };
