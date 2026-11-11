'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parsearPe } = require('../../backend/services/peStaticInspector');
const {
  EXPORTS_WACOM,
  EXPORTS_ZK,
  crearBridgePrerequisitesService
} = require('../../backend/services/bridgePrerequisitesService');
const { crearHandler } = require('../../backend/controllers/bridgePrerequisitesController');
const IPC_CHANNELS = require('../../electron/bridgePrerequisitesChannel');
const { crearPeFixture } = require('../helpers/peFixtures');

const RUTAS_PRUEBA = Object.freeze({
  wacom: String.raw`C:\fixtures\wgssSTU.dll`,
  zkSystem32: String.raw`C:\fixtures\System32`
});

function archivosValidos({ wacomVersion = '2.18.0.82.7', wacomExports, zkExports, zkDependencies = ['ZKFPCap.dll', 'fpslib.dll'] } = {}) {
  const files = new Map();
  const exportsWacom = wacomExports || EXPORTS_WACOM;
  files.set(RUTAS_PRUEBA.wacom, crearPeFixture({ exports: exportsWacom, fileVersion: wacomVersion }));
  files.set(path.win32.join(RUTAS_PRUEBA.zkSystem32, 'libzkfp.dll'), crearPeFixture({
    exports: zkExports || EXPORTS_ZK,
    imports: ['KERNEL32.dll', ...zkDependencies],
    fileVersion: '5.0.0.1'
  }));
  for (const dependency of zkDependencies) {
    files.set(path.win32.join(RUTAS_PRUEBA.zkSystem32, dependency), crearPeFixture({ fileVersion: '1.0.0.0' }));
  }
  return files;
}

function crearServicio(files, errores = new Map()) {
  const normalizarRuta = (ruta) => String(ruta).toLowerCase();
  const archivosNormalizados = new Map([...files].map(([ruta, contenido]) => [normalizarRuta(ruta), contenido]));
  const erroresNormalizados = new Map([...errores].map(([ruta, codigo]) => [normalizarRuta(ruta), codigo]));
  return crearBridgePrerequisitesService({
    rutas: RUTAS_PRUEBA,
    readFile: async (ruta) => {
      const rutaNormalizada = normalizarRuta(ruta);
      if (erroresNormalizados.has(rutaNormalizada)) throw Object.assign(new Error('fixture read error'), { code: erroresNormalizados.get(rutaNormalizada) });
      if (!archivosNormalizados.has(rutaNormalizada)) throw Object.assign(new Error('missing fixture'), { code: 'ENOENT' });
      return archivosNormalizados.get(rutaNormalizada);
    }
  });
}

describe('Inspección PE y prerrequisitos de puentes (sin carga de DLL)', () => {
  test('lee versión, arquitectura, exports e imports de fixtures PE', () => {
    const buffer = crearPeFixture({ exports: ['ZKFPM_Init'], imports: ['fpslib.dll'], fileVersion: '2.18.0.82.9' });
    assert.deepEqual(parsearPe(buffer), {
      machine: 0x8664,
      architecture: 'x64',
      exports: ['ZKFPM_Init'],
      imports: ['fpslib.dll'],
      fileVersion: '2.18.0.82.9',
      versionStatus: 'verificado',
      exportsInvalid: [],
      forwardedExports: []
    });
  });

  test('rechaza una cabecera PE con Machine y OptionalHeader.Magic incoherentes', () => {
    const buffer = crearPeFixture();
    buffer.writeUInt16LE(0x10B, 0x98);
    assert.throws(() => parsearPe(buffer), /coherente|incompatible/i);
  });

  test('rechaza directorios cuyo RVA excede los límites mapeables de las secciones', () => {
    const buffer = crearPeFixture({ exports: ['ZKFPM_Init'] });
    buffer.writeUInt32LE(0x2FFF, 0x98 + 112);
    buffer.writeUInt32LE(0x100, 0x98 + 116);
    assert.throws(() => parsearPe(buffer), /RVA|directorio|límite/i);
  });

  test('rechaza secciones que exceden el tamaño real del archivo', () => {
    const buffer = crearPeFixture();
    buffer.writeUInt32LE(0x3000, 0x198);
    assert.throws(() => parsearPe(buffer), /sección raw fuera del archivo/i);
  });

  test('no cuenta como utilizable un export cuyo EAT contiene RVA cero', () => {
    const buffer = crearPeFixture({ exports: ['ZKFPM_Init'] });
    buffer.writeUInt32LE(0, 0x240);
    const pe = parsearPe(buffer);
    assert.deepEqual(pe.exports, []);
    assert.deepEqual(pe.exportsInvalid.map((item) => item.nombre), ['ZKFPM_Init']);
  });

  test('clasifica como inválido el RVA de función fuera de las secciones', () => {
    const buffer = crearPeFixture({ exports: ['ZKFPM_Init'] });
    buffer.writeUInt32LE(0x3000, 0x240);
    const pe = parsearPe(buffer);
    assert.deepEqual(pe.exports, []);
    assert.equal(pe.exportsInvalid[0].motivo, 'RVA de función no mapeable');
  });

  test('rechaza imports con thunk o nombre fuera de las secciones mapeables', () => {
    const buffer = crearPeFixture({ imports: ['fpslib.dll'] });
    buffer.writeUInt32LE(0x3000, 0x380);
    assert.throws(() => parsearPe(buffer), /RVA|import/i);
  });

  test('distingue los exports reenviados de los exports directos utilizables', () => {
    const buffer = crearPeFixture({ exports: ['ZKFPM_Init'] });
    buffer.writeUInt32LE(0x1700, 0x240);
    Buffer.from('OTHERDLL.ZKFPM_Init\0', 'ascii').copy(buffer, 0x200 + (0x1700 - 0x1000));
    buffer.writeUInt32LE(0x800, 0x98 + 116);
    const pe = parsearPe(buffer);
    assert.deepEqual(pe.exports, []);
    assert.deepEqual(pe.forwardedExports.map((item) => item.nombre), ['ZKFPM_Init']);
    assert.equal(pe.forwardedExports[0].destino, 'OTHERDLL.ZKFPM_Init');
  });

  test('marca recursos de versión truncados como incompletos y sin versión', () => {
    const buffer = crearPeFixture({ fileVersion: '2.18.0.82.4' });
    buffer.writeUInt32LE(8, 0x484);
    const pe = parsearPe(buffer);
    assert.equal(pe.fileVersion, null);
    assert.equal(pe.versionStatus, 'incompleto');
  });

  test('un recurso de versión incompleto no puede aprobar la versión Wacom', async () => {
    const files = archivosValidos();
    const ruta = RUTAS_PRUEBA.wacom;
    const exportsWacom = parsearPe(files.get(ruta)).exports;
    const malformed = crearPeFixture({ exports: exportsWacom, fileVersion: '2.18.0.82.4' });
    malformed.writeUInt32LE(8, 0x484);
    files.set(ruta, malformed);
    const result = await crearServicio(files).verificarPrerrequisitos();
    assert.equal(result.data.wacom.version.versionStatus, 'incompleto');
    assert.equal(result.data.wacom.version.estado, 'diagnostico_incompleto');
    assert.equal(result.data.wacom.prerrequisitos.estado, 'diagnostico_incompleto');
  });

  test('clasifica archivos ausentes y mantiene el dispositivo no probado', async () => {
    const result = await crearServicio(new Map()).verificarPrerrequisitos();
    assert.equal(result.data.wacom.prerrequisitos.estado, 'archivo_faltante');
    assert.equal(result.data.zkteco.prerrequisitos.estado, 'archivo_faltante');
    assert.equal(result.data.dispositivo, 'no probado');
    assert.equal(result.data.wacom.dispositivo, 'no probado');
    assert.equal(result.data.zkteco.dispositivo, 'no probado');
  });

  test('clasifica permisos insuficientes como error de inspección', async () => {
    const files = archivosValidos();
    const denied = new Map([
      [RUTAS_PRUEBA.wacom, 'EACCES'],
      [path.win32.join(RUTAS_PRUEBA.zkSystem32, 'libzkfp.dll'), 'EPERM']
    ]);
    const result = await crearServicio(files, denied).verificarPrerrequisitos();
    assert.equal(result.data.wacom.prerrequisitos.estado, 'error_inspeccion');
    assert.equal(result.data.wacom.prerrequisitos.checks[0].codigo, 'PERMISO_DENEGADO');
    assert.equal(result.data.zkteco.prerrequisitos.estado, 'error_inspeccion');
  });

  test('clasifica PE inválidos como error de inspección', async () => {
    const files = new Map([
      [RUTAS_PRUEBA.wacom, Buffer.from('not a PE file')],
      [path.win32.join(RUTAS_PRUEBA.zkSystem32, 'libzkfp.dll'), Buffer.alloc(0)]
    ]);
    const result = await crearServicio(files).verificarPrerrequisitos();
    assert.equal(result.data.wacom.prerrequisitos.estado, 'error_inspeccion');
    assert.equal(result.data.zkteco.prerrequisitos.estado, 'error_inspeccion');
  });

  test('clasifica arquitectura distinta de x64 como incompatibilidad', async () => {
    const files = archivosValidos();
    files.set(RUTAS_PRUEBA.wacom, crearPeFixture({ machine: 0x14C, exports: EXPORTS_WACOM, fileVersion: '2.18.0.82' }));
    files.set(path.win32.join(RUTAS_PRUEBA.zkSystem32, 'libzkfp.dll'), crearPeFixture({ machine: 0x14C, exports: EXPORTS_ZK, imports: ['ZKFPCap.dll', 'fpslib.dll'] }));
    const result = await crearServicio(files).verificarPrerrequisitos();
    assert.equal(result.data.wacom.prerrequisitos.estado, 'incompatibilidad_confirmada');
    assert.equal(result.data.zkteco.prerrequisitos.estado, 'incompatibilidad_confirmada');
  });

  test('aplica FileVersion.StartsWith con el prefijo actual Wacom', async () => {
    const files = archivosValidos({ wacomVersion: '2.18.1.0' });
    const result = await crearServicio(files).verificarPrerrequisitos();
    assert.equal(result.data.wacom.version.fileVersion, '2.18.1.0');
    assert.equal(result.data.wacom.version.estado, 'incompatible');
    assert.equal(result.data.wacom.prerrequisitos.estado, 'incompatibilidad_confirmada');
  });

  test('detecta exports ausentes en las DLL de fabricantes', async () => {
    const files = archivosValidos({
      wacomExports: ['WacomGSS_Protocol_setHostPublicKey'],
      zkExports: EXPORTS_ZK.filter((name) => name !== 'ZKFPM_Init')
    });
    const result = await crearServicio(files).verificarPrerrequisitos();
    assert.ok(result.data.wacom.exports.faltantes.includes('WacomGSS_getUsbDevices'));
    assert.ok(result.data.zkteco.exports.faltantes.includes('ZKFPM_Init'));
    assert.equal(result.data.zkteco.estado, 'incompatibilidad_confirmada');
  });

  test('detecta dependencias ZKTeco ausentes en el directorio fijado por main', async () => {
    const files = archivosValidos({ zkDependencies: ['ZKFPCap.dll'] });
    const result = await crearServicio(files).verificarPrerrequisitos();
    assert.equal(result.data.zkteco.prerrequisitos.estado, 'archivo_faltante');
    assert.ok(result.data.zkteco.prerrequisitos.checks.some((item) => item.dependencia === 'fpslib.dll' && item.codigo === 'ARCHIVO_AUSENTE'));
  });

  test('comprueba ZKFPCap.dll y fpslib.dll aunque falte libzkfp.dll', async () => {
    const files = new Map();
    files.set(path.win32.join(RUTAS_PRUEBA.zkSystem32, 'ZKFPCap.dll'), crearPeFixture());
    const result = await crearServicio(files).verificarPrerrequisitos();
    const checks = result.data.zkteco.prerrequisitos.checks;
    assert.ok(checks.some((item) => item.codigo === 'ARCHIVO_AUSENTE' && item.ruta?.toLowerCase().endsWith('libzkfp.dll')));
    assert.ok(checks.some((item) => item.dependencia === 'ZKFPCap.dll' && item.estado === 'prerrequisito_verificado'));
    assert.ok(checks.some((item) => item.dependencia === 'fpslib.dll' && item.estado === 'archivo_faltante'));
  });

test('prerrequisitos completos y binding estático corregido no prueban ABI ni captura Wacom', async () => {
    const result = await crearServicio(archivosValidos()).verificarPrerrequisitos();
    assert.equal(result.data.wacom.prerrequisitos.estado, 'prerrequisitos_verificados');
  assert.equal(result.data.wacom.estado, 'diagnostico_incompleto');
  assert.equal(result.data.wacom.binding.codigo, 'BINDING_WACOM_PENDIENTE_ABI_FISICA');
    assert.equal(result.data.wacom.binding.exportRealPresente, true);
  assert.ok(!result.data.wacom.exports.faltantes.includes('WacomGSS_Protocol_setHostPublicKey'));
  assert.equal(result.data.wacom.binding.tipoHandleEnLlamada, 'WacomGSS_Interface (dev.Intf)');
  assert.equal(result.data.wacom.binding.estructuraClaveBytes, 16);
  assert.equal(result.data.wacom.dispositivo, 'no probado');
    assert.equal(result.data.zkteco.prerrequisitos.estado, 'prerrequisitos_verificados');
    assert.equal(result.data.zkteco.estado, 'diagnostico_incompleto');
    assert.equal(result.data.zkteco.imports.dependenciasComprobadas.length, 2);
    assert.equal(new Set(result.data.zkteco.imports.dependenciasComprobadas.map((item) => item.ruta.toLowerCase())).size, 2);
    assert.equal(result.data.dispositivo, 'no probado');
  });
});

test('el handler IPC es sin argumentos y no acepta rutas arbitrarias', async () => {
  let calls = 0;
  const handler = crearHandler({ verificarPrerrequisitos: async () => { calls += 1; return { ok: true, data: {} }; } });
  const response = await handler({ sender: {} });
  assert.equal(response.ok, true);
  assert.equal(calls, 1);
  const rejected = await handler({ sender: {} }, String.raw`C:\Windows\System32\evil.dll`);
  assert.equal(rejected.ok, false);
  assert.equal(calls, 1);
});

test('el handler convierte errores del servicio en error de consulta controlado', async () => {
  const handler = crearHandler({ verificarPrerrequisitos: async () => { throw new Error('fallo interno'); } });
  const response = await handler({ sender: {} });
  assert.deepEqual(response, { ok: false, error: 'No se pudo inspeccionar los prerrequisitos de los puentes.' });
});

test('window.api expone solo la consulta sin reenviar argumentos del renderer', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../electron/preload.js'), 'utf8');
  const calls = [];
  let api;
  const fakeRequire = (name) => {
    if (name === 'electron') return {
      contextBridge: { exposeInMainWorld: (_key, value) => { api = value; } },
      ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve({ ok: true }); } }
    };
    if (name === './bridgePrerequisitesChannel') return IPC_CHANNELS;
    throw new Error(`require no esperado: ${name}`);
  };
  const context = { require: fakeRequire, module: { exports: {} }, exports: {} };
  vm.runInNewContext(source, context, { filename: 'preload.js' });
  await api.puentes.verificarPrerrequisitos(String.raw`C:\otra-ruta.dll`);
  assert.deepEqual(calls, [[IPC_CHANNELS.VERIFICAR_PRERREQUISITOS_PUENTES]]);
  assert.deepEqual(Object.keys(api.puentes), ['verificarPrerrequisitos']);
});

test('la interfaz invalida el diagnóstico anterior antes de consultar y ante respuesta fallida', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/components/DocumentacionReceptor.jsx'), 'utf8');
  const start = source.indexOf('async function handleRevisarPrerrequisitosPuentes()');
  const end = source.indexOf('\n  }', start) + 4;
  const handler = source.slice(start, end);
  assert.match(handler, /setDiagnosticoPuentes\(null\)/);
  assert.match(handler, /else\s*\{\s*setDiagnosticoPuentes\(null\)/);
  assert.match(handler, /catch\s*\{\s*setDiagnosticoPuentes\(null\)/);
});
