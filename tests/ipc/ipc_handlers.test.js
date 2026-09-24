const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const authService = require('../../backend/services/authService');
const sessionService = require('../../backend/services/sessionService');
const medicamentoController = require('../../backend/controllers/medicamentoController');
const ordenController = require('../../backend/controllers/ordenController');
const despachoController = require('../../backend/controllers/despachoController');
const usuarioController = require('../../backend/controllers/usuarioController');
const receptorController = require('../../backend/controllers/receptorController');

describe('FASE 4 — IPC Handlers & Seguridad de Invocación desde Renderer', () => {
  let db;
  let sesionWilmer;
  let credencialesValidas;

  beforeEach(() => {
    db = createTestDb();
    credencialesValidas = authService.login('wilmer', 'Wilmer465*');
    sesionWilmer = credencialesValidas;
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('Wrapper de sesión IPC rechaza peticiones sin token o con token corrupto', () => {
    assert.throws(
      () => sessionService.resolverUsuarioDesdeSesion(null),
      /Sesión de usuario inválida/
    );

    assert.throws(
      () => sessionService.resolverUsuarioDesdeSesion({ session_token: 'token_falso_invalido' }),
      /Sesión expirada o inválida/
    );
  });

  test('IPC Handler de medicamentos: listar y crear con sesión válida', () => {
    const resListar = medicamentoController.listar();
    assert.equal(resListar.ok, true);
    assert.ok(Array.isArray(resListar.data));

    const resCrear = medicamentoController.crear(sesionWilmer, {
      codigo: 'MED-IPC-01',
      nombre: 'Medicamento IPC',
      unidades_por_caja: 10
    });
    assert.equal(resCrear.ok, true);
    assert.equal(resCrear.data.codigo, 'MED-IPC-01');
  });

  test('IPC Handler de receptores: rechaza operaciones de usuarios con sesión no autorizada', () => {
    const sesionInvalida = { ...sesionWilmer, rol_nombre: 'USUARIO' };
    const resGuardar = receptorController.guardar(sesionInvalida, { nombre: 'Test', documento: '999' });
    assert.equal(resGuardar.ok, false);
    assert.match(resGuardar.error, /No tiene permisos/);
  });

  test('IPC Handler de usuarios: exclusivo para superadmin principal', () => {
    const resListarWilmer = usuarioController.listar(sesionWilmer);
    assert.equal(resListarWilmer.ok, true);
    assert.ok(resListarWilmer.data.length >= 3);

    const sesionOtroAdmin = { ...sesionWilmer, es_superadmin_principal: 0 };
    const resListarOtro = usuarioController.listar(sesionOtroAdmin);
    assert.equal(resListarOtro.ok, false);
    assert.match(resListarOtro.error, /solo el superadministrador principal/);
  });

  test('IPC Handler de despachos: captura excepciones internas y responde { ok: false, error }', () => {
    // Despacho de orden inexistente
    const res = despachoController.crear(sesionWilmer, { orden_id: 999999, items: [] });
    assert.equal(res.ok, false);
    assert.match(res.error, /La orden no existe|no tiene permisos/);
  });
});
