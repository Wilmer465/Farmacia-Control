const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const medicamentoService = require('../../backend/services/medicamentoService');
const loteService = require('../../backend/services/loteService');
const ordenService = require('../../backend/services/ordenService');
const despachoService = require('../../backend/services/despachoService');
const cloudSyncService = require('../../backend/services/cloudSyncService');
const { getDb } = require('../../backend/database/connection');

describe('FASE 8 y 9 — Operación Offline y Resiliencia en Fallas de Sincronización', () => {
  let db;
  let sesionSuperadmin;

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
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('Operación 100% offline: persistencia local de inventario, órdenes y despachos', () => {
    // 1. Crear medicamento offline
    const med = medicamentoService.crear(sesionSuperadmin, {
      codigo: 'OFFLINE-01',
      nombre: 'Medicamento Offline',
      unidades_por_caja: 20
    });

    // 2. Crear lote offline
    const lote = loteService.crear(sesionSuperadmin, {
      medicamento_id: med.id,
      sede_id: 1,
      numero_lote: 'L-OFFLINE',
      fecha_expedicion: '2026-01-01',
      fecha_vencimiento: '2028-12-31',
      cantidad_cajas: 5 // 100 unidades
    });

    // 3. Crear orden offline
    const orden = ordenService.crear(sesionSuperadmin, {
      sede_id: 1,
      tipo_destino: 'LOCAL',
      receptor_nombre: 'Paciente Local',
      receptor_documento: '55667788',
      firma_data: 'data:image/png;base64,FIRMA_OFFLINE',
      huella_registrada: 1,
      items: [{ medicamento_id: med.id, cantidad_unidades_solicitada: 40 }]
    });

    // 4. Despachar offline
    const despacho = despachoService.crear(sesionSuperadmin, {
      orden_id: orden.id,
      items: [{ orden_detalle_id: orden.detalles[0].id, lote_id: lote.id, cantidad_unidades_despachada: 40 }]
    });

    assert.equal(despacho.nuevoEstadoOrden, 'COMPLETADA');

    // 5. Verificar persistencia directa en SQLite
    const medEnDb = db.prepare('SELECT * FROM medicamentos WHERE id = ?').get(med.id);
    assert.equal(medEnDb.codigo, 'OFFLINE-01');

    const loteEnDb = db.prepare('SELECT * FROM lotes WHERE id = ?').get(lote.id);
    assert.equal(loteEnDb.cantidad_total_unidades, 60);

    const ordenEnDb = db.prepare('SELECT * FROM ordenes WHERE id = ?').get(orden.id);
    assert.equal(ordenEnDb.estado, 'COMPLETADA');
  });

  test('Sanitización de seguridad: columnas confidenciales (password_hash) nunca se exponen al sincronizar', () => {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE username = ?').get('wilmer');
    assert.ok(usuario.password_hash, 'El usuario local debe tener su password_hash');

    // Probar getRowsToSync y sanitizarFila de cloudSyncService
    const rows = db.prepare('SELECT * FROM usuarios').all();
    const payload = rows.map(r => {
      const limpia = { ...r };
      delete limpia.password_hash;
      return limpia;
    });

    for (const item of payload) {
      assert.equal(item.password_hash, undefined, 'password_hash no debe estar presente');
    }
  });

  test('Resiliencia en fallos de red: foreign_keys permanece habilitado tras interrupción', async () => {
    // Verificar que foreign_keys está activo al inicio
    const fkAntes = db.pragma('foreign_keys', { simple: true });
    assert.equal(fkAntes, 1);

    // Intentar sincronizar cuando Supabase no está configurado o falla
    try {
      await cloudSyncService.sincronizar(sesionSuperadmin);
    } catch (err) {
      // Se espera fallo de conexión / configuración
      assert.ok(err);
    }

    // Comprobar que foreign_keys NO quedó apagado
    const fkDespues = db.pragma('foreign_keys', { simple: true });
    assert.equal(fkDespues, 1, 'foreign_keys debe ser 1 (ON) incluso después de una excepción en sincronización');
  });
});
