const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const medicamentoService = require('../../backend/services/medicamentoService');
const loteService = require('../../backend/services/loteService');
const barcodeService = require('../../backend/services/barcodeService');

describe('FASE 3 — Unit Tests: Medicamentos, Lotes y Códigos de Barras', () => {
  let db;
  let sesionSuperadmin;

  beforeEach(() => {
    db = createTestDb();
    sesionSuperadmin = {
      id: 1,
      nombre: 'Superadmin',
      username: 'superadmin',
      rol_nombre: 'SUPERADMIN',
      sede_id: null
    };
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('Crear medicamento exitoso y rechazo de código duplicado', () => {
    const med = medicamentoService.crear(sesionSuperadmin, {
      codigo: 'MED-001',
      nombre: 'Acetaminofén 500mg',
      principio_activo: 'Paracetamol',
      presentacion: 'Caja x 100 tabletas',
      unidad_medida: 'TABLETA',
      unidades_por_caja: 100
    });
    assert.ok(med.id);
    assert.equal(med.codigo, 'MED-001');

    assert.throws(
      () => medicamentoService.crear(sesionSuperadmin, {
        codigo: 'MED-001',
        nombre: 'Otro nombre',
        unidad_medida: 'TABLETA',
        unidades_por_caja: 20
      }),
      /Ya existe un medicamento con ese código/
    );
  });

  test('Crear lote calcula stock en unidades e inserta movimiento de ENTRADA', () => {
    const med = medicamentoService.crear(sesionSuperadmin, {
      codigo: 'IBU-400',
      nombre: 'Ibuprofeno 400mg',
      unidad_medida: 'TABLETA',
      unidades_por_caja: 50
    });

    const lote = loteService.crear(sesionSuperadmin, {
      medicamento_id: med.id,
      sede_id: 1,
      numero_lote: 'LOTE-2026-A',
      fecha_expedicion: '2026-01-01',
      fecha_vencimiento: '2027-12-31',
      cantidad_cajas: 10,
      cantidad_unidades_sueltas: 0
    });

    assert.ok(lote.id);
    assert.equal(lote.cantidad_total_unidades, 500);
    assert.equal(lote.estado, 'DISPONIBLE');
  });

  test('Cálculo correcto de estados de lote: DISPONIBLE, PROXIMO_VENCER, VENCIDO, AGOTADO', () => {
    const med = medicamentoService.crear(sesionSuperadmin, {
      codigo: 'AMOX-500',
      nombre: 'Amoxicilina 500mg',
      unidad_medida: 'TABLETA',
      unidades_por_caja: 20
    });

    // 1. Agotado (unidades = 0). calcularEstado es puro: no hace falta persistir
    // (el validador exige >0 unidades al crear, así que un 0 solo llega por
    // despacho total o ajuste a cero).
    const loteAgotado = {
      medicamento_id: med.id,
      numero_lote: 'L-AGOTADO',
      cantidad_total_unidades: 0,
      fecha_vencimiento: '2027-12-31'
    };
    assert.equal(loteService.calcularEstado(loteAgotado), 'AGOTADO');

    // 2. Vencido (fecha vencimiento en el pasado)
    const loteVencido = {
      medicamento_id: med.id,
      numero_lote: 'L-VENCIDO',
      cantidad_total_unidades: 10,
      fecha_vencimiento: '2025-01-01'
    };
    assert.equal(loteService.calcularEstado(loteVencido), 'VENCIDO');

    // 3. Próximo a vencer (dentro de 30 días)
    const fechaProxima = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const loteProximo = {
      medicamento_id: med.id,
      numero_lote: 'L-PROXIMO',
      cantidad_total_unidades: 20,
      fecha_vencimiento: fechaProxima
    };
    assert.equal(loteService.calcularEstado(loteProximo), 'PROXIMO_VENCER');

    // 4. Disponible (dentro de 365 días)
    const fechaFutura = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const loteDisponible = {
      medicamento_id: med.id,
      numero_lote: 'L-DISP',
      cantidad_total_unidades: 50,
      fecha_vencimiento: fechaFutura
    };
    assert.equal(loteService.calcularEstado(loteDisponible), 'DISPONIBLE');
  });

  test('Validación y parseo de códigos de barras (EAN-13, GS1, DataMatrix)', () => {
    // EAN-13 válido con dígito de control correcto (prefijo 770205770001 → check 0;
    // el antiguo '...018' era inválido y el test pasaba un fixture roto).
    assert.equal(barcodeService.validarEAN13('7702057700010'), true);
    assert.equal(barcodeService.validarEAN13('7702057700019'), false); // dígito malo
    assert.equal(barcodeService.parsearEntradaLector('7702057700019').data.valido, false); // roto => no válido

    // Parseo GS1 DataMatrix con AI (01) GTIN y (10) Lote
    const codigoGS1 = '(01)07702057700018(10)LOT12345(17)261231';
    const resultadoGS1 = barcodeService.detectarYParsear(codigoGS1);
    assert.equal(resultadoGS1.tipo, 'GS1');
    assert.equal(resultadoGS1.gtin, '07702057700018');
    assert.equal(resultadoGS1.lote, 'LOT12345');
    assert.equal(resultadoGS1.vencimiento, '2026-12-31');

    // Parseo de entrada de lector directa
    const scan = barcodeService.parsearEntradaLector('7702057700010');
    assert.equal(scan.ok, true);
    assert.equal(scan.data.valido, true);
    assert.equal(scan.data.gtin, '7702057700010');
  });
});
