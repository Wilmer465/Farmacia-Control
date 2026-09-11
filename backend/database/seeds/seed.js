const bcrypt = require('bcryptjs');
const { getDb } = require('../connection');
const { runMigrations } = require('../migrate');
const { ROLES, ESTADOS_REGISTRO } = require('../../../shared/constants');

function seed() {
  runMigrations(); // garantiza que la estructura exista antes de sembrar

  const db = getDb();

  // 1. Roles
  const insertRol = db.prepare('INSERT OR IGNORE INTO roles (nombre, descripcion) VALUES (?, ?)');
  const rolesSeed = [
    [ROLES.SUPERADMIN, 'Control total del sistema, todas las sedes'],
    [ROLES.ADMIN, 'Responsable de una sede'],
    [ROLES.INVENTARIO, 'Gestión de inventario y despachos de su sede'],
    [ROLES.USUARIO, 'Solo consulta']
  ];
  const seedRoles = db.transaction(() => {
    for (const r of rolesSeed) insertRol.run(...r);
  });
  seedRoles();

  const rolSuperadmin = db.prepare('SELECT id FROM roles WHERE nombre = ?').get(ROLES.SUPERADMIN);
  const rolInventario = db.prepare('SELECT id FROM roles WHERE nombre = ?').get(ROLES.INVENTARIO);

  // 2. Sedes
  const insertSede = db.prepare(
    'INSERT OR IGNORE INTO sedes (id, nombre, ciudad, estado) VALUES (?, ?, ?, ?)'
  );
  insertSede.run(1, 'Sede Principal', 'Bogotá', ESTADOS_REGISTRO.ACTIVO);

  // Asegurar sedes Quibdó y Medellín
  let sedeQuibdo = db.prepare("SELECT * FROM sedes WHERE LOWER(ciudad) LIKE '%quibd%' OR LOWER(nombre) LIKE '%quibd%'").get();
  if (!sedeQuibdo) {
    const res = db.prepare("INSERT INTO sedes (nombre, ciudad, estado) VALUES ('Sede Quibdo', 'Quibdo', 'ACTIVO')").run();
    sedeQuibdo = db.prepare("SELECT * FROM sedes WHERE id = ?").get(res.lastInsertRowid);
  }

  let sedeMedellin = db.prepare("SELECT * FROM sedes WHERE LOWER(ciudad) LIKE '%medell%' OR LOWER(nombre) LIKE '%medell%'").get();
  if (!sedeMedellin) {
    const res = db.prepare("INSERT INTO sedes (nombre, ciudad, estado) VALUES ('Sede Medellin', 'Medellin', 'ACTIVO')").run();
    sedeMedellin = db.prepare("SELECT * FROM sedes WHERE id = ?").get(res.lastInsertRowid);
  }

  // 3. Usuario Superadmin
  const existeAdmin = db.prepare('SELECT id FROM usuarios WHERE LOWER(username) = ?').get('superadmin');
  if (!existeAdmin) {
    const hash = bcrypt.hashSync('Superadmin123*', 10);
    db.prepare(`
      INSERT INTO usuarios (nombre, username, password_hash, rol_id, sede_id, estado)
      VALUES (?, ?, ?, ?, NULL, ?)
    `).run('Administrador General', 'superadmin', hash, rolSuperadmin.id, ESTADOS_REGISTRO.ACTIVO);
  }

  // 4. Usuario Inventario Quibdó
  const hashQuibdo = bcrypt.hashSync('Quibdo123*', 10);
  const existeQuibdo = db.prepare('SELECT id FROM usuarios WHERE LOWER(username) = ?').get('inv_quibdo');
  if (!existeQuibdo) {
    db.prepare(`
      INSERT INTO usuarios (nombre, username, password_hash, rol_id, sede_id, estado)
      VALUES (?, ?, ?, ?, ?, 'ACTIVO')
    `).run('Inventario Quibdo', 'inv_quibdo', hashQuibdo, rolInventario.id, sedeQuibdo.id);
  } else {
    db.prepare(`
      UPDATE usuarios SET password_hash = ?, rol_id = ?, sede_id = ?, estado = 'ACTIVO'
      WHERE id = ?
    `).run(hashQuibdo, rolInventario.id, sedeQuibdo.id, existeQuibdo.id);
  }

  // 5. Usuario Inventario Medellín
  const hashMedellin = bcrypt.hashSync('Medellin123*', 10);
  const existeMedellin = db.prepare('SELECT id FROM usuarios WHERE LOWER(username) = ?').get('inv_medellin');
  if (!existeMedellin) {
    db.prepare(`
      INSERT INTO usuarios (nombre, username, password_hash, rol_id, sede_id, estado)
      VALUES (?, ?, ?, ?, ?, 'ACTIVO')
    `).run('Inventario Medellin', 'inv_medellin', hashMedellin, rolInventario.id, sedeMedellin.id);
  } else {
    db.prepare(`
      UPDATE usuarios SET password_hash = ?, rol_id = ?, sede_id = ?, estado = 'ACTIVO'
      WHERE id = ?
    `).run(hashMedellin, rolInventario.id, sedeMedellin.id, existeMedellin.id);
  }

  // 6. Lotes iniciales para Quibdó si no tiene
  const lotesQuibdo = db.prepare("SELECT COUNT(*) AS total FROM lotes WHERE sede_id = ?").get(sedeQuibdo.id);
  if (lotesQuibdo.total === 0) {
    const meds = db.prepare("SELECT id, codigo, nombre, unidades_por_caja FROM medicamentos LIMIT 3").all();
    if (meds.length > 0) {
      meds.forEach((m, idx) => {
        const cajas = 10 + idx * 5;
        const total = cajas * m.unidades_por_caja;
        const loteRes = db.prepare(`
          INSERT INTO lotes (medicamento_id, sede_id, numero_lote, fecha_expedicion, fecha_vencimiento, cantidad_cajas, cantidad_unidades_sueltas, cantidad_total_unidades)
          VALUES (?, ?, ?, '2026-01-10', '2028-12-31', ?, 0, ?)
        `).run(m.id, sedeQuibdo.id, `QBD-L00${idx + 1}`, cajas, total);

        db.prepare(`
          INSERT INTO movimientos_inventario (lote_id, medicamento_id, sede_id, tipo, cantidad, usuario_id)
          VALUES (?, ?, ?, 'ENTRADA', ?, (SELECT id FROM usuarios WHERE username = 'inv_quibdo'))
        `).run(loteRes.lastInsertRowid, m.id, sedeQuibdo.id, total);
      });
    }
  }

  console.log('[seed] Sedes, roles y usuarios de Quibdó y Medellín verificados y listos.');
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
