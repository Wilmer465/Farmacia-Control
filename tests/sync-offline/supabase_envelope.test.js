// Contrato offline-first Supabase (Fases 0-3).
//
// Solo módulos puros de shared/: sin better-sqlite3, corre con Node CLI y con
// Electron. Verifica la convención que desktop, móvil y RLS deben compartir:
// record_id namespaced, sanitizado, marcas temporales, blobs por referencia,
// LWW y el espejo JS de `fila_sync_visible`.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const sobre = require('../../shared/syncPayload');
const sobreEnv = require('../../shared/syncEnvelope');

describe('record_id namespaced (evita colisiones entre sedes)', () => {
  test('tabla de sede usa su sede_id', () => {
    assert.equal(sobre.construirRecordIdParaFila('lotes', { id: 5, sede_id: 3 }, 'id'), '3:lotes:5');
  });

  test('tabla global ignora la sede', () => {
    assert.equal(sobre.construirRecordIdParaFila('catalogo_cum', { id: 9, sede_id: 3 }, 'id'), 'global:catalogo_cum:9');
  });

  test('sin sede cae a global (no revienta)', () => {
    assert.equal(sobre.construirRecordIdParaFila('lotes', { id: 5 }, 'id'), 'global:lotes:5');
  });

  test('parsear roundtrip y rechazo de formato', () => {
    assert.deepEqual(sobre.parsearRecordId('3:lotes:5'), { ambito: '3', tabla: 'lotes', id: '5' });
    assert.equal(sobre.parsearRecordId('5'), null);
    assert.equal(sobre.parsearRecordId('a:b:c:d'), null);
    assert.equal(sobre.parsearRecordId(42), null);
  });

  test('dos sedes con mismo id local no colisionan', () => {
    const a = sobre.construirRecordIdParaFila('lotes', { id: 5, sede_id: 1 }, 'id');
    const b = sobre.construirRecordIdParaFila('lotes', { id: 5, sede_id: 2 }, 'id');
    assert.notEqual(a, b);
  });
});

describe('sanitizado (secretos nunca a la nube)', () => {
  test('elimina password_hash case-insensitive y conserva el resto', () => {
    const fila = { id: 1, username: 'ana', password_hash: 'x', Password: 'y', TOKEN: 'z', sede_id: 1 };
    const limpia = sobre.sanitizarFila(fila);
    assert.equal(limpia.password_hash, undefined);
    assert.equal(limpia.Password, undefined);
    assert.equal(limpia.TOKEN, undefined);
    assert.equal(limpia.username, 'ana');
    // no muta el original
    assert.equal(fila.password_hash, 'x');
  });

  test('no-objetos pasan intactos', () => {
    assert.equal(sobre.sanitizarFila(null), null);
    assert.equal(sobre.sanitizarFila(7), 7);
  });
});

describe('marca temporal del cambio', () => {
  test('orden de preferencia y fallback', () => {
    assert.equal(sobre.extraerMarcaTemporal({ updated_at: 'U', created_at: 'C' }), 'U');
    assert.equal(sobre.extraerMarcaTemporal({ created_at: 'C' }), 'C');
    assert.equal(sobre.extraerMarcaTemporal({ fecha_importacion: 'F' }), 'F');
    assert.equal(sobre.extraerMarcaTemporal({}, 'FB'), 'FB');
  });
});

describe('blobs por referencia (umbral 64 KB)', () => {
  test('solo campos declarados y sobre el umbral', () => {
    assert.equal(sobre.debeExternalizar('nombre', 'x'.repeat(70000)), false);
    assert.equal(sobre.debeExternalizar('firma_data', 'x'.repeat(100)), false);
    assert.equal(sobre.debeExternalizar('firma_data', 'x'.repeat(65536)), false);
    assert.equal(sobre.debeExternalizar('firma_data', 'x'.repeat(65537)), true);
  });

  test('descriptores no se re-suben', () => {
    const d = sobre.descriptorBlob('1/lotes/1:lotes:1/firma_data', 'abc', 70000);
    assert.equal(sobre.esDescriptorBlob(d), true);
    assert.equal(sobre.debeExternalizar('firma_data', JSON.stringify(d)), false);
  });

  test('ruta y descriptor con formato pactado', () => {
    assert.equal(sobre.rutaBlob('3', 'lotes', '3:lotes:5', 'firma_data'), '3/lotes/3:lotes:5/firma_data');
    const d = sobre.descriptorBlob('ref', 'sha', 10);
    assert.deepEqual(d, { __blob_ref: 'ref', __sha256: 'sha', __size: 10 });
  });
});

describe('LWW (last-writer-wins, empate gana servidor)', () => {
  test('matriz básica', () => {
    assert.equal(sobre.compararLWW('2026-01-01', '2026-01-02'), -1);
    assert.equal(sobre.compararLWW('2026-01-02', '2026-01-01'), 1);
    assert.equal(sobre.compararLWW('2026-01-02', '2026-01-02'), 0);
    assert.equal(sobre.compararLWW(null, '2026-01-02'), -1);
  });

  test('escenario convergencia: edición offline pierde contra servidor más nuevo', () => {
    // Móvil editó a las 10:00 sin red; desktop subió a las 11:00.
    // Al bajar, compararLWW(10:00, 11:00) = -1 -> conflicto, se aplica servidor.
    const localTs = '2026-10-09T10:00:00.000Z';
    const serverTs = '2026-10-09T11:00:00.000Z';
    assert.equal(sobre.compararLWW(localTs, serverTs), -1);
    // Y al revés no hay conflicto: lo local ya es lo más nuevo.
    assert.equal(sobre.compararLWW(serverTs, localTs), 1);
  });
});

describe('visibilidad por sede (espejo de RLS fila_sync_visible)', () => {
  test('SUPERADMIN ve todo', () => {
    assert.equal(sobre.filaVisibleParaSede({ tabla: 'lotes', data: { sede_id: 9 }, sedeId: 1, rol: 'SUPERADMIN' }), true);
  });

  test('globales visibles para cualquier sede', () => {
    for (const t of sobreEnv.TABLAS_GLOBALES) {
      assert.equal(sobre.filaVisibleParaSede({ tabla: t, data: {}, sedeId: 2, rol: 'USUARIO' }), true);
    }
  });

  test('sede propia sí, ajena no', () => {
    const base = { tabla: 'ordenes', rol: 'INVENTARIO' };
    assert.equal(sobre.filaVisibleParaSede({ ...base, data: { sede_id: 3 }, sedeId: 3 }), true);
    assert.equal(sobre.filaVisibleParaSede({ ...base, data: { sede_id: 4 }, sedeId: 3 }), false);
    assert.equal(sobre.filaVisibleParaSede({ ...base, data: { sede_id: '3' }, sedeId: 3 }), true);
  });

  test('compatibilidad legacy: fila global vieja sin sede_id', () => {
    assert.equal(sobre.filaVisibleParaSede({ tabla: 'lotes', data: {}, recordId: 'global:lotes:5', sedeId: 3, rol: 'ADMIN' }), true);
    assert.equal(sobre.filaVisibleParaSede({ tabla: 'lotes', data: {}, recordId: '9:lotes:5', sedeId: 3, rol: 'ADMIN' }), false);
  });
});

describe('sobre y normalización SQLite', () => {
  test('construirSobre con forma pactada', () => {
    const s = sobre.construirSobre('lotes', { id: 5, sede_id: 3, password_hash: 'x', updated_at: 'T' }, 'id');
    assert.equal(s.table_name, 'lotes');
    assert.equal(s.record_id, '3:lotes:5');
    assert.equal(s.data.password_hash, undefined);
    assert.equal(s.local_updated_at, 'T');
  });

  test('objetos van como texto a SQLite', () => {
    const n = sobre.normalizarValoresFila({ id: 1, firma_data: { __blob_ref: 'r', __sha256: 'h', __size: 1 }, n: 2 });
    assert.equal(typeof n.firma_data, 'string');
    assert.deepEqual(JSON.parse(n.firma_data), { __blob_ref: 'r', __sha256: 'h', __size: 1 });
    assert.equal(n.n, 2);
  });
});
