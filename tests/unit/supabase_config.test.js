const test = require('node:test');
const assert = require('node:assert/strict');
const { crearConfiguracionSupabase } = require('../../backend/config/supabaseConfig');

test('la clave publishable sola no activa la sincronización privilegiada', () => {
  const config = crearConfiguracionSupabase({
    SUPABASE_URL: 'https://proyecto.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
  });

  assert.equal(config.syncHabilitado, false);
  assert.equal(config.SUPABASE_SERVICE_ROLE_KEY, '');
});

test('la sincronización se activa solo con URL y service role', () => {
  const config = crearConfiguracionSupabase({
    SUPABASE_URL: 'https://proyecto.supabase.co///',
    SUPABASE_SERVICE_ROLE_KEY: 'service_role_test'
  });

  assert.equal(config.SUPABASE_URL, 'https://proyecto.supabase.co');
  assert.equal(config.syncHabilitado, true);
});

test('una clave privilegiada sin URL no activa la sincronización', () => {
  const config = crearConfiguracionSupabase({ SUPABASE_SERVICE_ROLE_KEY: 'service_role_test' });
  assert.equal(config.syncHabilitado, false);
});
