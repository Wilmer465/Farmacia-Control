// Estas credenciales se leen solo del entorno; nunca se incluyen en el renderer.
// La sincronización actual usa service_role y debe ejecutarse únicamente en un
// entorno de escritorio controlado. No distribuir esa clave en instaladores.
function crearConfiguracionSupabase(env = process.env) {
  const SUPABASE_URL = (env.SUPABASE_URL || '').replace(/[\/,]+$/, '');
  const SUPABASE_ANON_KEY = env.SUPABASE_PUBLISHABLE_KEY || '';
  const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';

  return {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    // cloudSyncService exige service_role. Una publishable key por sí sola no
    // satisface esa interfaz y no debe activar el planificador.
    syncHabilitado: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  };
}

module.exports = { ...crearConfiguracionSupabase(), crearConfiguracionSupabase };
