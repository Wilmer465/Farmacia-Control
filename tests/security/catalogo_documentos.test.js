'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const catalogoCumService = require('../../backend/services/catalogoCumService');
const usuarioRepository = require('../../backend/repositories/usuarioRepository');
const { abrirDocumentoTemporal } = require('../../electron/documentOpener');

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'binary');
const PDF_BASE64 = PDF.toString('base64');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const PNG_BASE64 = PNG.toString('base64');

function documentoPdf(overrides = {}) {
  return {
    documento_adjunto_nombre: 'formula.pdf',
    documento_adjunto_data: PDF_BASE64,
    documento_adjunto_tipo: 'PDF',
    ...overrides
  };
}

function crearSesion(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    username: usuario.username,
    rol_nombre: usuario.rol_nombre,
    es_superadmin_principal: usuario.es_superadmin_principal,
    sede_id: usuario.sede_id
  };
}

describe('Documentos del catálogo CUM y apertura segura', () => {
  let db;
  let sesionSuperadmin;
  let sesionAdmin;
  let sesionInventario;
  let registro;

  beforeEach(() => {
    db = createTestDb();
    sesionSuperadmin = crearSesion(usuarioRepository.findByUsername('wilmer'));
    const rolAdmin = db.prepare("SELECT id FROM roles WHERE nombre = 'ADMIN'").get();
    sesionAdmin = crearSesion(usuarioRepository.crear({
      nombre: 'Admin de prueba',
      username: 'admin_documentos',
      password_hash: 'no-usado-en-esta-prueba',
      rol_id: rolAdmin.id,
      sede_id: 1
    }));
    sesionInventario = crearSesion(usuarioRepository.findByUsername('inv_quibdo'));

    registro = catalogoCumService.crearRegistroManual(sesionSuperadmin, {
      cum: 'MAN-SEC-001',
      producto: 'Medicamento de prueba',
      registro_sanitario: 'INVIMA 2020M-0001'
    });
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('guarda un PDF válido y normaliza el nombre y el base64', () => {
    const actualizado = catalogoCumService.adjuntarDocumento(sesionAdmin, registro.id, documentoPdf({
      documento_adjunto_nombre: '  formula.pdf  ',
      documento_adjunto_data: `  ${PDF_BASE64}  `
    }));

    assert.equal(actualizado.documento_adjunto_nombre, 'formula.pdf');
    assert.equal(actualizado.documento_adjunto_tipo, 'PDF');
    assert.equal(actualizado.documento_adjunto_data, PDF_BASE64);

    const guardado = db.prepare('SELECT documento_adjunto_nombre, documento_adjunto_data, documento_adjunto_tipo FROM catalogo_cum WHERE id = ?').get(registro.id);
    assert.equal(guardado.documento_adjunto_nombre, 'formula.pdf');
    assert.equal(guardado.documento_adjunto_data, PDF_BASE64);
    assert.equal(guardado.documento_adjunto_tipo, 'PDF');
  });

  test('acepta una imagen PNG y la almacena como IMAGEN', () => {
    const actualizado = catalogoCumService.adjuntarDocumento(sesionSuperadmin, registro.id, documentoPdf({
      documento_adjunto_nombre: 'formula.png',
      documento_adjunto_data: PNG_BASE64,
      documento_adjunto_tipo: 'IMAGEN'
    }));
    assert.equal(actualizado.documento_adjunto_tipo, 'IMAGEN');
    assert.equal(actualizado.documento_adjunto_data, PNG_BASE64);
  });

  test('rechaza adjuntos manipulados sin modificar el documento anterior', () => {
    catalogoCumService.adjuntarDocumento(sesionSuperadmin, registro.id, documentoPdf());

    const invalidos = [
      documentoPdf({ documento_adjunto_data: 'no-es-base64%%%' }),
      documentoPdf({ documento_adjunto_data: Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64') }),
      documentoPdf({ documento_adjunto_data: PNG_BASE64 }),
      documentoPdf({ documento_adjunto_nombre: '../fuera.pdf' }),
      documentoPdf({ documento_adjunto_nombre: 'x.pdf', documento_adjunto_tipo: 'IMAGEN' })
    ];

    for (const invalido of invalidos) {
      assert.throws(
        () => catalogoCumService.adjuntarDocumento(sesionSuperadmin, registro.id, invalido),
        /documento|base64|caracteres|tipo/i
      );
    }

    const guardado = catalogoCumService.obtenerDocumento(sesionSuperadmin, registro.id);
    assert.equal(guardado.documento_adjunto_data, PDF_BASE64);
    assert.equal(guardado.documento_adjunto_nombre, 'formula.pdf');
  });

  test('rechaza IDs de CUM no enteros positivos y documentos inexistentes', () => {
    for (const id of [0, -1, 1.5, '1 OR 1=1', null, undefined, {}, []]) {
      assert.throws(
        () => catalogoCumService.adjuntarDocumento(sesionSuperadmin, id, documentoPdf()),
        /Registro CUM inválido/
      );
      assert.throws(
        () => catalogoCumService.obtenerDocumento(sesionSuperadmin, id),
        /Registro CUM inválido/
      );
    }

    assert.throws(
      () => catalogoCumService.adjuntarDocumento(sesionSuperadmin, 999999, documentoPdf()),
      /no encontrado/
    );
    assert.equal(catalogoCumService.obtenerDocumento(sesionSuperadmin, 999999), null);
  });

  test('mantiene la autorización: solo ADMIN y SUPERADMIN gestionan documentos', () => {
    assert.throws(
      () => catalogoCumService.adjuntarDocumento(sesionInventario, registro.id, documentoPdf()),
      /No tiene permisos/
    );
    assert.throws(
      () => catalogoCumService.obtenerDocumento(sesionInventario, registro.id),
      /No tiene permisos/
    );
    assert.throws(
      () => catalogoCumService.adjuntarDocumento(null, registro.id, documentoPdf()),
      /No tiene permisos/
    );
  });

  test('limita el tamaño de la búsqueda y rechaza textos no string', () => {
    assert.equal(catalogoCumService.normalizarLimiteBusqueda(0), 1);
    assert.equal(catalogoCumService.normalizarLimiteBusqueda(-10), 1);
    assert.equal(catalogoCumService.normalizarLimiteBusqueda(2.9), 2);
    assert.equal(catalogoCumService.normalizarLimiteBusqueda(500), 100);
    assert.equal(catalogoCumService.normalizarLimiteBusqueda('abc'), 20);
    assert.equal(catalogoCumService.normalizarLimiteBusqueda(undefined), 20);

    assert.throws(
      () => catalogoCumService.buscarPorProducto({ $ne: null }, 20),
      /texto de búsqueda es inválido/
    );
    assert.ok(Array.isArray(catalogoCumService.buscarPorProducto('medicamento', 500)));
  });

  test('abre el documento en un archivo temporal con nombre generado y sin revelar la ruta', async () => {
    catalogoCumService.adjuntarDocumento(sesionSuperadmin, registro.id, documentoPdf());
    const documento = catalogoCumService.obtenerDocumento(sesionSuperadmin, registro.id);
    const directorioTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-doc-test-'));
    const rutasAbiertas = [];

    try {
      const resultado = await abrirDocumentoTemporal(documento, {
        shell: {
          openPath: async (ruta) => {
            rutasAbiertas.push(ruta);
            return '';
          }
        },
        directorioTemporal
      });

      assert.deepEqual(resultado, { abierto: true, nombre: 'formula.pdf', tipo: 'PDF' });
      assert.equal(Object.hasOwn(resultado, 'ruta'), false);
      assert.equal(Object.hasOwn(resultado, 'path'), false);
      assert.equal(rutasAbiertas.length, 1);
      assert.equal(path.basename(rutasAbiertas[0]), 'documento.pdf');
      assert.ok(rutasAbiertas[0].startsWith(directorioTemporal));
      assert.deepEqual(fs.readFileSync(rutasAbiertas[0]), PDF);
    } finally {
      fs.rmSync(directorioTemporal, { recursive: true, force: true });
    }
  });

  test('el nombre original nunca se usa como ruta del archivo temporal', async () => {
    catalogoCumService.adjuntarDocumento(sesionSuperadmin, registro.id, documentoPdf({
      documento_adjunto_nombre: 'formula.pdf'
    }));
    const documento = catalogoCumService.obtenerDocumento(sesionSuperadmin, registro.id);
    const directorioTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-doc-test-'));
    let rutaAbierta;

    try {
      await abrirDocumentoTemporal(documento, {
        shell: { openPath: async (ruta) => { rutaAbierta = ruta; return ''; } },
        directorioTemporal
      });
      assert.equal(path.basename(rutaAbierta), 'documento.pdf');
      assert.notEqual(path.basename(rutaAbierta), documento.documento_adjunto_nombre);
      assert.equal(fs.existsSync(path.join(path.dirname(rutaAbierta), 'formula.pdf')), false);
    } finally {
      fs.rmSync(directorioTemporal, { recursive: true, force: true });
    }
  });

  test('no invoca al visor si el documento es inválido o no existe', async () => {
    let llamadas = 0;
    const shell = { openPath: async () => { llamadas += 1; return ''; } };

    await assert.rejects(
      abrirDocumentoTemporal({
        documento_adjunto_nombre: 'malicioso.pdf',
        documento_adjunto_data: Buffer.from('<svg/>').toString('base64'),
        documento_adjunto_tipo: 'PDF'
      }, { shell }),
      /PDF o una imagen/
    );
    await assert.rejects(
      abrirDocumentoTemporal({}, { shell }),
      /No hay documento adjunto/
    );
    await assert.rejects(
      abrirDocumentoTemporal(documentoPdf(), { shell: null }),
      /No se pudo abrir el documento/
    );
    assert.equal(llamadas, 0);
  });

  test('propaga un fallo del visor del sistema como error controlado', async () => {
    catalogoCumService.adjuntarDocumento(sesionSuperadmin, registro.id, documentoPdf());
    const documento = catalogoCumService.obtenerDocumento(sesionSuperadmin, registro.id);
    const directorioTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-doc-test-'));

    try {
      await assert.rejects(
        abrirDocumentoTemporal(documento, {
          shell: { openPath: async () => 'No hay aplicación asociada' },
          directorioTemporal
        }),
        /No se pudo abrir el documento con la aplicación predeterminada/
      );
    } finally {
      fs.rmSync(directorioTemporal, { recursive: true, force: true });
    }
  });
});
