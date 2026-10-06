const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const reporteService = require('../../backend/services/reporteService');
const medicamentoService = require('../../backend/services/medicamentoService');
const loteService = require('../../backend/services/loteService');
const ordenService = require('../../backend/services/ordenService');
const despachoService = require('../../backend/services/despachoService');

describe('FASE 10 — Reportes y Auditoría: Filtros Temporales y Multisede', () => {
  let db;
  let sesionSuperadmin;
  let med;
  let lote;

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

    med = medicamentoService.crear(sesionSuperadmin, {
      codigo: 'MED-REP-01',
      nombre: 'Metformina 850mg',
      unidad_medida: 'TABLETA',
      unidades_por_caja: 30
    });

    lote = loteService.crear(sesionSuperadmin, {
      medicamento_id: med.id,
      sede_id: 1,
      numero_lote: 'L-REP-01',
      fecha_expedicion: '2026-01-01',
      fecha_vencimiento: '2027-12-31',
      cantidad_cajas: 10 // 300 unidades
    });
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('Generación de reporte diario con cálculo de entradas y stock', () => {
    const reporte = reporteService.reporteDiario(sesionSuperadmin, { sedeId: 1, tipoPeriodo: 'HOY' });
    assert.ok(reporte);
    assert.equal(reporte.sede_id, 1);
    assert.equal(reporte.total_entradas, 300);
    assert.equal(reporte.total_despachado_orden, 0);
    assert.equal(reporte.total_salidas_sin_orden, 0);
    assert.equal(reporte.estado_general.estado, 'CONCILIADO');
  });

  test('Filtros de periodos: SEMANA, MES, ANIO, RANGO personalizado', () => {
    const repSemana = reporteService.reporteDiario(sesionSuperadmin, { sedeId: 1, tipoPeriodo: 'SEMANA' });
    assert.ok(repSemana.periodo.startsWith('Semana:'));

    const repMes = reporteService.reporteDiario(sesionSuperadmin, { sedeId: 1, tipoPeriodo: 'MES' });
    assert.ok(repMes.periodo.startsWith('Mes:'));

    const repAnio = reporteService.reporteDiario(sesionSuperadmin, { sedeId: 1, tipoPeriodo: 'ANIO' });
    assert.ok(repAnio.periodo.startsWith('Año:'));

    const repRango = reporteService.reporteDiario(sesionSuperadmin, {
      sedeId: 1,
      tipoPeriodo: 'RANGO',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-12-31'
    });
    assert.ok(repRango.periodo.includes('2026-01-01 al 2026-12-31'));
  });

  test('Filtro por sede: exclusión de movimientos de otras sedes', () => {
    // Crear lote en sede 2
    loteService.crear(sesionSuperadmin, {
      medicamento_id: med.id,
      sede_id: 2,
      numero_lote: 'L-SEDE-2',
      fecha_expedicion: '2026-01-01',
      fecha_vencimiento: '2027-12-31',
      cantidad_cajas: 5 // 150 unidades
    });

    // Reporte para Sede 1 debe mostrar solo 300 entradas
    const repSede1 = reporteService.reporteDiario(sesionSuperadmin, { sedeId: 1 });
    assert.equal(repSede1.total_entradas, 300);

    // Reporte para Sede 2 debe mostrar solo 150 entradas
    const repSede2 = reporteService.reporteDiario(sesionSuperadmin, { sedeId: 2 });
    assert.equal(repSede2.total_entradas, 150);

    // Reporte general (todas las sedes) debe sumar 450 entradas
    const repGeneral = reporteService.reporteDiario(sesionSuperadmin, { sedeId: null });
    assert.equal(repGeneral.total_entradas, 450);
  });

  test('Dashboard resumen con estado consolidado y conteo de alertas', () => {
    // Forma plana: la usa el Dashboard.jsx (estadoConciliacion/stockTotalUnidades).
    const dash = reporteService.dashboard(sesionSuperadmin, { sedeId: 1 });
    assert.ok(dash);
    assert.equal(dash.estadoConciliacion, 'CONCILIADO');
    assert.ok(dash.stockTotalUnidades >= 300);
  });
});
