'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '../..');

function leerArchivo(relativa) {
  return fs.readFileSync(path.join(RAIZ, relativa), 'utf8');
}

function listarArchivos(directorio) {
  const absoluto = path.join(RAIZ, directorio);
  const resultado = [];
  const pendientes = [absoluto];

  while (pendientes.length) {
    const actual = pendientes.pop();
    for (const entrada of fs.readdirSync(actual, { withFileTypes: true })) {
      const ruta = path.join(actual, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name !== 'node_modules') pendientes.push(ruta);
      } else if (entrada.isFile()) {
        resultado.push(ruta);
      }
    }
  }
  return resultado;
}

function contenidoFuentes(directorio) {
  return listarArchivos(directorio)
    .filter((ruta) => /\.(?:js|jsx|ts|tsx|json|css|html)$/i.test(ruta))
    .map((ruta) => ({ ruta, texto: fs.readFileSync(ruta, 'utf8') }));
}

describe('Ausencia de credenciales privilegiadas en el renderer', () => {
  test('src no contiene service_role, secretos DIAN, process.env ni acceso directo a Electron', () => {
    const archivos = contenidoFuentes('src');
    assert.ok(archivos.length > 0);

    const prohibidos = [
      /SUPABASE_SERVICE_ROLE_KEY/i,
      /\bservice_role\b/i,
      /DIAN_CERTIFICATE_PASSWORD/i,
      /DIAN_CERTIFICATE_PATH/i,
      /DIAN_SOFTWARE_PIN/i,
      /DIAN_TECHNICAL_KEY/i,
      /BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY/i,
      /\bprocess\.env\b/,
      /\bipcRenderer\b/,
      /\bwindow\.require\b/,
      /require\(\s*['"]electron['"]\s*\)/
    ];

    for (const { ruta, texto } of archivos) {
      for (const patron of prohibidos) {
        assert.doesNotMatch(texto, patron, `${path.relative(RAIZ, ruta)} contiene ${patron}`);
      }
    }
  });

  test('el preload solo carga electron y no contiene credenciales ni variables de entorno', () => {
    const source = leerArchivo('electron/preload.js');
    const requires = [...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    assert.deepEqual(requires, ['electron']);

    for (const patron of [
      /SUPABASE/i,
      /\bservice_role\b/i,
      /DIAN_/,
      /\bprocess\.env\b/,
      /PRIVATE KEY/i
    ]) {
      assert.doesNotMatch(source, patron);
    }
  });

  test('main.js mantiene el aislamiento del renderer y niega permisos por defecto', () => {
    const source = leerArchivo('electron/main.js');

    assert.match(source, /contextIsolation:\s*true/);
    assert.match(source, /nodeIntegration:\s*false/);
    assert.match(source, /sandbox:\s*true/);
    assert.match(source, /webSecurity:\s*true/);
    assert.match(source, /allowRunningInsecureContent:\s*false/);
    assert.match(source, /webviewTag:\s*false/);
    assert.match(source, /nodeIntegrationInWorker:\s*false/);
    assert.match(source, /nodeIntegrationInSubFrames:\s*false/);
    assert.match(source, /navigateOnDragDrop:\s*false/);
    assert.match(source, /devTools:\s*isDev/);
    assert.doesNotMatch(source, /contextIsolation:\s*false/);
    assert.doesNotMatch(source, /nodeIntegration:\s*true/);
    assert.doesNotMatch(source, /sandbox:\s*false/);

    assert.match(source, /setPermissionRequestHandler\([\s\S]*?callback\(false\)/);
    assert.match(source, /setPermissionCheckHandler\(\(\)\s*=>\s*false\)/);
    assert.match(source, /will-navigate/);
    assert.match(source, /will-redirect/);
    assert.match(source, /will-attach-webview/);
    assert.match(source, /setWindowOpenHandler/);
    assert.match(source, /esAperturaExternaPermitida/);
  });

  test('.env está ignorado y el ejemplo no trae valores reales', () => {
    const gitignore = leerArchivo('.gitignore');
    assert.match(gitignore, /^\.env$/m);
    assert.match(gitignore, /^data\/$/m);
    assert.match(gitignore, /^\*\.db$/m);

    const ejemplo = leerArchivo('.env.example');
    for (const linea of ejemplo.split(/\r?\n/)) {
      const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
      if (coincidencia) {
        assert.equal(coincidencia[2], '', `${coincidencia[1]} no debe tener valor en .env.example`);
      }
    }
  });

  test('la configuración móvil usa solo la clave pública anon', () => {
    const config = leerArchivo('mobile-app/src/constants/config.ts');
    assert.match(config, /EXPO_PUBLIC_SUPABASE_ANON_KEY/);
    assert.match(config, /EXPO_PUBLIC_SUPABASE_URL/);
    assert.doesNotMatch(config, /SERVICE_ROLE_KEY/);
    assert.doesNotMatch(config, /EXPO_PUBLIC_SUPABASE_SERVICE/);

    const archivosMoviles = contenidoFuentes('mobile-app/src');
    for (const { ruta, texto } of archivosMoviles) {
      assert.doesNotMatch(texto, /SUPABASE_SERVICE_ROLE_KEY/, path.relative(RAIZ, ruta));
      assert.doesNotMatch(texto, /EXPO_PUBLIC_SUPABASE_SERVICE/, path.relative(RAIZ, ruta));
    }
  });

  test('el empaquetado no incluye .env ni define secretos en Vite', () => {
    const paquete = JSON.parse(leerArchivo('package.json'));
    const archivos = paquete.build?.files || [];
    assert.equal(archivos.some((patron) => /\.env/i.test(patron)), false);
    assert.equal(JSON.stringify(paquete.build || {}).includes('.env'), false);

    const vite = leerArchivo('vite.config.js');
    assert.doesNotMatch(vite, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(vite, /define\s*:/);
    assert.doesNotMatch(vite, /process\.env/);
  });
});
