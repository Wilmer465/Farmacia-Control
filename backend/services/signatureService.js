// Servicio de firma en pad Wacom STU-540 (STU SDK directo).
//
// Arquitectura: Renderer --IPC--> Main --spawn--> stu-bridge.exe (helper x64
// compilado con csc.exe, P/Invoke a wgssSTU.dll x64 2.18.0.82 instalada con
// el SDK) --USB--> STU-540. El renderer nunca toca código nativo.
//
// El helper devuelve UNA línea JSON por stdout. Aquí se valida, se calcula
// SHA-256 del PNG y se arma el sobre con metadatos (listo para el futuro
// almacenamiento como archivo controlado: identificador/ruta/hash/fecha).
// Por hoy la imagen viaja como data-URL igual que el canvas (pipeline
// existente validado + tope 2 MB): justificación técnica documentada en
// docs/stu540.md. En logs solo metadatos, nunca trazos ni imágenes.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const NOMBRE_EXE = 'stu-bridge.exe';
const TIMEOUT_DETECTAR_MS = 15000;
const MARGEN_CAPTURA_MS = 20000;
const MAX_PNG_BYTES = 2 * 1024 * 1024; // mismo tope que firma en BD

// Seam para pruebas: permite inyectar otra ruta del helper.
let rutaForzada = null;
function setHelperPathForTests(ruta) {
  rutaForzada = ruta || null;
}

// Una sola captura a la vez: el pad se abre con bloqueo exclusivo y dos
// helpers concurrentes colisionarían (rc=6 genérico en la apertura).
let capturaEnCurso = false;

// Seam para pruebas: opciones extra de spawn (p. ej. { shell: true } para
// ejecutar simulados .cmd). En producción siempre es {}.
let opcionesSpawnExtra = {};
function __setOpcionesSpawn(opciones) {
  opcionesSpawnExtra = opciones || {};
}

function rutaHelper() {
  if (rutaForzada) return rutaForzada;
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) {
      return path.join(process.resourcesPath, 'native', 'stu-bridge', NOMBRE_EXE);
    }
  } catch {
    // fuera del proceso main de Electron (tests): ruta de desarrollo
  }
  return path.join(__dirname, '..', '..', 'native', 'stu-bridge', 'bin', NOMBRE_EXE);
}

class SignatureError extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'SignatureError';
    this.codigo = codigo;
  }
}

const MENSAJES = {
  SIN_DISPOSITIVO: 'Pad STU-540 no detectado por USB. Conéctelo e intente de nuevo.',
  MODELO_NO_SOPORTADO: 'El pad conectado no es un STU-540.',
  OCUPADO: 'El pad está ocupado por otra aplicación. Ciérrela e intente de nuevo.',
  DESCONECTADO: 'El pad se desconectó durante la operación.',
  TIMEOUT: 'Tiempo de espera agotado en el pad.',
  CANCELADO: 'Captura cancelada en el pad.',
  FIRMA_VACIA: 'Sin trazos de firma en el pad.',
  CIFRADO_NO_NEGOCIADO: 'El pad no aceptó el canal cifrado. Reconéctelo e intente de nuevo.',
  CLAVE_INVALIDA: 'El pad entregó una clave inválida. Reconéctelo e intente de nuevo.',
  ERROR_SDK: 'Error del SDK del pad.',
  ERROR_INESPERADO: 'Fallo interno del puente del pad.',
  HELPER_NO_ENCONTRADO:
    'Puente del pad no compilado. Ejecute: pnpm run compilar:stu-bridge',
  PAD_OCUPADO_LOCAL:
    'Ya hay una captura en curso en el pad. Espere a que termine.',
  TIMEOUT_LOCAL: 'El puente del pad no respondió a tiempo.',
  RESPUESTA_INVALIDA: 'Respuesta inválida del puente del pad.'
};

function mensajePara(codigo, detalle) {
  const base = MENSAJES[codigo] || 'Error del pad de firma.';
  return detalle && (codigo === 'ERROR_SDK' || codigo === 'ERROR_INESPERADO')
    ? `${base} ${detalle}`
    : base;
}

function ejecutarHelper(argumentos, timeoutMs, exeForzado) {
  const exe = exeForzado || rutaHelper();
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(exe)) {
      reject(new SignatureError('HELPER_NO_ENCONTRADO', MENSAJES.HELPER_NO_ENCONTRADO));
      return;
    }
    let child;
    try {
      child = spawn(exe, argumentos, { windowsHide: true, ...opcionesSpawnExtra });
    } catch (err) {
      reject(new SignatureError('ERROR_SDK', `No se pudo lanzar el puente: ${err.message}`));
      return;
    }
    let salida = '';
    let errores = '';
    const temporizador = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new SignatureError('TIMEOUT_LOCAL', MENSAJES.TIMEOUT_LOCAL));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      salida += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      errores += d.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(temporizador);
      reject(new SignatureError('ERROR_SDK', `Fallo lanzando el puente: ${err.message}`));
    });
    child.on('close', () => {
      clearTimeout(temporizador);
      if (errores.trim()) {
        // Solo diagnóstico operativo del helper (sin biométricos por diseño).
        console.error('[signatureService] puente stderr:', errores.trim().slice(0, 500));
      }
      const lineas = salida.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      // El proceso nativo puede escribir chatter DESPUÉS del JSON (p. ej.
      // libzkfp imprime diagnóstico a stdout al salir): no asumir que la
      // última línea es la respuesta. Se busca la última línea que sea JSON
      // válido y empiece con '{'.
      let respuesta = null;
      for (const candidata of lineas) {
        if (!candidata.startsWith('{')) continue;
        try {
          respuesta = JSON.parse(candidata);
        } catch {
          // candidata no válida: seguir buscando
        }
      }
      // [TMP-DIAG] logging temporal de diagnóstico (Main/service).
      // Sin biométricos: solo conteos y chatter técnico corto (nunca base64
      // largo, que podría ser imagen/plantilla).
      const chatter = lineas
        .filter((l) => !l.startsWith('{') && !/^[A-Za-z0-9+/=]{100,}$/.test(l))
        .slice(0, 3)
        .map((l) => l.slice(0, 120));
      console.debug('[Main] helper stdout: ' + lineas.length + ' líneas, JSON detectado: ' +
        (respuesta ? 'sí' : 'no') + (chatter.length ? ', chatter: ' + JSON.stringify(chatter) : ''));
      if (!respuesta) {
        reject(new SignatureError('RESPUESTA_INVALIDA', MENSAJES.RESPUESTA_INVALIDA));
        return;
      }
      resolve(respuesta);
    });
  });
}

function validarRespuestaCaptura(respuesta) {
  if (!respuesta || typeof respuesta !== 'object') {
    throw new SignatureError('RESPUESTA_INVALIDA', MENSAJES.RESPUESTA_INVALIDA);
  }
  if (respuesta.ok !== true) {
    const codigo = respuesta.codigo || 'ERROR_SDK';
    throw new SignatureError(codigo, mensajePara(codigo, respuesta.error));
  }
  const pngB64 = respuesta.pngBase64;
  if (typeof pngB64 !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(pngB64)) {
    throw new SignatureError('RESPUESTA_INVALIDA', MENSAJES.RESPUESTA_INVALIDA);
  }
  const cuerpo = pngB64.replace(/\s+/g, '');
  const bytes = Buffer.from(cuerpo, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PNG_BYTES) {
    throw new SignatureError('RESPUESTA_INVALIDA', MENSAJES.RESPUESTA_INVALIDA);
  }
  return { cuerpo, bytes };
}

async function detectar() {
  const respuesta = await ejecutarHelper(['detectar'], TIMEOUT_DETECTAR_MS);
  if (!respuesta || respuesta.ok !== true) {
    const codigo = (respuesta && respuesta.codigo) || 'ERROR_SDK';
    throw new SignatureError(codigo, mensajePara(codigo, respuesta && respuesta.error));
  }
  return {
    disponible: Array.isArray(respuesta.dispositivos) && respuesta.dispositivos.length > 0,
    dispositivos: respuesta.dispositivos || []
  };
}

async function capturar(opciones = {}) {
  if (capturaEnCurso) {
    throw new SignatureError(
      'PAD_OCUPADO_LOCAL', 'Ya hay una captura en curso en el pad. Espere a que termine.');
  }
  capturaEnCurso = true;
  try {
    const nombre = String(opciones.nombre || 'Receptor').slice(0, 120);
    const documento = String(opciones.documento || '-').slice(0, 40);
    const motivo = String(opciones.motivo || 'Recepción de medicamentos').slice(0, 160);
    let timeoutSeg = Number(opciones.timeoutSeg || 120);
    if (!Number.isFinite(timeoutSeg) || timeoutSeg < 10) timeoutSeg = 10;
    if (timeoutSeg > 600) timeoutSeg = 600;

    const respuesta = await ejecutarHelper(
      ['capturar', '--nombre', nombre, '--documento', documento,
        '--motivo', motivo, '--timeout', String(timeoutSeg)],
      timeoutSeg * 1000 + MARGEN_CAPTURA_MS
    );
    const { cuerpo, bytes } = validarRespuestaCaptura(respuesta);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    return {
      dataUrl: `data:image/png;base64,${cuerpo}`,
      origen: respuesta.origen || 'STU-540',
      modelo: respuesta.modelo || null,
      sha256,
      tamanoBytes: bytes.length,
      trazos: respuesta.trazos ?? null,
      duracionSeg: respuesta.duracionSeg ?? null,
      capturadaEn: new Date().toISOString()
    };
  } finally {
    capturaEnCurso = false;
  }
}

module.exports = { detectar, capturar, setHelperPathForTests, ejecutarHelper, __setOpcionesSpawn, SignatureError };
