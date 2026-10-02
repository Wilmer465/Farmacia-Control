const crypto = require('crypto');
const bcrypt = require('bcryptjs');
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

// Los usuarios ELIMINADO quedan fuera del listado normal: la pantalla de gestión
// no debe ofrecer editar ni reactivar una cuenta ya anonimizada. Para auditar o
// reconstruir el histórico se pide `incluirEliminados`, que además expone cuándo se
// eliminó (eliminado_en) y por mano de quién (eliminado_por).
function listar({ incluirEliminados = false } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT u.id, u.nombre, u.username, u.rol_id, r.nombre AS rol_nombre,
           u.sede_id, s.nombre AS sede_nombre, u.estado, u.created_at,
           u.eliminado_en, u.eliminado_por,
           COALESCE(u.es_superadmin_principal, 0) AS es_superadmin_principal
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    LEFT JOIN sedes s ON s.id = u.sede_id
    ${incluirEliminados ? '' : "WHERE u.estado IS NULL OR u.estado != 'ELIMINADO'"}
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

// ELIMINACIÓN DEFINITIVA = ANONIMIZAR, NUNCA BORRAR.
//
// La fila se conserva porque `auditoria.usuario_id`, órdenes, despachos y
// aprobaciones la referencian; borrarla dejaría el histórico apuntando a la nada
// y, con `foreign_keys = ON`, sin poder repararse. Se sustituyen nombre,
// username y credencial por valores no utilizables y se marca ELIMINADO, que
// `authService.login` y `sessionService` rechazan: eso corta el acceso y destruye
// las sesiones vivas sin invalidación explícita.
//
// El username lleva `id` y epoch porque `usuarios.username` es UNIQUE y el
// original podría volver a asignarse a otra persona; un valor fijo tipo
// 'eliminado' colapsaría en la restricción del segundo eliminado.
// El hash es el bcrypt de un secreto aleatorio: la credencial original deja de
// ser válida aunque alguien la reintrodujera por otra vía, y ningún usuario
// puede deducirla desde la fila.
function eliminarDefinitivo(id, { usuarioId } = {}) {
  const db = getDb();
  const tx = db.transaction(() => {
    const actual = findById(id);
    if (!actual) throw new Error('USUARIO_NO_ENCONTRADO');
    // rol_id y sede_id se conservan a propósito: el histórico necesita saber qué rol
    // y desde qué sede actuaba la persona, y con estado=ELIMINADO no puede
    // autenticarse ni operar nada.
    const username = `eliminado_${id}_${Date.now()}`;
    // El hash debe SEGUIR SIENDO un hash bcrypt válido, no bytes aleatorios en
    // crudo: `authService.login` llama a `bcrypt.compareSync` contra este campo y
    // un valor con formato desconocido hace que la comparación lance en vez de
    // devolver false. Se hashea un secreto aleatorio, así que la credencial es
    // inservible y nadie puede recuperarla.
    const hash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);
    db.prepare(`
      UPDATE usuarios SET
        nombre = 'Usuario eliminado',
        username = @username,
        password_hash = @password_hash,
        estado = @estado,
        eliminado_en = datetime('now'),
        eliminado_por = @eliminado_por
      WHERE id = @id
    `).run({
      id,
      username,
      password_hash: hash,
      estado: 'ELIMINADO',
      eliminado_por: usuarioId ?? null
    });
    return findById(id);
  });
  return tx();
}

module.exports = {
  findByUsername,
  findById,
  listar,
  listarRoles,
  crear,
  actualizar,
  cambiarEstado,
  eliminarDefinitivo
};
