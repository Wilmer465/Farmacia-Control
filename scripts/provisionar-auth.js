// Provisiona usuarios locales en Supabase Auth (Fase 0 offline-first).
//
// USO (¡importante por better-sqlite3, ver AGENTS.md!):
//   $env:ELECTRON_RUN_AS_NODE = "1"
//   & ".\node_modules\electron\dist\electron.exe" ".\scripts\provisionar-auth.js" --dry-run
//   & ".\node_modules\electron\dist\electron.exe" ".\scripts\provisionar-auth.js" --aplicar [--solo=usuario]
//
// Comportamiento:
//   * Por defecto es DRY-RUN: lee usuarios ACTIVO y muestra qué haría, sin red ni escrituras.
//   * Con --aplicar: crea/actualiza el usuario en auth.users con la service_role
//     (app_metadata {sede_id texto, rol_nombre, usuario_id}) y guarda el UUID en
//     usuarios.auth_user_id (migración 029). Nunca toca password_hash.
//   * Email sintético '<username>@farmacia.local' (Supabase Auth exige email).
//     La contraseña temporal solo se muestra en consola al crear (rotarla después).
//   * Secretos: solo desde entorno (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
//     Nunca se imprimen valores, solo si faltan.
//
// Códigos de salida: 0 ok, 1 errores, 2 argumentos/ambiente inválidos.
const crypto = require('crypto');

const DOMINIO_SINTETICO = 'farmacia.local';

function ayuda() {
  console.log([
    'Uso: provisionar-auth.js [--dry-run] [--aplicar] [--solo=username] [--help]',
    '',
    '  --dry-run   Muestra el plan sin red ni escrituras (por defecto).',
    '  --aplicar   Crea/actualiza en Supabase Auth y enlaza auth_user_id.',
    '  --solo=X    Limita a un username (comparación case-insensitive).',
    '  --help      Esta ayuda (no toca la base de datos).',
    '',
    'Variables requeridas para --aplicar: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.',
    'Ejecutar con el runtime de Electron (AGENTS.md: better-sqlite3 tiene dos ABI).'
  ].join('\n'));
}

function parsearArgs(argv) {
  const args = { modo: 'dry-run', solo: null, help: false };
  for (const a of argv.slice(2)) {
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.modo = 'dry-run';
    else if (a === '--aplicar') args.modo = 'aplicar';
    else if (a.startsWith('--solo=')) args.solo = a.slice('--solo='.length).trim().toLowerCase();
    else {
      console.error(`Argumento desconocido: ${a}`);
      return null;
    }
  }
  return args;
}

function emailPara(username) {
  return `${String(username).trim().toLowerCase()}@${DOMINIO_SINTETICO}`;
}

function contrasenaTemporal() {
  return crypto.randomBytes(18).toString('base64url');
}

// Carga perezosa: --help nunca toca better-sqlite3 (ABI de Electron).
function cargarUsuarios(solo) {
  const { getDb } = require('../backend/database/connection');
  const db = getDb();
  const filas = db.prepare(`
    SELECT u.id, u.nombre, u.username, u.rol_id, r.nombre AS rol_nombre, u.sede_id, u.estado, u.auth_user_id
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.estado = 'ACTIVO'
    ORDER BY u.id
  `).all();
  if (solo) return filas.filter((f) => String(f.username).toLowerCase() === solo);
  return filas;
}

function appMetadataPara(usuario) {
  return {
    sede_id: usuario.sede_id === null || usuario.sede_id === undefined ? null : String(usuario.sede_id),
    rol_nombre: usuario.rol_nombre,
    usuario_id: usuario.id
  };
}

async function peticionSupabase(base, ruta, key, opciones = {}) {
  const res = await fetch(`${base}/auth/v1/admin/${ruta}`, {
    ...opciones,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(opciones.headers || {})
    }
  });
  const texto = await res.text().catch(() => '');
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = null;
  }
  if (!res.ok) {
    const detalle = (datos && (datos.msg || datos.message || datos.error)) || texto || res.statusText;
    const err = new Error(`Supabase ${res.status}: ${detalle}`);
    err.status = res.status;
    err.datos = datos;
    throw err;
  }
  return datos;
}

async function buscarUsuarioPorEmail(base, key, email) {
  // La API admin no filtra por email: se pagina y se busca en memoria.
  // Volúmenes pequeños (usuarios de farmacia); suficiente para Fase 0.
  let pagina = 1;
  for (;;) {
    const datos = await peticionSupabase(base, `users?page=${pagina}&per_page=100`, key, { method: 'GET' });
    const lista = (datos && datos.users) || [];
    const hallado = lista.find((u) => String(u.email || '').toLowerCase() === email.toLowerCase());
    if (hallado) return hallado;
    if (lista.length < 100) return null;
    pagina += 1;
  }
}

function main() {
  const args = parsearArgs(process.argv);
  if (!args) {
    ayuda();
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    ayuda();
    return;
  }

  let usuarios;
  try {
    usuarios = cargarUsuarios(args.solo);
  } catch (err) {
    console.error(`No se pudo leer la base local: ${err.message}`);
    console.error('Ejecute con el runtime de Electron (ver cabecera del script).');
    process.exitCode = 1;
    return;
  }
  if (args.solo && usuarios.length === 0) {
    console.error(`Sin usuarios ACTIVO con username '${args.solo}'.`);
    process.exitCode = 2;
    return;
  }

  console.log(`Modo: ${args.modo}. Usuarios ACTIVO: ${usuarios.length}.`);
  for (const u of usuarios) {
    const email = emailPara(u.username);
    const meta = appMetadataPara(u);
    const estado = u.auth_user_id ? `enlazado (${u.auth_user_id}) -> actualizar metadata` : 'sin enlace -> crear';
    console.log(`- ${u.username} [${u.rol_nombre}${u.sede_id ? ` sede ${u.sede_id}` : ' global'}] ${email} metadata=${JSON.stringify(meta)} :: ${estado}`);
  }

  if (args.modo === 'dry-run') {
    console.log('Dry-run: sin cambios. Reejecute con --aplicar para provisionar.');
    return;
  }

  const base = (process.env.SUPABASE_URL || '').replace(/,+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
    process.exitCode = 2;
    return;
  }

  (async () => {
    const { getDb } = require('../backend/database/connection');
    const db = getDb();
    const enlazar = db.prepare('UPDATE usuarios SET auth_user_id = ? WHERE id = ?');
    let creados = 0;
    let actualizados = 0;
    let fallos = 0;
    for (const u of usuarios) {
      const email = emailPara(u.username);
      const appMetadata = appMetadataPara(u);
      try {
        const existente = await buscarUsuarioPorEmail(base, key, email);
        if (existente) {
          await peticionSupabase(base, `users/${existente.id}`, key, {
            method: 'PUT',
            body: JSON.stringify({ app_metadata: appMetadata, user_metadata: { nombre: u.nombre, username: u.username } })
          });
          enlazar.run(existente.id, u.id);
          actualizados += 1;
          console.log(`OK actualizado ${u.username} (${existente.id})`);
        } else {
          const temp = contrasenaTemporal();
          const creado = await peticionSupabase(base, 'users', key, {
            method: 'POST',
            body: JSON.stringify({
              email,
              password: temp,
              email_confirm: true,
              app_metadata: appMetadata,
              user_metadata: { nombre: u.nombre, username: u.username }
            })
          });
          enlazar.run(creado.id, u.id);
          creados += 1;
          // Contraseña temporal: solo para el primer acceso, rotarla después.
          console.log(`OK creado ${u.username} (${creado.id}) email=${email} temporal=${temp}`);
        }
      } catch (err) {
        fallos += 1;
        console.error(`FALLO ${u.username}: ${err.message}`);
      }
    }
    console.log(`Resumen: ${creados} creados, ${actualizados} actualizados, ${fallos} fallos.`);
    if (fallos > 0) process.exitCode = 1;
  })().catch((err) => {
    console.error(`Error inesperado: ${err.message}`);
    process.exitCode = 1;
  });
}

if (require.main === module) {
  main();
}

module.exports = { emailPara, appMetadataPara, parsearArgs };
