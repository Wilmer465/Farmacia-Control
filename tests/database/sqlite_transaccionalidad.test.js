const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const ordenService = require('../../backend/services/ordenService');
const despachoService = require('../../backend/services/despachoService');
const loteService = require('../../backend/services/loteService');
const medicamentoService = require('../../backend/services/medicamentoService');
const despachoRepository = require('../../backend/repositories/despachoRepository');
const auditoriaRepository = require('../../backend/repositories/auditoriaRepository');
const { getDb } = require('../../backend/database/connection');

// Firma mock realista (ver backend/validators/firmaValidator.js).
const FIRMA_TEST = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='.repeat(4);

describe('FASE 5 — SQLite & Transaccionalidad Atómica: Despacho e Integridad', () => {
  let db;
  let sesionSuperadmin;
  let medicamento;
  let lote;
  let orden;

  beforeEach(() => {
    db = createTestDb();
    sesionSuperadmin = {
      id: 1,
      nombre: 'Superadmin',
      username: 'superadmin',
      rol_nombre: 'SUPERADMIN',
      sede_id: null
    };

    medicamento = medicamentoService.crear(sesionSuperadmin, {
      codigo: 'MED-TRANS-01',
      nombre: 'Amoxicilina 500mg',
      unidad_medida: 'TABLETA',
      unidades_por_caja: 10
    });

    lote = loteService.crear(sesionSuperadmin, {
      medicamento_id: medicamento.id,
      sede_id: 1,
      numero_lote: 'L-TRANS-01',
      fecha_expedicion: '2026-01-01',
      fecha_vencimiento: '2028-12-31',
      cantidad_cajas: 10, // 100 unidades
      cantidad_unidades_sueltas: 0
    });

    orden = ordenService.crear(sesionSuperadmin, {
      sede_id: 1,
      tipo_destino: 'LOCAL',
      receptor_nombre: 'Receptor Juan Perez',
      receptor_documento: '12345678',
      firma_data: FIRMA_TEST,
      huella_registrada: 1,
      items: [
        {
          medicamento_id: medicamento.id,
          cantidad_unidades_solicitada: 40
        }
      ]
    });
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('PRUEBA CRÍTICA: Despacho completo exitoso con los 8 pasos atómicos', () => {
    const stockAntes = loteService.listar(sesionSuperadmin, { sedeId: 1 }).find(l => l.id === lote.id);
    assert.equal(stockAntes.cantidad_total_unidades, 100);

    const resultado = despachoService.crear(sesionSuperadmin, {
      orden_id: orden.id,
      items: [
        {
          orden_detalle_id: orden.detalles[0].id,
          lote_id: lote.id,
          cantidad_unidades_despachada: 40
        }
      ]
    });

    assert.ok(resultado);
    assert.equal(resultado.nuevoEstadoOrden, 'COMPLETADA');
    assert.equal(resultado.despacho.orden_id, orden.id);

    // 1. Stock descontado exactamente
    const stockDespues = loteService.listar(sesionSuperadmin, { sedeId: 1 }).find(l => l.id === lote.id);
    assert.equal(stockDespues.cantidad_total_unidades, 60);

    // 2. Despacho y detalle registrados
    const despachosEnDb = despachoRepository.findAll({ ordenId: orden.id });
    assert.equal(despachosEnDb.length, 1);
    const detalleDespacho = despachoRepository.findDetalleByDespachoId(despachosEnDb[0].id);
    assert.equal(detalleDespacho.length, 1);
    assert.equal(detalleDespacho[0].cantidad_total_despachada, 40);

    // 3. Movimiento de inventario registrado
    const movimientos = db.prepare('SELECT * FROM movimientos_inventario WHERE lote_id = ?').all(lote.id);
    const salida = movimientos.find(m => m.tipo === 'SALIDA_ORDEN');
    assert.ok(salida);
    assert.equal(salida.cantidad, -40);

    // 4. Auditoría registrada transaccionalmente
    const logsAuditoria = auditoriaRepository.findAll({ modulo: 'DESPACHOS' });
    const logDespacho = logsAuditoria.find(l => l.registro_afectado === `orden:${orden.id}`);
    assert.ok(logDespacho);
    assert.equal(logDespacho.resultado, 'EXITO');
  });

  test('PRUEBA CRÍTICA DE ROLLBACK: Fallo en validación de stock no deja datos parciales', () => {
    const stockOriginal = 100;

    // Intentar despachar 150 unidades cuando solo hay 100 en el lote (o más de lo solicitado en la orden)
    assert.throws(
      () => despachoService.crear(sesionSuperadmin, {
        orden_id: orden.id,
        items: [
          {
            orden_detalle_id: orden.detalles[0].id,
            lote_id: lote.id,
            cantidad_unidades_despachada: 150
          }
        ]
      }),
      /más de lo pendiente|Stock insuficiente/
    );

    // Verificar que el stock está INTACTO
    const loteActual = db.prepare('SELECT * FROM lotes WHERE id = ?').get(lote.id);
    assert.equal(loteActual.cantidad_total_unidades, stockOriginal);

    // Verificar que NO se creó ningún despacho
    const despachos = db.prepare('SELECT count(*) c FROM despachos WHERE orden_id = ?').get(orden.id);
    assert.equal(despachos.c, 0);

    // Verificar que NO se crearon detalles de despacho
    const detalles = db.prepare('SELECT count(*) c FROM despacho_detalle').get();
    assert.equal(detalles.c, 0);

    // Verificar que la orden sigue en PENDIENTE
    const ordenDb = db.prepare('SELECT estado FROM ordenes WHERE id = ?').get(orden.id);
    assert.equal(ordenDb.estado, 'PENDIENTE');

    // Verificar que NO hay movimiento de salida registrado
    const salidas = db.prepare("SELECT count(*) c FROM movimientos_inventario WHERE tipo = 'SALIDA_ORDEN'").get();
    assert.equal(salidas.c, 0);

    // Verificar que NO hay auditoría de despacho exitoso huérfana
    const auditorias = db.prepare("SELECT count(*) c FROM auditoria WHERE modulo = 'DESPACHOS'").get();
    assert.equal(auditorias.c, 0);
  });

  test('PRUEBA CRÍTICA: Rechazo de despacho de lote vencido y preservación de integridad', () => {
    // Crear lote vencido
    const loteVencido = loteService.crear(sesionSuperadmin, {
      medicamento_id: medicamento.id,
      sede_id: 1,
      numero_lote: 'L-EXP-01',
      fecha_expedicion: '2020-01-01',
      fecha_vencimiento: '2021-01-01',
      cantidad_cajas: 5,
      cantidad_unidades_sueltas: 0
    });

    assert.throws(
      () => despachoService.crear(sesionSuperadmin, {
        orden_id: orden.id,
        items: [
          {
            orden_detalle_id: orden.detalles[0].id,
            lote_id: loteVencido.id,
            cantidad_unidades_despachada: 10
          }
        ]
      }),
      /está vencido y no puede despacharse/
    );

    const despachos = db.prepare('SELECT count(*) c FROM despachos').get();
    assert.equal(despachos.c, 0);
  });
});
