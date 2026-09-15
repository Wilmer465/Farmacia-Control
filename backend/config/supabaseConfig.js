// SEGURIDAD: credenciales SOLO desde variables de entorno. Sin fallbacks hardcoded:
// si no hay .env, el sync queda deshabilitado con error claro en vez de exponer
// una key en el código fuente (y por ende en el bundle de la app).
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/,+$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// El service_role se usa SOLO en main para sync (nunca se expone al renderer).
// Si existe, tiene prioridad sobre la publishable key.
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY;

module.exports = {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  syncHabilitado: Boolean(SUPABASE_URL && SUPABASE_KEY)
};
