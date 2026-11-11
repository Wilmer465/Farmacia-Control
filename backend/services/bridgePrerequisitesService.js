'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { MACHINE_X64, parsearPe, PeInspectionError } = require('./peStaticInspector');

const VERSION_WACOM_REQUERIDA = '2.18.0.82';
function rutasAplicacion() {
  const raizProyecto = path.resolve(__dirname, '..', '..');
  const raizRecursos = process.resourcesPath || null;
  const programFiles = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]
    .filter(Boolean);
  const candidatosWacom = [
    raizRecursos && path.join(raizRecursos, 'native', 'stu-bridge', 'wgssSTU.dll'),
    path.join(raizProyecto, 'native', 'stu-bridge', 'bin', 'wgssSTU.dll'),
    ...programFiles.flatMap((root) => [
      path.join(root, 'Wacom STU SDK', 'C', 'bin', 'x64', 'wgssSTU.dll'),
      path.join(root, 'Wacom SigCaptX STU', 'wgssSTU.dll')
    ])
  ];
  const system32 = path.join(process.env.WINDIR || 'C:\\Windows', 'System32');
  return Object.freeze({
    candidatosWacom: Object.freeze(candidatosWacom.filter(Boolean)),
    candidatosZk: Object.freeze([
      raizRecursos && path.join(raizRecursos, 'native', 'zk-bridge', 'libzkfp.dll'),
      path.join(raizProyecto, 'native', 'zk-bridge', 'bin', 'libzkfp.dll'),
      path.join(system32, 'libzkfp.dll')
    ].filter(Boolean)),
    zkSystem32: system32
  });
}

const RUTAS = rutasAplicacion();

const EXPORTS_WACOM = Object.freeze([
  'WacomGSS_getUsbDevices', 'WacomGSS_free', 'WacomGSS_getException',
  'WacomGSS_UsbInterface_create_1', 'WacomGSS_Interface_disconnect',
  'WacomGSS_Interface_free', 'WacomGSS_Tablet_create_1', 'WacomGSS_Tablet_attach',
  'WacomGSS_Tablet_getInformation', 'WacomGSS_Tablet_getCapability',
  'WacomGSS_Tablet_setClearScreen', 'WacomGSS_Tablet_setInkingMode',
  'WacomGSS_Tablet_startCapture', 'WacomGSS_Tablet_endCapture',
  'WacomGSS_Tablet_disconnect', 'WacomGSS_Tablet_free',
  'WacomGSS_Tablet_interfaceQueue', 'WacomGSS_InterfaceQueue_try_getReport',
  'WacomGSS_ProtocolHelper_writeImage', 'WacomGSS_Tablet_writeImage',
  'WacomGSS_Tablet_getStatus', 'WacomGSS_Tablet_setPenDataOptionMode',
  'WacomGSS_Tablet_getDHprime', 'WacomGSS_Tablet_getDHbase',
  'WacomGSS_Protocol_setHostPublicKey', 'WacomGSS_Tablet_getDevicePublicKey',
  'WacomGSS_Protocol_setStartCapture', 'WacomGSS_Protocol_setEndCapture',
  'WacomGSS_Tablet_setHandwritingThicknessColor', 'WacomGSS_Tablet_setBackgroundColor'
]);

const EXPORTS_ZK = Object.freeze([
  'ZKFPM_Init', 'ZKFPM_Terminate', 'ZKFPM_GetDeviceCount', 'ZKFPM_OpenDevice',
  'ZKFPM_CloseDevice', 'ZKFPM_GetParameters', 'ZKFPM_GetCaptureParamsEx',
  'ZKFPM_AcquireFingerprint', 'ZKFPM_CreateDBCache', 'ZKFPM_CloseDBCache',
  'ZKFPM_MatchFinger', 'ZKFPM_DBGetParameter'
]);

const DLLS_WINDOWS_CONOCIDAS = new Set([
  'kernel32.dll', 'oleaut32.dll', 'user32.dll', 'advapi32.dll', 'shlwapi.dll',
  'iphlpapi.dll', 'setupapi.dll', 'hid.dll', 'version.dll', 'winhttp.dll',
  'ole32.dll', 'gdi32.dll', 'comctl32.dll', 'ws2_32.dll', 'bcrypt.dll',
  'crypt32.dll', 'secur32.dll', 'ntdll.dll', 'rpcrt4.dll', 'msvcrt.dll'
]);
const DEPENDENCIAS_ZK_REQUERIDAS = Object.freeze(['ZKFPCap.dll', 'fpslib.dll']);

const URLS_INSTALACION = Object.freeze({
  wacomSdk: 'https://developer.wacom.com/downloads',
  wacomDriver: 'https://developer-support.wacom.com/hc/en-us/articles/9354527258007-STU-Driver-Installation',
  zkSdk: 'https://www.zkteco.com/en/ZKFingerSDKforWindows'
});

function check(estado, codigo, mensaje, extra = {}) {
  return { estado, codigo, mensaje, ...extra };
}

function resumirChecks(checks) {
  if (checks.some((item) => item.estado === 'error_inspeccion')) return 'error_inspeccion';
  if (checks.some((item) => item.estado === 'archivo_faltante')) return 'archivo_faltante';
  if (checks.some((item) => item.estado === 'incompatible')) return 'incompatibilidad_confirmada';
  if (checks.some((item) => item.estado === 'diagnostico_incompleto')) return 'diagnostico_incompleto';
  return 'prerrequisitos_verificados';
}

function errorLectura(err, nombre) {
  if (err && err.code === 'ENOENT') return check('archivo_faltante', 'ARCHIVO_AUSENTE', `No se encontró ${nombre}.`);
  if (err && (err.code === 'EACCES' || err.code === 'EPERM')) {
    return check('error_inspeccion', 'PERMISO_DENEGADO', `No hay permiso para leer ${nombre}.`);
  }
  return check('error_inspeccion', 'ERROR_LECTURA', `No se pudo leer ${nombre}.`);
}

function analizarPe(buffer, nombre) {
  try {
    return { pe: parsearPe(buffer), fallo: null };
  } catch (err) {
    const codigo = err instanceof PeInspectionError ? err.code : 'PE_INVALIDO';
    return {
      pe: null,
      fallo: check('error_inspeccion', codigo, `No se pudo inspeccionar el formato PE de ${nombre}.`)
    };
  }
}

function revisarArquitectura(pe, nombre, ruta) {
  if (pe.machine === MACHINE_X64) return check('prerrequisito_verificado', 'ARQUITECTURA_X64', `${nombre} es x64.`, { ruta });
  return check('incompatible', 'ARQUITECTURA_INCOMPATIBLE', `${nombre} no es x64.`, { arquitectura: pe.architecture, ruta });
}

function revisarExports(pe, requeridos, nombre, ruta) {
  const disponibles = new Set(pe.exports);
  const invalidos = pe.exportsInvalid.filter((item) => requeridos.includes(item.nombre));
  const reenviados = pe.forwardedExports.filter((item) => requeridos.includes(item.nombre));
  const conocidosNoDirectos = new Set([...invalidos, ...reenviados].map((item) => item.nombre));
  const faltantes = requeridos.filter((symbol) => !disponibles.has(symbol) && !conocidosNoDirectos.has(symbol));
  if (invalidos.length) {
    return check('incompatible', 'EXPORTS_INVALIDOS', `${nombre} contiene exports requeridos sin una función directa válida.`, {
      verificados: requeridos.length - invalidos.length - reenviados.length - faltantes.length, faltantes, invalidos, reenviados, ruta
    });
  }
  if (faltantes.length) {
    return check('incompatible', 'EXPORTS_AUSENTES', `${nombre} no exporta todos los símbolos que solicita el puente.`, {
      verificados: requeridos.length - faltantes.length - reenviados.length, faltantes, invalidos: [], reenviados, ruta
    });
  }
  if (reenviados.length) {
    return check('diagnostico_incompleto', 'EXPORTS_REENVIADOS', `${nombre} reenvía exports requeridos; no se verificó estáticamente su destino.`, {
      verificados: requeridos.length - reenviados.length, faltantes: [], invalidos: [], reenviados, ruta
    });
  }
  return check('prerrequisito_verificado', 'EXPORTS_PRESENTES', `Los exports directos requeridos de ${nombre} están presentes.`, {
    verificados: requeridos.length, faltantes: [], invalidos: [], reenviados: [], ruta
  });
}

function normalizarNombreDll(nombre) {
  const original = String(nombre);
  const base = path.win32.basename(original).toLowerCase();
  if (original !== path.win32.basename(original) || !/^[a-z0-9_.-]+\.dll$/.test(base)) {
    throw new PeInspectionError('Nombre de DLL importada inválido.');
  }
  return base;
}

function crearBridgePrerequisitesService({
  readFile = fs.readFile,
  rutas = RUTAS
} = {}) {
  async function leerPe(ruta, nombre) {
    let bytes;
    try {
      bytes = await readFile(ruta);
    } catch (err) {
    return { fallo: { ...errorLectura(err, nombre), ruta }, pe: null, ruta };
    }
    const resultado = analizarPe(bytes, nombre);
    return { fallo: resultado.fallo ? { ...resultado.fallo, ruta } : null, pe: resultado.pe, ruta };
  }

  async function leerPrimerPe(candidatas, nombre) {
    let ultimoFallo = null;
    const rutasComprobadas = [];
    for (const ruta of candidatas) {
      rutasComprobadas.push(ruta);
      const resultado = await leerPe(ruta, nombre);
      if (resultado.fallo?.codigo === 'ARCHIVO_AUSENTE') {
        ultimoFallo = resultado.fallo;
        continue;
      }
      return { ...resultado, rutasComprobadas };
    }
    const ruta = candidatas[0] || '';
    return {
      fallo: { ...(ultimoFallo || check('archivo_faltante', 'ARCHIVO_AUSENTE', `No se encontró ${nombre}.`)), ruta, rutasComprobadas },
      pe: null,
      ruta,
      rutasComprobadas
    };
  }

  function rutaWacom() {
    if (rutas.wacom) return [rutas.wacom]; // seam controlado para pruebas
    return rutas.candidatosWacom || [];
  }

  function rutasZkPrincipal() {
    if (rutas.zkDll) return [rutas.zkDll];
    if (rutas.candidatosZk) return rutas.candidatosZk;
    if (rutas.zkSystem32) return [path.win32.join(rutas.zkSystem32, 'libzkfp.dll')];
    return [];
  }

  async function verificarWacom() {
    const principal = await leerPrimerPe(rutaWacom(), 'wgssSTU.dll');
    const rutaDll = principal.ruta || principal.fallo?.ruta || rutaWacom()[0];
    const checks = [];
    let fileVersion = null;
    let exports = null;
    if (principal.fallo) {
      checks.push(principal.fallo);
    } else {
      checks.push(revisarArquitectura(principal.pe, 'wgssSTU.dll', rutaDll));
      fileVersion = principal.pe.fileVersion;
      // Replica FileVersionInfo.FileVersion.StartsWith("2.18.0.82") del puente.
      if (principal.pe.versionStatus !== 'verificado' || typeof fileVersion !== 'string') {
        checks.push(check('diagnostico_incompleto', 'VERSION_WACOM_NO_DETERMINABLE', 'Los recursos PE no permiten determinar FileVersion con fiabilidad.', {
          fileVersion, versionStatus: principal.pe.versionStatus, prefijoRequerido: VERSION_WACOM_REQUERIDA, ruta: rutaDll
        }));
      } else {
        const versionCompatible = fileVersion.startsWith(VERSION_WACOM_REQUERIDA);
        checks.push(versionCompatible
          ? check('prerrequisito_verificado', 'VERSION_WACOM_COMPATIBLE', 'La versión FileVersion coincide con el prefijo requerido.', { fileVersion, ruta: rutaDll })
          : check('incompatible', 'VERSION_WACOM_INCOMPATIBLE', 'FileVersion no empieza por la versión requerida por el puente.', { fileVersion, prefijoRequerido: VERSION_WACOM_REQUERIDA, ruta: rutaDll }));
      }
      exports = revisarExports(principal.pe, EXPORTS_WACOM, 'wgssSTU.dll', rutaDll);
    }

    const estadoPrerequisitos = resumirChecks(checks);
    const exportEsperadoPorPuente = 'WacomGSS_Protocol_setHostPublicKey';
    const exportRealSdk = 'WacomGSS_Protocol_setHostPublicKey';
    const exportRealPresente = Boolean(principal.pe && principal.pe.exports.includes(exportRealSdk));
    const binding = check(
      'diagnostico_incompleto',
      'BINDING_WACOM_PENDIENTE_ABI_FISICA',
      'El binding estático coincide con WacomGSS_Protocol_setHostPublicKey y WacomGSS_Interface; aún requiere pruebas ABI de marshalling y una captura física con STU-540.',
      {
        exportEsperadoPorPuente,
        exportRealSdk,
        exportRealPresente,
        tipoHandleEnLlamada: 'WacomGSS_Interface (dev.Intf)',
        tipoHandleDelHeader: 'WacomGSS_Interface',
        estructuraClaveBytes: 16,
        verificacion: 'pendiente_abi_y_dispositivo'
      }
    );
    const estado = resumirChecks([...checks, exports || check('diagnostico_incompleto', 'EXPORTS_NO_INSPECCIONADOS', 'No fue posible leer la DLL.'), binding]);

    return {
      nombre: 'Wacom STU-540',
      estado,
      prerrequisitos: { estado: estadoPrerequisitos, checks },
      exports: exports || check('diagnostico_incompleto', 'EXPORTS_NO_INSPECCIONADOS', 'No fue posible leer la DLL del SDK.'),
      binding,
      version: { estado: checks.find((item) => item.codigo.startsWith('VERSION_WACOM_'))?.estado || 'diagnostico_incompleto', fileVersion, versionStatus: principal.pe?.versionStatus, ruta: rutaDll },
      instrucciones: [
        { texto: 'Instalar manualmente el SDK Wacom compatible con la versión requerida.', url: URLS_INSTALACION.wacomSdk },
        { texto: 'Consultar instalación y requisitos del driver STU-540.', url: URLS_INSTALACION.wacomDriver }
      ],
      dispositivo: 'no probado'
    };
  }

  async function verificarZkteco() {
    const candidatosPrincipal = rutasZkPrincipal();
    const principal = await leerPrimerPe(candidatosPrincipal, 'libzkfp.dll');
    const rutaPrincipal = principal.ruta || principal.fallo?.ruta || candidatosPrincipal[0];
    const directorioPrincipal = rutaPrincipal ? path.win32.dirname(rutaPrincipal) : rutas.zkSystem32;
    const checks = [];
    const limitaciones = [];
    let fileVersion = null;
    let exports = null;
    let imports = [];

    if (principal.fallo) {
      checks.push(principal.fallo);
    } else {
      checks.push(revisarArquitectura(principal.pe, 'libzkfp.dll', rutaPrincipal));
      fileVersion = principal.pe.fileVersion;
      exports = revisarExports(principal.pe, EXPORTS_ZK, 'libzkfp.dll', rutaPrincipal);
      imports = principal.pe.imports;

      if (imports.some((name) => {
        try { normalizarNombreDll(name); return false; } catch { return true; }
      })) checks.push(check('error_inspeccion', 'IMPORT_INVALIDO', 'libzkfp.dll contiene un nombre de import que no se pudo validar.', { ruta: rutaPrincipal }));
    }

    const checksDependencias = [];
    const candidatasDependencias = [
      ...DEPENDENCIAS_ZK_REQUERIDAS,
      ...((principal.pe && imports.length) ? imports.map((name) => {
        try { return normalizarNombreDll(name); } catch { return null; }
      }).filter(Boolean).filter((name) => !DLLS_WINDOWS_CONOCIDAS.has(name) && !name.startsWith('api-ms-win-') && !name.startsWith('ext-ms-win-')) : [])
    ];
    const clavesDependencias = new Set();
    const nombresDependencias = candidatasDependencias.filter((nombre) => {
      const clave = nombre.toLowerCase();
      if (clavesDependencias.has(clave)) return false;
      clavesDependencias.add(clave);
      return true;
    });
    for (const dependencia of nombresDependencias) {
      const rutasDependencia = [...new Set([
        directorioPrincipal && path.win32.join(directorioPrincipal, dependencia),
        rutas.zkSystem32 && path.win32.join(rutas.zkSystem32, dependencia)
      ].filter(Boolean))];
      const resultado = await leerPrimerPe(rutasDependencia, dependencia);
      const ruta = resultado.ruta || resultado.fallo?.ruta || rutasDependencia[0];
      if (resultado.fallo) checksDependencias.push({ ...resultado.fallo, dependencia });
      else checksDependencias.push({ ...revisarArquitectura(resultado.pe, dependencia, ruta), dependencia });
    }
    checks.push(...checksDependencias);

    if (principal.pe) {
      limitaciones.push(check(
        'diagnostico_incompleto',
        'VERSION_ZK_SIN_LINEA_BASE',
        'La DLL ZKTeco no tiene una línea base oficial de versión compatible confirmada; su versión informada es solo orientativa.',
        { fileVersion }
      ));
      limitaciones.push(check(
        'diagnostico_incompleto',
        'IMPORTS_ESTATICOS_LIMITADOS',
        'La inspección de imports no detecta cargas dinámicas ni acredita todas las dependencias transitivas.'
      ));
    }

    const estadoPrerequisitos = resumirChecks(checks);
    const estado = resumirChecks([...checks, exports || check('diagnostico_incompleto', 'EXPORTS_NO_INSPECCIONADOS', 'No fue posible leer libzkfp.dll.'), ...limitaciones]);
    return {
      nombre: 'ZKTeco ZK-9500',
      estado,
      prerrequisitos: { estado: estadoPrerequisitos, checks },
      exports: exports || check('diagnostico_incompleto', 'EXPORTS_NO_INSPECCIONADOS', 'No fue posible leer libzkfp.dll.'),
      imports: {
        estado: principal.pe ? 'inspeccion_estatica_limitada' : 'diagnostico_incompleto',
        nombres: imports,
        dependenciasComprobadas: checksDependencias.map(({ dependencia, ruta, estado, codigo }) => ({ dependencia, ruta, estado, codigo })),
        limitaciones: [
          ...limitaciones,
          check('diagnostico_incompleto', 'DEPENDENCIAS_NO_EXHAUSTIVAS', 'Se comprobaron las DLL conocidas y los imports estáticos visibles; no se afirma que se hayan detectado todas las dependencias.')
        ]
      },
      version: { estado: 'diagnostico_incompleto', fileVersion, motivo: 'No se estableció una línea base oficial de versión.' },
      instrucciones: [
        { texto: 'Obtener e instalar manualmente el SDK ZKFinger oficial para Windows y el driver del ZK9500.', url: URLS_INSTALACION.zkSdk }
      ],
      dispositivo: 'no probado'
    };
  }

  async function verificarPrerrequisitos() {
    try {
      const [wacom, zkteco] = await Promise.all([verificarWacom(), verificarZkteco()]);
      return {
        ok: true,
        data: {
          alcance: 'Inspección estática de archivos; no carga DLL ni ejecuta helpers.',
          dispositivo: 'no probado',
          wacom,
          zkteco
        }
      };
    } catch {
      return {
        ok: true,
        data: {
          alcance: 'Inspección estática de archivos; no carga DLL ni ejecuta helpers.',
          dispositivo: 'no probado',
          wacom: { nombre: 'Wacom STU-540', estado: 'error_inspeccion', prerrequisitos: { estado: 'error_inspeccion', checks: [check('error_inspeccion', 'ERROR_INTERNO', 'No se pudo completar la inspección estática.')] }, dispositivo: 'no probado' },
          zkteco: { nombre: 'ZKTeco ZK-9500', estado: 'error_inspeccion', prerrequisitos: { estado: 'error_inspeccion', checks: [check('error_inspeccion', 'ERROR_INTERNO', 'No se pudo completar la inspección estática.')] }, dispositivo: 'no probado' }
        }
      };
    }
  }

  return { verificarPrerrequisitos };
}

const servicio = crearBridgePrerequisitesService();

module.exports = {
  VERSION_WACOM_REQUERIDA,
  RUTAS,
  EXPORTS_WACOM,
  EXPORTS_ZK,
  crearBridgePrerequisitesService,
  verificarPrerrequisitos: servicio.verificarPrerrequisitos
};
