const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');

const API_VERSION = 'v1';
const PREFIJO_API = `/api/${API_VERSION}`;
const PUERTO_POR_DEFECTO = 3000;

// Origenes permitidos: escritorio web en dev, emulador Android (10.0.2.2 es el
// loopback del host), Expo Go (exp://), Capacitor y equipos en red local.
//
// Los rangos RFC1918 se permiten porque el servidor escucha en 0.0.0.0: es la
// forma de probar la app web o un dispositivo fisico apuntando a la IP de la
// maquina. Sin esto, abrir la web en http://192.168.x.x:8081 devuelve 403 y el
// navegador reporta "Network Error", indistinguible de un servidor caido: la
// app cae al login local en silencio y parece que la API no responde.
const PATRONES_ORIGEN_PERMITIDO = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/10\.0\.2\.2(:\d+)?$/,
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/[\w.-]+\.lan(:\d+)?$/,
  /^https?:\/\/[\w.-]+\.local(:\d+)?$/,
  /^exp:\/\//,
  /^capacitor:\/\//i
];

function origenPermitido(origin, callback) {
  // Las apps nativas (Android/iOS) no envian cabecera Origin.
  if (!origin) return callback(null, true);
  if (PATRONES_ORIGEN_PERMITIDO.some((patron) => patron.test(origin))) {
    return callback(null, true);
  }
  return callback(new Error(`Origen no permitido por CORS: ${origin}`));
}

function crearApp() {
  const app = express();

  app.disable('x-powered-by');
  // Cabeceras mínimas (sin dependencia helmet): evitan MIME-sniffing,
  // clickjacking del login y fuga de referrer por LAN sin TLS.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(
    cors({
      origin: origenPermitido,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(`${PREFIJO_API}/auth`, authRoutes);

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Recurso no encontrado.', code: 'NO_ENCONTRADO' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ ok: false, error: 'JSON inválido en el cuerpo de la petición.', code: 'JSON_INVALIDO' });
    }
    if (err && /CORS/.test(err.message || '')) {
      return res.status(403).json({ ok: false, error: 'Origen no permitido.', code: 'ORIGEN_NO_PERMITIDO' });
    }
    console.error('[api] error no controlado:', err);
    return res.status(500).json({ ok: false, error: 'Error interno. Intente nuevamente.' });
  });

  return app;
}

// El servidor vive dentro del proceso principal de Electron para compartir la
// misma conexion de better-sqlite3 y el mismo Map de sesiones que usan los
// handlers IPC. Puerto configurable con API_PORT / API_HOST.
//
// Por defecto escucha SOLO en loopback (127.0.0.1): exponer 0.0.0.0 publica el
// login (con tokens Bearer en claro, sin TLS) a toda la LAN. Para móvil físico
// en red local, exporte explícitamente API_HOST=0.0.0.0 aceptando el riesgo.
function iniciarServidorHttp(opciones = {}) {
  const puerto = Number(opciones.puerto ?? process.env.API_PORT ?? PUERTO_POR_DEFECTO);
  const host = opciones.host ?? process.env.API_HOST ?? '127.0.0.1';
  const app = opciones.app ?? crearApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(puerto, host, () => {
      const { port } = server.address();
      console.log(`[api] Autenticacion HTTP escuchando en http://localhost:${port}${PREFIJO_API}/auth`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { crearApp, iniciarServidorHttp, API_VERSION, PREFIJO_API, PUERTO_POR_DEFECTO };
