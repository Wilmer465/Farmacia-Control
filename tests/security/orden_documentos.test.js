'use strict';

// V-4.2-03: los rechazos de la política de adjuntos de órdenes deben llegar al
// operador como un mensaje funcional (extensión, MIME, tamaño o formato), no
// como "Error interno". Estas pruebas cruzan el controlador real para verificar
// que `DocumentoInvalidoError` no se convierte en un error genérico y que los
// controles de seguridad siguen intactos.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const authService = require('../../backend/services/authService');
const ordenController = require('../../backend/controllers/ordenController');
const { MAX_DOCUMENTO_BYTES } = require('../../shared/documentPolicy');

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'binary');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const SVG = Buffer.from('<svg><script>alert(1)</script></svg>', 'utf8');

function dataUrl(mime, buffer) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

describe('V-4.2-03 — mensajes específicos en adjuntos de órdenes', () => {
  let db;
  let sesion;
  let medicamentoId;

  beforeEach(() => {
    db = createTestDb();
    sesion = authService.login('wilmer', 'Wilmer465*');

    const med = db.prepare(`
      INSERT INTO medicamentos (codigo, nombre, presentacion, unidad_medida, unidades_por_caja)
      VALUES ('ORD-ADJ-001', 'Medicamento de prueba', 'Tableta 500 mg', 'TABLETA', 10)
    `).run();
    medicamentoId = Number(med.lastInsertRowid);

    db.prepare(`
      INSERT INTO lotes
        (medicamento_id, sede_id, numero_lote, fecha_expedicion, fecha_vencimiento,
         cantidad_cajas, cantidad_unidades_sueltas, cantidad_total_unidades)
      VALUES (?, 1, 'LOTE-ADJ-001', '2026-01-01', '2099-12-31', 10, 0, 100)
    `).run(medicamentoId);
  });

  afterEach(() => {
    teardownTestDb();
  });

  function ordenConAdjunto(overrides = {}) {
    return {
      sede_id: 1,
      items: [{ medicamento_id: medicamentoId, cantidad_unidades_solicitada: 1 }],
      receptor_nombre: 'Paciente de prueba',
      receptor_documento: '123456789',
      documento_adjunto_nombre: 'formula.pdf',
      documento_adjunto_data: dataUrl('application/pdf', PDF),
      documento_adjunto_tipo: 'PDF',
      ...overrides
    };
  }

  function assertRechazo(respuesta, mensaje) {
    assert.equal(respuesta.ok, false);
    assert.equal(typeof respuesta.error, 'string');
    assert.match(respuesta.error, mensaje);
    assert.doesNotMatch(
      respuesta.error,
      /Error interno|C:\\|node_modules|better-sqlite3|SqliteError|SQLITE_|SELECT|INSERT/i
    );
  }

  test('un PDF con MIME image/png se rechaza como tipo incoherente', () => {
    const respuesta = ordenController.crear(sesion, ordenConAdjunto({
      documento_adjunto_data: dataUrl('image/png', PDF)
    }));

    assertRechazo(respuesta, /no coincide con su contenido/i);
  });

  test('un PNG con MIME application/pdf se rechaza como tipo incoherente', () => {
    const respuesta = ordenController.crear(sesion, ordenConAdjunto({
      documento_adjunto_nombre: 'formula.png',
      documento_adjunto_data: dataUrl('application/pdf', PNG),
      documento_adjunto_tipo: 'IMAGEN'
    }));

    assertRechazo(respuesta, /no coincide con su contenido/i);
  });

  test('un PDF con MIME text/html se rechaza como tipo incoherente', () => {
    const respuesta = ordenController.crear(sesion, ordenConAdjunto({
      documento_adjunto_data: dataUrl('text/html', PDF)
    }));

    assertRechazo(respuesta, /no coincide con su contenido/i);
  });

  test('un data URL sin ;base64 se rechaza con el formato esperado', () => {
    const respuesta = ordenController.crear(sesion, ordenConAdjunto({
      documento_adjunto_data: `data:application/pdf,${PDF.toString('base64')}`
    }));

    assertRechazo(respuesta, /data URL base64/i);
  });

  test('un archivo que no es PDF ni imagen se rechaza por formato', () => {
    const respuesta = ordenController.crear(sesion, ordenConAdjunto({
      documento_adjunto_nombre: 'formula.svg',
      documento_adjunto_data: dataUrl('image/svg+xml', SVG),
      documento_adjunto_tipo: 'IMAGEN'
    }));

    assertRechazo(respuesta, /PDF o una imagen PNG, JPEG, GIF o WebP/i);
  });

  test('un adjunto que supera 10 MB se rechaza por tamaño', () => {
    const grande = Buffer.alloc(MAX_DOCUMENTO_BYTES + 1, 0x41);
    const respuesta = ordenController.crear(sesion, ordenConAdjunto({
      documento_adjunto_data: dataUrl('application/pdf', grande)
    }));

    assertRechazo(respuesta, /tamaño máximo permitido \(10 MB\)/i);
  });

  test('ningún rechazo crea la orden ni guarda el adjunto', () => {
    const invalidos = [
      ordenConAdjunto({ documento_adjunto_data: dataUrl('image/png', PDF) }),
      ordenConAdjunto({ documento_adjunto_data: dataUrl('application/pdf', PNG) }),
      ordenConAdjunto({ documento_adjunto_data: dataUrl('text/html', PDF) }),
      ordenConAdjunto({ documento_adjunto_data: `data:application/pdf,${PDF.toString('base64')}` }),
      ordenConAdjunto({ documento_adjunto_data: dataUrl('image/svg+xml', SVG) })
    ];

    for (const datos of invalidos) {
      const respuesta = ordenController.crear(sesion, datos);
      assert.equal(respuesta.ok, false);
    }

    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM ordenes').get().total, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM orden_detalles').get().total, 0);
  });

  test('un PDF válido sigue aceptándose y se guarda normalizado', () => {
    const respuesta = ordenController.crear(sesion, ordenConAdjunto());

    assert.equal(respuesta.ok, true, JSON.stringify(respuesta));
    const orden = respuesta.data;
    assert.equal(orden.documento_adjunto_nombre, 'formula.pdf');
    assert.equal(orden.documento_adjunto_tipo, 'PDF');
    assert.match(orden.documento_adjunto_data, /^data:application\/pdf;base64,/);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM ordenes').get().total, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM orden_detalles').get().total, 1);
  });

  test('una imagen PNG válida sigue aceptándose como IMAGEN', () => {
    const respuesta = ordenController.crear(sesion, ordenConAdjunto({
      documento_adjunto_nombre: 'formula.png',
      documento_adjunto_data: dataUrl('image/png', PNG),
      documento_adjunto_tipo: 'IMAGEN'
    }));

    assert.equal(respuesta.ok, true, JSON.stringify(respuesta));
    assert.equal(respuesta.data.documento_adjunto_tipo, 'IMAGEN');
    assert.match(respuesta.data.documento_adjunto_data, /^data:image\/png;base64,/);
  });
});
