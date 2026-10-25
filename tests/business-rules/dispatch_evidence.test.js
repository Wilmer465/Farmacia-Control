const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const medicamentoService = require('../../backend/services/medicamentoService');
const loteService = require('../../backend/services/loteService');
const ordenService = require('../../backend/services/ordenService');
const despachoService = require('../../backend/services/despachoService');
const entregaService = require('../../backend/services/entregaService');

const FIRMA_PRUEBA = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='.repeat(4);

describe('Bloqueo de despacho sin evidencia física confiable', () => {
  let db;
  let session;
  let med;
  beforeEach(() => {
    db = createTestDb();
    session = { id: 1, rol_nombre: 'SUPERADMIN', sede_id: null };
    med = medicamentoService.crear(session, {
      codigo: 'EVID-01', nombre: 'Medicamento prueba', unidad_medida: 'TABLETA', unidades_por_caja: 1
    });
    loteService.crear(session, {
      medicamento_id: med.id, sede_id: 1, numero_lote: 'EVID-LOT-01',
      fecha_expedicion: '2026-01-01', fecha_vencimiento: '2028-12-31', cantidad_cajas: 10
    });
  });
  afterEach(() => teardownTestDb());

  function crearOrden(extra = {}) {
    return ordenService.crear(session, {
      sede_id: 1, tipo_destino: 'LOCAL', receptor_nombre: 'Receptor prueba',
      receptor_documento: '99887766', items: [{ medicamento_id: med.id, cantidad_unidades_solicitada: 1 }],
      ...extra
    });
  }

  test('rechaza una orden inexistente antes de cualquier mutación', () => {
    assert.throws(() => despachoService.crear(session, { orden_id: -1, items: [] }), /La orden no existe/);
    assert.equal(db.prepare('SELECT count(*) n FROM despachos').get().n, 0);
  });

  test('rechaza firma ausente aunque el renderer declare huella registrada', () => {
    const orden = crearOrden({ huella_registrada: 1 });
    assert.throws(() => despachoService.crear(session, { orden_id: orden.id, huella_registrada: 1, items: [] }), /firma física Wacom/);
    assert.equal(db.prepare('SELECT count(*) n FROM despachos').get().n, 0);
  });

  test('rechaza una firma guardada manualmente sin procedencia Wacom confiable', () => {
    const orden = crearOrden({ firma_data: FIRMA_PRUEBA, huella_registrada: 1 });
    assert.equal(orden.huella_registrada, 0, 'el booleano del renderer no se persiste como verificación');
    assert.throws(() => despachoService.crear(session, { orden_id: orden.id, items: [] }), /firma física Wacom/);
  });

  test('no acepta huella declarada ni captura no comparada con identidad enrolada', () => {
    const orden = crearOrden({ firma_data: FIRMA_PRUEBA, huella_registrada: 1 });
    db.prepare('UPDATE ordenes SET firma_wacom_verificada = 1 WHERE id = ?').run(orden.id);
    assert.throws(() => despachoService.crear(session, {
      orden_id: orden.id, firma_data: FIRMA_PRUEBA, huella_registrada: 1,
      huella_verificada: true, items: []
    }), /verificación biométrica contra la identidad registrada/);
    assert.equal(db.prepare('SELECT count(*) n FROM despachos').get().n, 0);
  });

  test('editar la documentación invalida las marcas de evidencia anteriores', () => {
    const orden = crearOrden({ firma_data: FIRMA_PRUEBA });
    db.prepare(`UPDATE ordenes SET firma_wacom_verificada = 1,
      huella_identidad_verificada = 1 WHERE id = ?`).run(orden.id);
    ordenService.actualizarDocumentacion(session, orden.id, {
      receptor_nombre: 'Receptor editado', receptor_documento: '99887766',
      firma_data: FIRMA_PRUEBA, huella_registrada: 1
    });
    const evidencia = db.prepare(`SELECT firma_wacom_verificada, huella_identidad_verificada
      FROM ordenes WHERE id = ?`).get(orden.id);
    assert.deepEqual(evidencia, { firma_wacom_verificada: 0, huella_identidad_verificada: 0 });
  });

  test('el renderer no puede declarar MUNICIPIO_VEREDA para evitar validación en una orden local', () => {
    const orden = crearOrden({ firma_data: FIRMA_PRUEBA });
    const despacho = db.prepare(`INSERT INTO despachos (orden_id, sede_id, despachado_por)
      VALUES (?, 1, ?)`).run(orden.id, session.id);
    assert.throws(() => entregaService.crear(session, {
      despacho_id: Number(despacho.lastInsertRowid),
      tipo_destino: 'MUNICIPIO_VEREDA',
      receptor_nombre: 'Receptor prueba', receptor_documento: '99887766'
    }), /firma física Wacom guardada y verificada/);
    assert.equal(db.prepare('SELECT count(*) n FROM entregas').get().n, 0);
  });
});
