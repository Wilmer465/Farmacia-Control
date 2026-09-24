const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const authService = require('../../backend/services/authService');
const sessionService = require('../../backend/services/sessionService');
const usuarioRepository = require('../../backend/repositories/usuarioRepository');

describe('FASE 3 — Unit Tests: Autenticación y Sesiones', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('Login exitoso con credenciales válidas (Wilmer superadmin)', () => {
    const resultado = authService.login('wilmer', 'Wilmer465*');
    assert.ok(resultado);
    assert.equal(resultado.username, 'Wilmer');
    assert.equal(resultado.rol_nombre, 'SUPERADMIN');
    assert.ok(resultado.session_token, 'Debe generar un token opaco de sesión');
    assert.equal(resultado.password_hash, undefined, 'No debe filtrar el password_hash');
  });

  test('Login fallido con contraseña incorrecta', () => {
    assert.throws(
      () => authService.login('wilmer', 'ClaveEquivocada123*'),
      /Usuario o contraseña incorrectos/
    );
  });

  test('Login fallido con usuario inexistente', () => {
    assert.throws(
      () => authService.login('usuario_no_existe', 'Cualquiera123*'),
      /Usuario o contraseña incorrectos/
    );
  });

  test('Rate limiting: bloqueo temporal tras 5 intentos fallidos', () => {
    for (let i = 0; i < 5; i++) {
      assert.throws(
        () => authService.login('wilmer', 'ClaveMala' + i),
        /Usuario o contraseña incorrectos/
      );
    }
    // El 6to intento debe indicar que la cuenta está bloqueada temporalmente
    assert.throws(
      () => authService.login('wilmer', 'Wilmer465*'),
      /Demasiados intentos fallidos/
    );
  });

  test('Rechazo de login para usuarios con estado INACTIVO', () => {
    const user = usuarioRepository.findByUsername('inv_quibdo');
    assert.ok(user);
    usuarioRepository.cambiarEstado(user.id, 'INACTIVO');

    assert.throws(
      () => authService.login('inv_quibdo', 'Quibdo123*'),
      /Usuario o contraseña incorrectos/
    );
  });

  test('Resolución de sesión a través del token opaco de sesión', () => {
    const loginRes = authService.login('wilmer', 'Wilmer465*');
    const usuarioResuelto = sessionService.resolverUsuarioDesdeSesion({ session_token: loginRes.session_token });
    assert.equal(usuarioResuelto.id, loginRes.id);
    assert.equal(usuarioResuelto.rol_nombre, 'SUPERADMIN');
  });

  test('Rechazo de sesión con token inválido o expirado', () => {
    assert.throws(
      () => sessionService.resolverUsuarioDesdeSesion({ session_token: 'token_inexistente_123456' }),
      /Sesión expirada o inválida/
    );
  });

  test('Logout invalida la sesión activa', () => {
    const loginRes = authService.login('wilmer', 'Wilmer465*');
    const authController = require('../../backend/controllers/authController');
    const controllerLogoutRes = authController.logout(loginRes);
    assert.equal(controllerLogoutRes.ok, true);

    assert.throws(
      () => sessionService.resolverUsuarioDesdeSesion({ session_token: loginRes.session_token }),
      /Sesión expirada o inválida/
    );
  });
});
