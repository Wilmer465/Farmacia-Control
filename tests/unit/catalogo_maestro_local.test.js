const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const { setTestDb } = require('../../backend/database/connection');
const { runMigrations } = require('../../backend/database/migrate');
const { seed } = require('../../backend/database/seeds/seed');
const catalogoCumService = require('../../backend/services/catalogoCumService');
const recepcionService = require('../../backend/services/recepcionService');
const medicamentoService = require('../../backend/services/medicamentoService');
const loteService = require('../../backend/services/loteService');
const cloudSyncService = require('../../backend/services/cloudSyncService');

const sesion = { id: 1, nombre: 'Superadmin', username: 'superadmin', rol_nombre: 'SUPERADMIN', sede_id: null };
const filasFixture = [
  { expediente: '90001', consecutivocum: '1', producto: 'MARCA PRUEBA 500 MG', titular: 'TITULAR CO', registrosanitario: 'INVIMA 2024M-0000001', estadoregistro: 'Vigente', estadocum: 'Activo', principioactivo: 'ACTIVO A', concentracion: '500 mg', formafarmaceutica: 'TABLETA', viaadministracion: 'ORAL', ium: 'IUM-TEST-1', nombrerol: 'FABRICANTE CO', tiporol: 'FABRICANTE' },
  { expediente: '90001', consecutivocum: '1', producto: 'MARCA PRUEBA 500 MG', titular: 'TITULAR CO', registrosanitario: 'INVIMA 2024M-0000001', estadoregistro: 'Vigente', estadocum: 'Activo', principioactivo: 'ACTIVO B', concentracion: '500 mg', formafarmaceutica: 'TABLETA', viaadministracion: 'ORAL', ium: 'IUM-TEST-1', nombrerol: 'IMPORTADOR CO', tiporol: 'IMPORTADOR' }
];

describe('Catálogo maestro local INVIMA', () => {
  let db;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => teardownTestDb());

  test('importa duplicados de expediente/CUM como un producto con activos y roles consolidados', async () => {
    const resultado = await catalogoCumService.actualizarCatalogo(sesion, { descargar: async () => filasFixture });
    assert.equal(resultado.ok, true);
    assert.equal(resultado.nuevos, 1);
    assert.equal(resultado.sinCambios, 0);
    const producto = db.prepare('SELECT * FROM catalogo_cum WHERE cum = ?').get('90001-1');
    assert.equal(producto.principio_activo, 'ACTIVO A + ACTIVO B');
    assert.equal(producto.fabricante, 'FABRICANTE CO');
    assert.equal(producto.importador, 'IMPORTADOR CO');
    assert.equal(producto.ium, 'IUM-TEST-1');
    const origen = JSON.parse(producto.proveniencia_json);
    assert.equal(origen.producto.estado, 'VERIFICADO');
    assert.equal(origen.producto.fuente, 'INVIMA_DATOS_ABIERTOS');
    const segundaImportacion = await catalogoCumService.actualizarCatalogo(sesion, { forzar: true, descargar: async () => [...filasFixture].reverse() });
    assert.equal(segundaImportacion.actualizados, 0);
    assert.equal(segundaImportacion.sinCambios, 1);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM sqlite_master WHERE name = 'catalogo_cum_temp'").get().total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM sqlite_temp_master WHERE name = 'catalogo_cum_temp'").get().total, 0);
  });

  test('busca fragmentos de principio activo, fabricante, concentración y marca con FTS5', async () => {
    const conPresentacion = filasFixture.map((fila) => ({ ...fila, descripcioncomercial: 'Caja x 10 tabletas' }));
    await catalogoCumService.actualizarCatalogo(sesion, { descargar: async () => conPresentacion });
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'catalogo_cum_fts'").get() !== undefined, true);
    assert.equal(catalogoCumService.buscarPorProducto('TIVO A')[0].cum, '90001-1');
    assert.equal(catalogoCumService.buscarPorProducto('ANTE CO')[0].cum, '90001-1');
    assert.equal(catalogoCumService.buscarPorProducto('500 mg')[0].cum, '90001-1');
    assert.equal(catalogoCumService.buscarPorProducto('MARCA PRUEBA')[0].cum, '90001-1');
    assert.equal(catalogoCumService.buscarPorProducto('Caja x 10')[0].cum, '90001-1');
  });

  test('los disparadores FTS mantienen el índice después de una actualización del catálogo', async () => {
    await catalogoCumService.actualizarCatalogo(sesion, { descargar: async () => filasFixture });
    const actualizadas = filasFixture.map((fila) => ({ ...fila, producto: 'MARCA NUEVA 750 MG' }));
    const resultado = await catalogoCumService.actualizarCatalogo(sesion, { forzar: true, descargar: async () => actualizadas });
    assert.equal(resultado.actualizados, 1);
    assert.equal(catalogoCumService.buscarPorProducto('MARCA NUEVA')[0].cum, '90001-1');
    assert.equal(catalogoCumService.buscarPorProducto('MARCA PRUEBA').length, 0);
  });

  test('la búsqueda textual conserva fallback LIKE para términos cortos y SQLite sin FTS', async () => {
    await catalogoCumService.actualizarCatalogo(sesion, { descargar: async () => filasFixture });
    const migracion = require('../../backend/database/migrations/037_catalogo_busqueda_fts');
    migracion.down(db);
    assert.equal(catalogoCumService.buscarPorProducto('mg')[0].cum, '90001-1');
    assert.equal(catalogoCumService.buscarPorProducto('ACTIVO A')[0].cum, '90001-1');
  });

  test('dos instalaciones mantienen catálogos y hashes locales independientes', async () => {
    const dbPc1 = db;
    const filaPc1 = { ...filasFixture[0], expediente: '91001', consecutivocum: '1', producto: 'PC UNO' };
    await catalogoCumService.actualizarCatalogo(sesion, { descargar: async () => [filaPc1] });
    const hashPc1 = dbPc1.prepare('SELECT hash_archivo FROM catalogo_actualizaciones WHERE resultado = ?').get('EXITO').hash_archivo;
    const pc1Producto = dbPc1.prepare('SELECT producto FROM catalogo_cum WHERE cum = ?').get('91001-1').producto;
    const pc1TienePc2 = dbPc1.prepare('SELECT COUNT(*) total FROM catalogo_cum WHERE cum = ?').get('91002-1').total;

    const dbPc2 = new Database(':memory:');
    setTestDb(dbPc2);
    runMigrations(dbPc2);
    seed({ db: dbPc2, isTest: true });
    const filaPc2 = { ...filasFixture[0], expediente: '91002', consecutivocum: '1', producto: 'PC DOS' };
    await catalogoCumService.actualizarCatalogo(sesion, { descargar: async () => [filaPc2] });
    const hashPc2 = dbPc2.prepare('SELECT hash_archivo FROM catalogo_actualizaciones WHERE resultado = ?').get('EXITO').hash_archivo;

    assert.notEqual(hashPc1, hashPc2);
    assert.equal(pc1Producto, 'PC UNO');
    assert.equal(pc1TienePc2, 0);
    assert.equal(dbPc2.prepare('SELECT producto FROM catalogo_cum WHERE cum = ?').get('91002-1').producto, 'PC DOS');
    assert.equal(dbPc2.prepare('SELECT COUNT(*) total FROM catalogo_cum WHERE cum = ?').get('91001-1').total, 0);
  });

  test('tolera IUM y campos opcionales ausentes sin inventarlos y conserva el estado sanitario', async () => {
    const fila = { ...filasFixture[0], expediente: '90002', consecutivocum: '1', producto: 'PRODUCTO INACTIVO', ium: null, estadocum: 'Inactivo' };
    const resultado = await catalogoCumService.actualizarCatalogo(sesion, { descargar: async () => [fila] });
    assert.equal(resultado.ok, true);
    const producto = db.prepare('SELECT * FROM catalogo_cum WHERE cum = ?').get('90002-1');
    assert.equal(producto.ium, null);
    assert.equal(producto.gtin, null);
    assert.equal(producto.estado_cum, 'INACTIVO');
    assert.equal(Object.hasOwn(JSON.parse(producto.proveniencia_json), 'ium'), false);
  });

  test('el catálogo de referencia queda fuera del allowlist de sincronización en nube', () => {
    assert.equal(cloudSyncService.SYNC_TABLES.includes('catalogo_cum'), false);
    assert.equal(cloudSyncService.SYNC_TABLES.includes('catalogo_empaques'), false);
    assert.equal(cloudSyncService.SYNC_TABLES.includes('catalogo_actualizaciones'), false);
    assert.equal(cloudSyncService.SYNC_TABLES.includes('catalogo_codigos_pendientes'), false);
    assert.equal(cloudSyncService.esFilaCatalogoLocal('auditoria', { modulo: 'CATALOGO_CUM' }), true);
    assert.equal(cloudSyncService.esFilaCatalogoLocal('auditoria', { modulo: 'INVENTARIO' }), false);
    assert.equal(cloudSyncService.esFilaCatalogoLocal('medicamentos', { modulo: 'CATALOGO_CUM' }), false);
  });

  test('los eventos de auditoría del catálogo tampoco se envían en la sincronización', async () => {
    await catalogoCumService.actualizarCatalogo(sesion, { descargar: async () => filasFixture });
    const auditoriasSinCatalogo = cloudSyncService.getRowsToSync(db, 'auditoria');
    assert.equal(auditoriasSinCatalogo.some((fila) => fila.modulo === 'CATALOGO_CUM'), false);
    const todasLasAuditorias = db.prepare('SELECT * FROM auditoria').all();
    assert.equal(todasLasAuditorias.some((fila) => fila.modulo === 'CATALOGO_CUM'), true);
  });

  test('una falla de descarga conserva el catálogo anterior y registra el error', async () => {
    await catalogoCumService.actualizarCatalogo(sesion, { descargar: async () => filasFixture });
    const antes = db.prepare('SELECT COUNT(*) AS total FROM catalogo_cum').get().total;
    const resultado = await catalogoCumService.actualizarCatalogo(sesion, { forzar: true, descargar: async () => { throw new Error('sin conexión'); } });
    assert.equal(resultado.ok, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM catalogo_cum').get().total, antes);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM catalogo_actualizaciones WHERE resultado = 'ERROR'").get().total, 1);
  });

  test('interrupción después de un bloque descargado conserva la versión anterior', async () => {
    await catalogoCumService.actualizarCatalogo(sesion, { descargar: async () => filasFixture });
    const antes = db.prepare('SELECT cum, producto, hash_fila FROM catalogo_cum ORDER BY cum').all();
    const fetchOriginal = global.fetch;
    let solicitudes = 0;
    global.fetch = async () => {
      solicitudes += 1;
      if (solicitudes === 1) return { ok: true, json: async () => Array.from({ length: 5000 }, () => filasFixture[0]) };
      throw new Error('conexión interrumpida');
    };
    try {
      const resultado = await catalogoCumService.actualizarCatalogo(sesion, { forzar: true });
      assert.equal(resultado.ok, false);
      assert.equal(solicitudes, 2);
      assert.deepEqual(db.prepare('SELECT cum, producto, hash_fila FROM catalogo_cum ORDER BY cum').all(), antes);
    } finally { global.fetch = fetchOriginal; }
  });

  test('la búsqueda local conocida funciona offline sin tocar inventario ni red', async () => {
    db.prepare(`INSERT INTO catalogo_cum (expediente, consecutivocum, cum, producto, registro_sanitario, version_catalogo, gtin)
      VALUES (90006, 1, '90006-1', 'PRODUCTO CONOCIDO', 'RS-OFFLINE', 'test', '7702057700034')`).run();
    const fetchOriginal = global.fetch;
    let solicitudes = 0;
    global.fetch = async () => { solicitudes += 1; throw new Error('offline'); };
    try {
      const resultado = await recepcionService.procesarEscaneo(sesion, '7702057700034');
      assert.equal(resultado.catalogo.cum, '90006-1');
      assert.equal(solicitudes, 0);
      assert.equal(db.prepare('SELECT COUNT(*) total FROM medicamentos').get().total, 0);
      assert.equal(db.prepare('SELECT COUNT(*) total FROM lotes').get().total, 0);
      assert.equal(db.prepare('SELECT COUNT(*) total FROM movimientos_inventario').get().total, 0);
    } finally { global.fetch = fetchOriginal; }
  });

  test('GTIN que corresponde a más de un CUM se devuelve como ambiguo', () => {
    const insert = db.prepare(`INSERT INTO catalogo_cum (expediente, consecutivocum, cum, producto, registro_sanitario, version_catalogo, gtin) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insert.run(90001, 1, '90001-1', 'PRODUCTO A', 'RS-A', 'test', '7702057700010');
    insert.run(90002, 1, '90002-1', 'PRODUCTO B', 'RS-B', 'test', '7702057700010');
    const resultado = catalogoCumService.buscarPorGTIN('7702057700010');
    assert.equal(resultado.ambigua, true);
    assert.equal(resultado.candidatos.length, 2);
  });

  test('GTIN empaquetado admite lectura UPC-A normalizada y entrega el nivel encontrado', () => {
    const upc = '036000291452';
    const ean13Normalizado = `0${upc}`;
    db.prepare(`INSERT INTO catalogo_cum (expediente, consecutivocum, cum, producto, registro_sanitario, version_catalogo, gtin)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(90003, 1, '90003-1', 'PRODUCTO UPC', 'RS-UPC', 'test', ean13Normalizado);
    const resultado = catalogoCumService.buscarPorGTIN(upc);
    assert.equal(resultado.cum, '90003-1');
    assert.equal(resultado.nivel_encontrado, 3);
  });

  test('la búsqueda GTIN encontrada no modifica existencias, lotes ni movimientos', async () => {
    db.prepare(`INSERT INTO catalogo_cum (expediente, consecutivocum, cum, producto, registro_sanitario, version_catalogo, gtin)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(90004, 1, '90004-1', 'PRODUCTO GTIN', 'RS-GTIN', 'test', '7702057700010');
    const antes = {
      medicamentos: db.prepare('SELECT COUNT(*) total FROM medicamentos').get().total,
      lotes: db.prepare('SELECT COUNT(*) total FROM lotes').get().total,
      movimientos: db.prepare('SELECT COUNT(*) total FROM movimientos_inventario').get().total
    };
    const resultado = await recepcionService.procesarEscaneo(sesion, '7702057700010');
    assert.equal(resultado.catalogo.cum, '90004-1');
    assert.equal(resultado.gtin, '7702057700010');
    assert.deepEqual({
      medicamentos: db.prepare('SELECT COUNT(*) total FROM medicamentos').get().total,
      lotes: db.prepare('SELECT COUNT(*) total FROM lotes').get().total,
      movimientos: db.prepare('SELECT COUNT(*) total FROM movimientos_inventario').get().total
    }, antes);
  });

  test('solo la operación explícita de recepción crea medicamento, lote y movimiento', async () => {
    const insertado = db.prepare(`INSERT INTO catalogo_cum (
      expediente, consecutivocum, cum, producto, descripcioncomercial, principio_activo,
      concentracion, forma_farmaceutica, registro_sanitario, version_catalogo, gtin
    ) VALUES (90005, 1, '90005-1', 'PRODUCTO PARA RECEPCION', 'Caja x 10', 'ACTIVO C', '100 mg', 'TABLETA', 'RS-REC', 'test', '7702057700041')`).run();
    const inventarioAntes = {
      medicamentos: db.prepare('SELECT COUNT(*) AS total FROM medicamentos').get().total,
      lotes: db.prepare('SELECT COUNT(*) AS total FROM lotes').get().total,
      movimientos: db.prepare('SELECT COUNT(*) AS total FROM movimientos_inventario').get().total
    };
    const recibido = await recepcionService.registrarRecepcion(sesion, {
      catalogo_cum_id: insertado.lastInsertRowid,
      lote: 'LOTE-E2E-1',
      fecha_vencimiento: '2027-12-31',
      cantidad: 2,
      sede_id: 1
    });
    assert.equal(recibido.medicamento.nombre, 'PRODUCTO PARA RECEPCION');
    assert.deepEqual({
      medicamentos: db.prepare('SELECT COUNT(*) AS total FROM medicamentos').get().total,
      lotes: db.prepare('SELECT COUNT(*) AS total FROM lotes').get().total,
      movimientos: db.prepare('SELECT COUNT(*) AS total FROM movimientos_inventario').get().total
    }, {
      medicamentos: inventarioAntes.medicamentos + 1,
      lotes: inventarioAntes.lotes + 1,
      movimientos: inventarioAntes.movimientos + 1
    });
  });

  test('código desconocido queda pendiente local sin conectividad y no crea inventario', async () => {
    const fetchOriginal = global.fetch;
    global.fetch = async () => { throw new Error('sin conexión'); };
    try {
      const resultado = await recepcionService.procesarEscaneo(sesion, '7702057700010');
      const repetido = await recepcionService.procesarEscaneo(sesion, '7702057700010');
      assert.equal(resultado.catalogo, null);
      assert.equal(repetido.catalogo, null);
      assert.equal(resultado.requiere_registro_manual, true);
      assert.equal(db.prepare('SELECT COUNT(*) AS total FROM catalogo_codigos_pendientes').get().total, 1);
      assert.equal(db.prepare('SELECT cantidad_escaneos FROM catalogo_codigos_pendientes').get().cantidad_escaneos, 2);
      assert.equal(db.prepare('SELECT COUNT(*) AS total FROM medicamentos').get().total, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS total FROM lotes').get().total, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS total FROM movimientos_inventario').get().total, 0);
    } finally { global.fetch = fetchOriginal; }
  });

  test('EAN con checksum inválido no se busca ni queda en la cola pendiente', async () => {
    const resultado = await recepcionService.procesarEscaneo(sesion, '7702057700011');
    assert.equal(resultado.ok, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM catalogo_codigos_pendientes').get().total, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM medicamentos').get().total, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM lotes').get().total, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM movimientos_inventario').get().total, 0);
  });

  test('la actualización fallida preserva los medicamentos y lotes del inventario', async () => {
    const medicamento = medicamentoService.crear(sesion, { codigo: 'LOCAL-1', nombre: 'Medicamento local', unidad_medida: 'TABLETA', unidades_por_caja: 10 });
    loteService.crear(sesion, { medicamento_id: medicamento.id, sede_id: 1, numero_lote: 'LOTE-1', fecha_expedicion: '2026-01-01', fecha_vencimiento: '2027-12-31', cantidad_cajas: 2, cantidad_unidades_sueltas: 0 });
    const medicamentosAntes = db.prepare('SELECT COUNT(*) AS total FROM medicamentos').get().total;
    const lotesAntes = db.prepare('SELECT COUNT(*) AS total FROM lotes').get().total;
    await catalogoCumService.actualizarCatalogo(sesion, { forzar: true, descargar: async () => { throw new Error('falla simulada'); } });
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM medicamentos').get().total, medicamentosAntes);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM lotes').get().total, lotesAntes);
  });

  test('una falla de auditoría después del merge revierte el catálogo y conserva inventario', async () => {
    await catalogoCumService.actualizarCatalogo(sesion, { descargar: async () => filasFixture });
    const antes = db.prepare('SELECT cum, producto, hash_fila FROM catalogo_cum ORDER BY cum').all();
    db.exec(`CREATE TRIGGER fallar_auditoria_catalogo BEFORE INSERT ON auditoria
      WHEN NEW.modulo = 'CATALOGO_CUM' BEGIN SELECT RAISE(ABORT, 'fallo de auditoría'); END`);
    const fixtureActualizada = filasFixture.map((fila) => ({ ...fila, producto: 'NUEVA MARCA' }));
    const resultado = await catalogoCumService.actualizarCatalogo(sesion, { forzar: true, descargar: async () => fixtureActualizada });
    assert.equal(resultado.ok, false);
    assert.deepEqual(db.prepare('SELECT cum, producto, hash_fila FROM catalogo_cum ORDER BY cum').all(), antes);
    assert.equal(catalogoCumService.buscarPorProducto('MARCA PRUEBA')[0].cum, '90001-1');
    assert.equal(catalogoCumService.buscarPorProducto('NUEVA MARCA').length, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM medicamentos').get().total, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM lotes').get().total, 0);
  });
});
