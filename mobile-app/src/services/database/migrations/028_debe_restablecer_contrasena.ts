import { Migration } from '../SQLiteService';

// Contraparte móvil de la migración 023 del backend.
//
// Cuando una fila de `usuarios` llega desde Supabase sin credencial, la app
// debe insertarla con un hash aleatorio inservible y este flag en 1, para que
// el usuario vea el restablecimiento en vez de un "Contrasena incorrecta" que
// no distingue "olvidé la contraseña" de "esta cuenta no tiene contraseña".
//
// `password_hash` es NOT NULL en el esquema (001_init), así que el valor
// aleatorio es obligatorio; solo cumple el papel de placeholder.
export const migration028: Migration = {
  version: 28,
  name: '028_debe_restablecer_contrasena',
  up: async (db: any) => {
    const info = await db.getAllAsync('PRAGMA table_info(usuarios)');
    const columnas = (info as any[]).map((c) => c.name);

    if (!columnas.includes('debe_restablecer_contrasena')) {
      await db.execAsync(
        'ALTER TABLE usuarios ADD COLUMN debe_restablecer_contrasena INTEGER NOT NULL DEFAULT 0;'
      );
    }

    await db.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_usuarios_restablecer ON usuarios(debe_restablecer_contrasena);'
    );
  },
  down: async (db: any) => {
    await db.execAsync('DROP INDEX IF EXISTS idx_usuarios_restablecer;');
    await db.execAsync('ALTER TABLE usuarios DROP COLUMN debe_restablecer_contrasena;');
  }
};