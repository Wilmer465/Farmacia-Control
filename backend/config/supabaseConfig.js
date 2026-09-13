const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://upghzhklufexfxyldptt.supabase.co').replace(/,+$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hvUNAhYyZJDmDx-fSH7iQg_7Qci8syg';

module.exports = {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
};
