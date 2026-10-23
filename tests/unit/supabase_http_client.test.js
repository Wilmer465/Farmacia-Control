const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  bytesDelCuerpo,
  esReintentableMetodo,
  solicitarConReintentos
} = require('../../backend/services/supabaseHttpClient');

test('calcula bytes de cuerpos de texto y binarios', () => {
  assert.equal(bytesDelCuerpo('á'), 2);
  assert.equal(bytesDelCuerpo(Buffer.from([1, 2, 3])), 3);
  assert.equal(bytesDelCuerpo(null), 0);
});

test('solo reintenta POST con upsert idempotente', () => {
  assert.equal(esReintentableMetodo('POST', { Prefer: 'resolution=merge-duplicates,return=minimal' }), true);
  assert.equal(esReintentableMetodo('POST', { 'x-upsert': 'true' }), true);
  assert.equal(esReintentableMetodo('POST', { 'Content-Type': 'application/json' }), false);
  assert.equal(esReintentableMetodo('GET'), true);
});

test('reintenta 5xx con backoff y cuenta todos los cuerpos HTTP', async () => {
  const respuestas = [
    new Response('temporal', { status: 503 }),
    new Response('aceptado', { status: 200 })
  ];
  const intentos = [];
  const esperas = [];
  const resultado = await solicitarConReintentos('https://supabase.test/rest/v1/sync_records', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: '[{"id":1}]'
  }, {
    fetchImpl: async () => respuestas.shift(),
    esperarImpl: async (ms) => esperas.push(ms),
    alIntento: (intento) => intentos.push(intento)
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.texto, 'aceptado');
  assert.equal(resultado.reintentos, 1);
  assert.deepEqual(esperas, [500]);
  assert.equal(intentos.length, 2);
  assert.equal(intentos[0].bytesRecibidos, Buffer.byteLength('temporal'));
  assert.equal(intentos[1].reintento, true);
  assert.equal(intentos[0].bytesEnviados, Buffer.byteLength('[{"id":1}]'));
});

test('respeta Retry-After y no reintenta errores 4xx permanentes', async () => {
  const esperas = [];
  const respuesta = await solicitarConReintentos('https://supabase.test/rest/v1/sync_records', {
    method: 'GET'
  }, {
    fetchImpl: async () => new Response('esperar', { status: 429, headers: { 'Retry-After': '2' } }),
    esperarImpl: async (ms) => esperas.push(ms),
    maxReintentos: 1,
    ahora: () => 0
  });
  assert.equal(respuesta.ok, false);
  assert.deepEqual(esperas, [2000]);

  let solicitudes = 0;
  const permanente = await solicitarConReintentos('https://supabase.test/rest/v1/sync_records', {
    method: 'GET'
  }, {
    fetchImpl: async () => { solicitudes += 1; return new Response('no autorizado', { status: 401 }); },
    esperarImpl: async () => assert.fail('No debe esperar ante 401')
  });
  assert.equal(permanente.status, 401);
  assert.equal(solicitudes, 1);
});

test('reintenta errores de red solo para operaciones idempotentes', async () => {
  let solicitudesGet = 0;
  const get = await solicitarConReintentos('https://supabase.test/rest/v1/sync_records', { method: 'GET' }, {
    fetchImpl: async () => {
      solicitudesGet += 1;
      if (solicitudesGet === 1) throw new TypeError('network error');
      return new Response('[]', { status: 200 });
    },
    esperarImpl: async () => {}
  });
  assert.equal(get.ok, true);
  assert.equal(get.reintentos, 1);

  let solicitudesPost = 0;
  await assert.rejects(solicitarConReintentos('https://supabase.test/rest/v1/rpc', {
    method: 'POST', body: '{}'
  }, {
    fetchImpl: async () => { solicitudesPost += 1; throw new TypeError('network error'); },
    esperarImpl: async () => {}
  }));
  assert.equal(solicitudesPost, 1);
});
