import { Migration } from '../SQLiteService';

// Espejo móvil de la migración 029 del backend (Fase 0 offline-first).
//
// `auth_user_id` enlaza la fila local con `auth.users` de Supabase
// (provisionado con service_role, nunca desde el móvil).
// NULL hasta el provisionamiento; UNIQUE para el enlace 1:1.
// No sustituye `password_hash` del login local con bcrypt.
export const migration029: Migration = {
  version: 29,
  name: '029_usuarios_auth_user_id',
  up: async (db: any) => {
    const info = await db.getAllAsync('PRAGMA table_info(usuarios)');
    const columnas = (info as any[]).map((c) => c.name);

    if (!columnas.includes('auth_user_id')) {
      await db.execAsync('ALTER TABLE usuarios ADD COLUMN auth_user_id TEXT;');
    }

    await db.execAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_auth_user_id ON usuarios(auth_user_id);'
    );
  },
  down: async (db: any) => {
    await db.execAsync('DROP INDEX IF EXISTS idx_usuarios_auth_user_id;');
    const info = await db.getAllAsync('PRAGMA table_info(usuarios)');
    const columnas = (info as any[]).map((c) => c.name);
    if (columnas.includes('auth_user_id')) {
      await db.execAsync('ALTER TABLE usuarios DROP COLUMN auth_user_id;');
    }
  }
};
