const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const ordenService = require('../../backend/services/ordenService');
const despachoService = require('../../backend/services/despachoService');
const loteService = require('../../backend/services/loteService');
const medicamentoService = require('../../backend/services/medicamentoService');
const conciliacionService = require('../../backend/services/conciliacionService');
const reporteService = require('../../backend/services/reporteService');
const solicitudEliminacionService = require('../../backend/services/solicitudEliminacionService');
const { getDb } = require('../../backend/database/connection');

describe('FASE 6 — Reglas del Negocio de Farmacia-Control', () => {
  let db;
  let sesionSuperadmin;
  let med;
  let lote;

  beforeEach(() => {
    db = createTestDb();
    sesionSuperadmin = {
      id: 1,
      nombre: 'Superadmin',
      username: 'superadmin',
      rol_nombre: 'SUPERADMIN',
      sede_id: null
    };

    med = medicamentoService.crear(sesionSuperadmin, {
      codigo: 'MED-REG-01',
      nombre: 'Diclofenaco 50mg',
      unidades_por_caja: 10
    });

    lote = loteService.crear(sesionSuperadmin, {
      medicamento_id: med.id,
      sede_id: 1,
      numero_lote: 'L-REG-01',
      fecha_expedicion: '2026-01-01',
      fecha_vencimiento: '2028-12-31',
      cantidad_cajas: 10 // 100 unidades
    });
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('No permitir despacho sin firma registrada', () => {
    // Crear orden exenta temporal de firma en creación (MUNICIPIO_VEREDA)
    const ordenSinFirma = ordenService.crear(sesionSuperadmin, {
      sede_id: 1,
      tipo_destino: 'MUNICIPIO_VEREDA',
      destino_detalle: 'Vereda Las Flores',
      receptor_nombre: 'Conductor Envio',
      receptor_documento: '98765432',
      items: [{ medicamento_id: med.id, cantidad_unidades_solicitada: 20 }]
    });

    // Intentar despachar sin firma
    assert.throws(
      () => despachoService.crear(sesionSuperadmin, {
        orden_id: ordenSinFirma.id,
        items: [{ orden_detalle_id: ordenSinFirma.detalles[0].id, lote_id: lote.id, cantidad_unidades_despachada: 20 }]
      }),
      /se requiere firma registrada/
    );
  });

  test('No permitir despacho sin huella registrada', () => {
    const ordenSinHuella = ordenService.crear(sesionSuperadmin, {
      sede_id: 1,
      tipo_destino: 'MUNICIPIO_VEREDA',
      destino_detalle: 'Vereda El Salto',
      receptor_nombre: 'Conductor Envio',
      receptor_documento: '98765432',
      firma_data: 'data:image/png;base64,FIRMA_MOCK',
      huella_registrada: 0,
      items: [{ medicamento_id: med.id, cantidad_unidades_solicitada: 20 }]
    });

    assert.throws(
      () => despachoService.crear(sesionSuperadmin, {
        orden_id: ordenSinHuella.id,
        items: [{ orden_detalle_id: ordenSinHuella.detalles[0].id, lote_id: lote.id, cantidad_unidades_despachada: 20 }]
      }),
      /se requiere huella registrada/
    );
  });

  test('Registrar correctamente pedidos parciales y diferenciar solicitado de despachado', () => {
    const orden = ordenService.crear(sesionSuperadmin, {
      sede_id: 1,
      tipo_destino: 'LOCAL',
      receptor_nombre: 'Receptor Paciente',
      receptor_documento: '11223344',
      firma_data: 'data:image/png;base64,FIRMA_MOCK',
      huella_registrada: 1,
      items: [{ medicamento_id: med.id, cantidad_unidades_solicitada: 50 }]
    });

    // Despacho parcial de 20 de 50
    const resParcial = despachoService.crear(sesionSuperadmin, {
      orden_id: orden.id,
      items: [{ orden_detalle_id: orden.detalles[0].id, lote_id: lote.id, cantidad_unidades_despachada: 20 }]
    });

    assert.equal(resParcial.nuevoEstadoOrden, 'PARCIAL');

    const ordenActualizada = ordenService.obtener(sesionSuperadmin, orden.id);
    assert.equal(ordenActualizada.estado, 'PARCIAL');
    assert.equal(ordenActualizada.detalles[0].cantidad_total_solicitada, 50);
    assert.equal(ordenActualizada.detalles[0].cantidad_total_despachada, 20);

    // Segundo despacho: restante 30
    const resCompleto = despachoService.crear(sesionSuperadmin, {
      orden_id: orden.id,
      items: [{ orden_detalle_id: orden.detalles[0].id, lote_id: lote.id, cantidad_unidades_despachada: 30 }]
    });

    assert.equal(resCompleto.nuevoEstadoOrden, 'COMPLETADA');
    const ordenFinal = ordenService.obtener(sesionSuperadmin, orden.id);
    assert.equal(ordenFinal.estado, 'COMPLETADA');
    assert.equal(ordenFinal.detalles[0].cantidad_total_despachada, 50);
  });

  test('Salida sin orden provoca que Conciliación y Reportes marquen NO_CONCILIADO', () => {
    // Estado inicial: todo conciliado
    const concInicial = conciliacionService.conciliar(sesionSuperadmin, { sedeId: 1 });
    assert.equal(concInicial.estadoGeneral, 'CONCILIADO');

    // Provocar salida sin orden: ajuste manual a la baja
    loteService.ajustarCantidades(sesionSuperadmin, lote.id, {
      cantidad_cajas: 8,
      cantidad_unidades_sueltas: 0,
      motivo: 'Ajuste manual sin orden por diferencia'
    });

    // Conciliación DEBE marcar NO_CONCILIADO
    const concDespues = conciliacionService.conciliar(sesionSuperadmin, { sedeId: 1 });
    assert.equal(concDespues.estadoGeneral, 'NO_CONCILIADO');
    assert.equal(concDespues.detalle[0].tiene_ajustes_irregulares, true);

    // El reporte diario también DEBE marcar NO CONCILIADO
    const rep = reporteService.reporteDiario(sesionSuperadmin, { sedeId: 1 });
    assert.equal(rep.estado_general.estado, 'NO CONCILIADO');
    assert.ok(rep.salidasSinOrden.length > 0);
  });

  test('Registro auditable de solicitudes de eliminación y no auto-aprobación', () => {
    const solicitud = solicitudEliminacionService.crear(sesionSuperadmin, {
      tipo_registro: 'LOTE',
      registro_id: lote.id,
      motivo: 'Lote dañado por humedad'
    });

    assert.ok(solicitud.id);
    assert.equal(solicitud.estado, 'PENDIENTE');

    // Regla: no puede auto-aprobar su propia solicitud
    assert.throws(
      () => solicitudEliminacionService.resolver(sesionSuperadmin, solicitud.id, { decision: 'APROBADA' }),
      /no puede aprobar su propia solicitud/
    );
  });
});
