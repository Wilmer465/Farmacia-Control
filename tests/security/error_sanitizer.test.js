'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  FALLBACK_POR_DEFECTO,
  MAX_LONGITUD,
  mensajeSeguro,
  sanearRespuesta
} = require('../../shared/errorSanitizer');

describe('Saneamiento de errores que cruzan IPC', () => {
  test('conserva mensajes funcionales para el usuario', () => {
    const mensajes = [
      'La unidad de medida es obligatoria.',
      'Sesión expirada o inválida. Inicie sesión de nuevo.',
      'No tiene permisos para modificar el inventario.',
      'El nombre de la sede es obligatorio.'
    ];
    for (const mensaje of mensajes) {
      assert.equal(mensajeSeguro(new Error(mensaje)), mensaje);
      assert.equal(mensajeSeguro(mensaje), mensaje);
    }
  });

  test('oculta rutas, SQL, detalles de módulos nativos y marcos de pila', () => {
    const filtrados = [
      'ENOENT: no such file or directory, open \'C:\\Users\\USER-D\\data\\farmacia.db\'',
      '\\\\servidor\\recurso\\base.db no disponible',
      '/home/usuario/farmacia/data/farmacia.db no existe',
      'Cannot find module \'C:\\app\\node_modules\\better-sqlite3\\lib\\index.js\'',
      'The module was compiled against NODE_MODULE_VERSION 128',
      'ERR_DLOPEN_FAILED: better_sqlite3.node',
      'SqliteError: no such table: usuarios',
      'SQLITE_CONSTRAINT: UNIQUE constraint failed: usuarios.username',
      'Cannot read properties of undefined (reading \'id\')',
      'usuarios.map is not a function',
      'SELECT id, username FROM usuarios WHERE id = 1',
      'Error: fallo\n    at Repositorio.buscar (C:\\app\\backend\\repo.js:10:3)',
      '    at processTicksAndRejections (node:internal/process/task_queues:95:5)'
    ];
    for (const mensaje of filtrados) {
      assert.equal(mensajeSeguro(new Error(mensaje)), FALLBACK_POR_DEFECTO, mensaje);
    }
  });

  test('limpia caracteres de control, colapsa espacios y limita la longitud', () => {
    assert.equal(mensajeSeguro('  Hola\u0000mundo\n\tdesde  la   app  '), 'Hola mundo desde la app');
    assert.equal(mensajeSeguro('a'.repeat(400)).length, MAX_LONGITUD);
    assert.equal(mensajeSeguro(new Error('')), FALLBACK_POR_DEFECTO);
    assert.equal(mensajeSeguro(null), FALLBACK_POR_DEFECTO);
    assert.equal(mensajeSeguro(undefined), FALLBACK_POR_DEFECTO);
  });

  test('usa el fallback provisto por el llamador', () => {
    assert.equal(mensajeSeguro(new Error('C:\\secreto\\db'), 'Error controlado.'), 'Error controlado.');
    assert.equal(mensajeSeguro('', 'Error controlado.'), 'Error controlado.');
  });

  test('sanea el contrato { ok:false, error } sin tocar respuestas exitosas ni arrays', () => {
    const saneada = sanearRespuesta({ ok: false, error: 'no such table: usuarios' });
    assert.deepEqual(saneada, { ok: false, error: FALLBACK_POR_DEFECTO });

    const funcional = { ok: false, error: 'El nombre es obligatorio.' };
    assert.equal(sanearRespuesta(funcional), funcional);

    const exitosa = { ok: true, data: [{ id: 1 }] };
    assert.equal(sanearRespuesta(exitosa), exitosa);

    const arreglo = [{ ok: false, error: 'C:\\ruta' }];
    assert.equal(sanearRespuesta(arreglo), arreglo);

    assert.equal(sanearRespuesta(null), null);
    assert.equal(sanearRespuesta('texto'), 'texto');
  });

  test('sanea también el error de una respuesta anidada solo cuando respeta el contrato', () => {
    const resultado = sanearRespuesta({ ok: false, error: 500 });
    assert.deepEqual(resultado, { ok: false, error: 500 }, 'un error no textual no se inventa');
  });
});
