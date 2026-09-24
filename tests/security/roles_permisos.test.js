const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const medicamentoService = require('../../backend/services/medicamentoService');
const loteService = require('../../backend/services/loteService');
const ordenService = require('../../backend/services/ordenService');
const despachoService = require('../../backend/services/despachoService');
const catalogoCumController = require('../../backend/controllers/catalogoCumController');
const receptorController = require('../../backend/controllers/receptorController');
const cloudSyncService = require('../../backend/services/cloudSyncService');
const usuarioService = require('../../backend/services/usuarioService');

describe('FASE 7 — Roles y Seguridad: Verificación Estricta en Capa Backend/Servicios', () => {
  let db;
  let sesionSuperadmin;
  let sesionAdminSede1;
  let sesionInventarioSede1;
  let sesionUsuarioSede1;

  beforeEach(() => {
    db = createTestDb();

    sesionSuperadmin = {
      id: 1,
      nombre: 'Superadmin',
      username: 'wilmer',
      rol_nombre: 'SUPERADMIN',
      es_superadmin_principal: 1,
      sede_id: null
    };

    sesionAdminSede1 = {
      id: 2,
      nombre: 'Admin Sede 1',
      username: 'admin1',
      rol_nombre: 'ADMIN',
      es_superadmin_principal: 0,
      sede_id: 1
    };

    sesionInventarioSede1 = {
      id: 3,
      nombre: 'Inventario Sede 1',
      username: 'inv1',
      rol_nombre: 'INVENTARIO',
      es_superadmin_principal: 0,
      sede_id: 1
    };

    sesionUsuarioSede1 = {
      id: 4,
      nombre: 'Consulta Sede 1',
      username: 'user1',
      rol_nombre: 'USUARIO',
      es_superadmin_principal: 0,
      sede_id: 1
    };
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('Rol USUARIO es estrictamente rechazado al intentar cualquier escritura en inventario', () => {
    // 1. Intentar crear medicamento
    assert.throws(
      () => medicamentoService.crear(sesionUsuarioSede1, { codigo: 'X', nombre: 'X' }),
      /No tiene permisos para modificar el inventario/
    );

    // 2. Intentar crear lote
    assert.throws(
      () => loteService.crear(sesionUsuarioSede1, { medicamento_id: 1, sede_id: 1 }),
      /No tiene permisos para modificar el inventario/
    );

    // 3. Intentar crear orden
    assert.throws(
      () => ordenService.crear(sesionUsuarioSede1, { items: [] }),
      /No tiene permisos para gestionar órdenes/
    );

    // 4. Intentar despachar
    assert.throws(
      () => despachoService.crear(sesionUsuarioSede1, { orden_id: 1, items: [] }),
      /No tiene permisos para despachar medicamentos/
    );

    // 5. Intentar guardar receptor
    const resReceptor = receptorController.guardar(sesionUsuarioSede1, { nombre: 'Test', documento: '123' });
    assert.equal(resReceptor.ok, false);
    assert.match(resReceptor.error, /No tiene permisos/);

    // 6. Intentar sincronizar nube
    assert.rejects(
      async () => cloudSyncService.sincronizar(sesionUsuarioSede1),
      /Solo Superadmin o Administrador pueden sincronizar/
    );
  });

  test('Rol ADMIN puede gestionar órdenes de su sede pero NO puede despachar', () => {
    assert.throws(
      () => despachoService.crear(sesionAdminSede1, { orden_id: 1, items: [] }),
      /No tiene permisos para despachar medicamentos/
    );
  });

  test('Rol ADMIN e INVENTARIO no pueden operar sobre sedes ajenas', () => {
    // Sede ajena: sede 2
    assert.throws(
      () => ordenService.obtener(sesionAdminSede1, 9999), // no existe
      /La orden no existe/
    );
  });

  test('Rol INVENTARIO puede despachar en su sede pero no gestionar el Catálogo CUM ni usuarios', () => {
    // Intentar actualizar catálogo CUM
    assert.rejects(
      async () => catalogoCumController.actualizarCatalogo(sesionInventarioSede1),
      /No tiene permisos para gestionar el catálogo CUM/
    );

    // Intentar listar usuarios
    assert.throws(
      () => usuarioService.listar(sesionInventarioSede1),
      /Acceso denegado: solo el superadministrador principal/
    );
  });
});
