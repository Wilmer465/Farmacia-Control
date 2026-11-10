const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const sedeService = require('../../backend/services/sedeService');
const auditoriaRepository = require('../../backend/repositories/auditoriaRepository');
const usuarioRepository = require('../../backend/repositories/usuarioRepository');

describe('Unit Tests: Gestión y Creación de Sedes', () => {
  let db;
  let sesionWilmer;
  let sesionAdmin;

  beforeEach(() => {
    db = createTestDb();
    const wilmer = usuarioRepository.findByUsername('wilmer');
    sesionWilmer = {
      id: wilmer.id,
      nombre: wilmer.nombre,
      username: wilmer.username,
      rol_nombre: 'SUPERADMIN',
      es_superadmin_principal: 1,
      sede_id: null
    };

    sesionAdmin = {
      id: 999,
      nombre: 'Administrador Sede',
      username: 'admin_sede',
      rol_nombre: 'ADMIN',
      es_superadmin_principal: 0,
      sede_id: 1
    };
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('sedeService.listar devuelve las sedes existentes', () => {
    const sedes = sedeService.listar();
    assert.ok(Array.isArray(sedes));
    assert.ok(sedes.length > 0);
  });

  test('Superadmin puede crear una nueva sede y se registra en auditoría', () => {
    const nueva = sedeService.crear(sesionWilmer, {
      nombre: 'Sede Cartagena',
      ciudad: 'Cartagena'
    });

    assert.ok(nueva.id);
    assert.equal(nueva.nombre, 'Sede Cartagena');
    assert.equal(nueva.ciudad, 'Cartagena');

    const enDb = db.prepare('SELECT * FROM sedes WHERE id = ?').get(nueva.id);
    assert.equal(enDb.nombre, 'Sede Cartagena');
    assert.equal(enDb.ciudad, 'Cartagena');
    assert.equal(enDb.estado, 'ACTIVO');

    const eventos = auditoriaRepository.findAll({ modulo: 'SEDES' });
    const evento = eventos.find((e) => e.registro_afectado === `sede:${nueva.id}`);
    assert.ok(evento);
    assert.equal(evento.accion, 'CREAR_SEDE');
    assert.equal(evento.resultado, 'EXITO');
  });

  test('Rechaza creación con nombre vacío o solo espacios', () => {
    assert.throws(
      () => sedeService.crear(sesionWilmer, { nombre: '   ', ciudad: 'Bogotá' }),
      /El nombre de la sede es obligatorio/
    );
  });

  test('Rechaza creación con nombre duplicado (sin importar mayúsculas)', () => {
    sedeService.crear(sesionWilmer, { nombre: 'Sede Bucaramanga', ciudad: 'Bucaramanga' });

    assert.throws(
      () => sedeService.crear(sesionWilmer, { nombre: 'sede bucaramanga', ciudad: 'Otra' }),
      /Ya existe una sede con el nombre 'sede bucaramanga'/
    );
  });

  test('Rechaza creación si el usuario no es SUPERADMIN', () => {
    assert.throws(
      () => sedeService.crear(sesionAdmin, { nombre: 'Sede Pereira' }),
      /solo el Superadministrador puede crear sedes/
    );
  });

  test('Rechaza creación sin sesión', () => {
    assert.throws(
      () => sedeService.crear(null, { nombre: 'Sede Neiva' }),
      /Sesión requerida/
    );
  });

  test('Superadmin puede eliminar una sede sin registros asociados y se audita', () => {
    const creada = sedeService.crear(sesionWilmer, { nombre: 'Sede Temporal', ciudad: 'Temp' });
    const res = sedeService.eliminar(sesionWilmer, creada.id);

    assert.equal(res.id, creada.id);
    assert.equal(res.nombre, 'Sede Temporal');

    const enDb = db.prepare('SELECT * FROM sedes WHERE id = ?').get(creada.id);
    assert.equal(enDb, undefined);

    const eventos = auditoriaRepository.findAll({ modulo: 'SEDES' });
    const evento = eventos.find((e) => e.accion === 'ELIMINAR_SEDE' && e.registro_afectado === `sede:${creada.id}`);
    assert.ok(evento);
    assert.equal(evento.resultado, 'EXITO');
  });

  test('Rechaza eliminar sede con registros asociados', () => {
    // El seed de test crea sedes/usuarios/lotes de prueba (p. ej. Quibdo); asegurar ref.
    const creada = sedeService.crear(sesionWilmer, { nombre: 'Sede Con Datos', ciudad: 'Test' });
    db.prepare('INSERT INTO usuarios (nombre, username, password_hash, rol_id, sede_id, estado) VALUES (?, ?, ?, ?, ?, ?)').run(
      'Ref Test', `ref_sede_${Date.now()}`, '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', 4, creada.id, 'ACTIVO'
    );
    assert.throws(
      () => sedeService.eliminar(sesionWilmer, creada.id),
      /No se puede eliminar la sede .* registros asociados/
    );
  });

  test('Rechaza eliminar sede inexistente', () => {
    assert.throws(
      () => sedeService.eliminar(sesionWilmer, 999999),
      /Sede no encontrada/
    );
  });

  test('Rechaza eliminación si el usuario no es SUPERADMIN', () => {
    assert.throws(
      () => sedeService.eliminar(sesionAdmin, 1),
      /solo el Superadministrador puede crear sedes/
    );
  });
});
