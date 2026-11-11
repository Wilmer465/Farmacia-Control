// Capa de abstracción del dispositivo biométrico (sección 15 del spec).
// El resto del sistema NUNCA debe hablar directamente con un lector de huellas:
// siempre pasa por esta interfaz.
//
// Lector ZKTeco ZK9500: Renderer --IPC--> Main --spawn--> zk-bridge.exe
// (helper x64, P/Invoke a C:\Windows\System32\libzkfp.dll instalada) --USB-->.
// Se reutiliza el ejecutor genérico de signatureService (spawn + timeout +
// JSON); aquí solo viven los mensajes y el sobre propios de huella.
//
// Alcance: CONSTANCIA de captura (dedo presente + plantilla válida en
// memoria). No se guardan ni registran imágenes ni plantillas (Ley 1581).

const path = require('path');
const signatureService = require('./signatureService');

const NOMBRE_EXE = 'zk-bridge.exe';
const TIMEOUT_DEDO_MS = 30000;
const MARGEN_CAPTURA_MS = 15000;

// Una sola captura a la vez (igual que el pad: el lector no admite aperturas
// concurrentes del mismo proceso de captura).
let capturaEnCurso = false;

// Seam para pruebas (misma convención que signatureService).
let rutaForzada = null;
function setHelperPathForTests(ruta) {
  rutaForzada = ruta || null;
}

function rutaHelper() {
  if (rutaForzada) return rutaForzada;
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) {
      return path.join(process.resourcesPath, 'native', 'zk-bridge', NOMBRE_EXE);
    }
  } catch {
    // fuera del proceso main de Electron (tests): ruta de desarrollo
  }
  return path.join(__dirname, '..', '..', 'native', 'zk-bridge', 'bin', NOMBRE_EXE);
}

class BiometricError extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'BiometricError';
    this.codigo = codigo;
  }
}

const MENSAJES = {
  SIN_LECTOR: 'Lector biométrico no conectado. La huella queda pendiente.',
  APERTURA_FALLIDA: 'No se pudo abrir el lector de huellas. Ciérrelo en otra aplicación e intente de nuevo.',
  TIMEOUT_DEDO: 'Sin dedo en el lector dentro del plazo. Intente de nuevo.',
  LECTOR_OCUPADO: 'Ya hay una captura de huella en curso. Espere a que termine.',
  HELPER_NO_ENCONTRADO:
    'Puente del lector no compilado. Ejecute: pnpm run compilar:zk-bridge',
  TIMEOUT_LOCAL: 'El puente del lector no respondió a tiempo.',
  RESPUESTA_INVALIDA: 'Respuesta inválida del puente del lector.',
  ERROR_SDK: 'Error del lector biométrico.'
};

function mensajePara(codigo, detalle) {
  const base = MENSAJES[codigo] || 'Error del lector biométrico.';
  return detalle && (codigo === 'ERROR_SDK' || codigo === 'ERROR_INESPERADO')
    ? `${base} ${detalle}`
    : base;
}

class BiometricService {
  async capturarHuella() {
    if (capturaEnCurso) {
      return {
        capturada: false,
        dispositivo: 'ZK9500',
        timestamp: new Date().toISOString(),
        mensaje: MENSAJES.LECTOR_OCUPADO
      };
    }
    capturaEnCurso = true;
    try {
      // [TMP-DIAG] logging temporal: llamada al helper (sin biométricos).
      console.debug('[Main] biometricService.capturarHuella: llamando al helper zk-bridge (capturar, timeout ' +
        (TIMEOUT_DEDO_MS / 1000) + 's)');
      const respuesta = await signatureService.ejecutarHelper(
        ['capturar', '--timeout', String(TIMEOUT_DEDO_MS / 1000)],
        TIMEOUT_DEDO_MS + MARGEN_CAPTURA_MS,
        rutaHelper()
      );
      // [TMP-DIAG] resumen sin biométricos: solo estado y metadatos.
      console.debug('[Main] biometricService.capturarHuella: helper respondió ok=' +
        Boolean(respuesta && respuesta.ok) + ' codigo=' + ((respuesta && respuesta.codigo) || 'null') +
        ' lectores=' + ((respuesta && respuesta.lectores) ?? 'null') +
        ' tamPlantilla=' + ((respuesta && respuesta.tamanoPlantilla) ?? 'null'));
      if (!respuesta || respuesta.ok !== true) {
        const codigo = (respuesta && respuesta.codigo) || 'ERROR_SDK';
        return {
          capturada: false,
          dispositivo: 'ZK9500',
          timestamp: new Date().toISOString(),
          mensaje: mensajePara(codigo, respuesta && respuesta.error)
        };
      }
      return {
        capturada: true,
        dispositivo: 'ZK9500',
        tamanoPlantilla: respuesta.tamanoPlantilla ?? null,
        duracionSeg: respuesta.duracionSeg ?? null,
        timestamp: new Date().toISOString(),
        verificada: false,
        estado: 'CAPTURA_SIN_VERIFICAR',
        mensaje: 'Captura recibida; la identidad no fue verificada contra un enrolamiento.'
      };
    } catch (err) {
      const codigo = (err && err.codigo) || 'ERROR_SDK';
      return {
        capturada: false,
        dispositivo: 'ZK9500',
        timestamp: new Date().toISOString(),
        mensaje: mensajePara(codigo, err && err.message)
      };
    } finally {
      capturaEnCurso = false;
    }
  }
}

module.exports = new BiometricService();
module.exports.BiometricError = BiometricError;
module.exports.setHelperPathForTests = setHelperPathForTests;
