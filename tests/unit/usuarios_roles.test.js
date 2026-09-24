const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const usuarioService = require('../../backend/services/usuarioService');
const auditoriaRepository = require('../../backend/repositories/auditoriaRepository');
const usuarioRepository = require('../../backend/repositories/usuarioRepository');

describe('FASE 3 — Unit Tests: Gestión de Usuarios, Roles y Permisos Principales', () => {
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

    const admin = usuarioRepository.findByUsername('superadmin');
    sesionAdmin = {
      id: admin.id,
      nombre: admin.nombre,
      username: admin.username,
      rol_nombre: 'SUPERADMIN',
      es_superadmin_principal: 0,
      sede_id: null
    };
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('Superadmin Wilmer puede listar usuarios y roles', () => {
    const usuarios = usuarioService.listar(sesionWilmer);
    assert.ok(Array.isArray(usuarios));
    assert.ok(usuarios.length >= 3);

    const roles = usuarioService.listarRoles(sesionWilmer);
    assert.ok(Array.isArray(roles));
    assert.equal(roles.length, 4);
  });

  test('Superadmin sin flag de principal es rechazado al gestionar usuarios', () => {
    assert.throws(
      () => usuarioService.listar(sesionAdmin),
      /Acceso denegado: solo el superadministrador principal/
    );
  });

  test('Creación de usuario nuevo audita con acción CREAR_USUARIO (verificación de corrección)', () => {
    const roles = usuarioService.listarRoles(sesionWilmer);
    const rolUsuario = roles.find(r => r.nombre === 'USUARIO');

    const nuevo = usuarioService.crear(sesionWilmer, {
      nombre: 'Carlos Tester',
      username: 'carlos_test',
      password: 'Password123*',
      rol_id: rolUsuario.id,
      sede_id: 1
    });

    assert.ok(nuevo);
    assert.equal(nuevo.username, 'carlos_test');
    assert.equal(nuevo.password_hash, undefined);

    // Verificar en BD que el registro de auditoría sea CREAR_USUARIO y NO CREAR_LOTE
    const eventos = auditoriaRepository.findAll({ modulo: 'USUARIOS' });
    const eventoCreacion = eventos.find(e => e.registro_afectado === 'carlos_test');
    assert.ok(eventoCreacion, 'Debe existir registro de auditoría');
    assert.equal(eventoCreacion.accion, 'CREAR_USUARIO', 'La acción debe ser CREAR_USUARIO y no CREAR_LOTE');
  });

  test('Imposibilidad de desactivar o degradar la cuenta principal de Wilmer', () => {
    const roles = usuarioService.listarRoles(sesionWilmer);
    const rolAdmin = roles.find(r => r.nombre === 'ADMIN');

    // Intento de desactivar
    assert.throws(
      () => usuarioService.actualizar(sesionWilmer, sesionWilmer.id, {
        nombre: 'Wilmer',
        rol_id: 1,
        estado: 'INACTIVO'
      }),
      /No puedes desactivar tu propia cuenta principal/
    );

    // Intento de cambiar rol
    assert.throws(
      () => usuarioService.actualizar(sesionWilmer, sesionWilmer.id, {
        nombre: 'Wilmer',
        rol_id: rolAdmin.id,
        estado: 'ACTIVO'
      }),
      /No puedes cambiar tu propio rol de Superadministrador/
    );
  });

  test('Activación y desactivación de cuentas estándar', () => {
    const quibdo = usuarioRepository.findByUsername('inv_quibdo');
    const desactivado = usuarioService.cambiarEstado(sesionWilmer, quibdo.id, 'INACTIVO');
    assert.equal(desactivado.estado, 'INACTIVO');

    const activado = usuarioService.cambiarEstado(sesionWilmer, quibdo.id, 'ACTIVO');
    assert.equal(activado.estado, 'ACTIVO');
  });
});
