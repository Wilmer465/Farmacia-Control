import { Migration } from '../SQLiteService';

// Hash SHA-256 que sembraba la migracion 001 antes de pasar a bcrypt. Cualquier
// dispositivo o navegador que ejecuto la app antes de ese cambio conserva este
// valor en `usuarios.password_hash`, y como 001 usa INSERT OR IGNORE nunca se
// reescribe. Sin esta migracion el login local de `admin` falla con
// "Contrasena incorrecta" en esos equipos, porque bcrypt no puede comparar un
// hash SHA-256.
const HASH_SHA256_LEGADO = 'cffda391c13fe300acbee9de2f180cc62b92da0c77d06cdfc52def93fdb7303a';

// bcrypt (coste 12) de 'admin123*', el mismo valor y formato que usa
// `AuthService.verifyPassword` (bcryptjs) y que el backend siembra en la base
// central, de modo que login remoto y login local comparten credenciales.
const HASH_BCRYPT_ADMIN = '$2a$12$JUvGaw13XEm44DjzTwGLJ.vyEfwUmb.CUEXvbcpJIe70qV6pFUESi';

export const migration027: Migration = {
  version: 27,
  name: '027_admin_bcrypt',
  up: async (db: any) => {
    // Solo se reescribe el hash legado conocido. Si el usuario cambio su
    // contrasena, su hash es distinto y esta migracion no lo toca.
    const resultado = await db.runAsync(
      'UPDATE usuarios SET password_hash = ? WHERE password_hash = ?',
      [HASH_BCRYPT_ADMIN, HASH_SHA256_LEGADO]
    );

    if (resultado.changes > 0) {
      console.log(
        `[migration 027] ${resultado.changes} usuario(s) migrados de SHA-256 a bcrypt para 'admin'.`
      );
    }
  },
  down: async (db: any) => {
    // Irreversible por diseno: no se puede volver a SHA-256 sin perder la
    // verificacion por bcrypt. El hash sembrado original es solo un marcador.
    console.warn('[migration 027] down no soportado: la migracion a bcrypt es irreversible.');
  }
};
