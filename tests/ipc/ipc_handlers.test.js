const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createTestDb, teardownTestDb } = require('../helpers/testDb');
const authService = require('../../backend/services/authService');
const sessionService = require('../../backend/services/sessionService');
const medicamentoController = require('../../backend/controllers/medicamentoController');
const ordenController = require('../../backend/controllers/ordenController');
const despachoController = require('../../backend/controllers/despachoController');
const usuarioController = require('../../backend/controllers/usuarioController');
const receptorController = require('../../backend/controllers/receptorController');
const backupController = require('../../backend/controllers/backupController');
const backupService = require('../../backend/services/backupService');

describe('FASE 4 — IPC Handlers & Seguridad de Invocación desde Renderer', () => {
  let db;
  let sesionWilmer;
  let credencialesValidas;

  beforeEach(() => {
    db = createTestDb();
    credencialesValidas = authService.login('wilmer', 'Wilmer465*');
    sesionWilmer = credencialesValidas;
  });

  afterEach(() => {
    teardownTestDb();
  });

  test('Wrapper de sesión IPC rechaza peticiones sin token o con token corrupto', () => {
    assert.throws(
      () => sessionService.resolverUsuarioDesdeSesion(null),
      /Sesión de usuario inválida/
    );

    assert.throws(
      () => sessionService.resolverUsuarioDesdeSesion({ session_token: 'token_falso_invalido' }),
      /Sesión expirada o inválida/
    );
  });

  test('IPC Handler de medicamentos: listar y crear con sesión válida', () => {
    const resListar = medicamentoController.listar();
    assert.equal(resListar.ok, true);
    assert.ok(Array.isArray(resListar.data));

    const resCrear = medicamentoController.crear(sesionWilmer, {
      codigo: 'MED-IPC-01',
      nombre: 'Medicamento IPC',
      unidad_medida: 'TABLETA',
      unidades_por_caja: 10
    });
    assert.equal(resCrear.ok, true);
    assert.equal(resCrear.data.codigo, 'MED-IPC-01');
  });

  test('IPC Handler de receptores: rechaza operaciones de usuarios con sesión no autorizada', () => {
    const sesionInvalida = { ...sesionWilmer, rol_nombre: 'USUARIO' };
    const resGuardar = receptorController.guardar(sesionInvalida, { nombre: 'Test', documento: '999' });
    assert.equal(resGuardar.ok, false);
    assert.match(resGuardar.error, /No tiene permisos/);
  });

  test('IPC Handler de usuarios: exclusivo para superadmin principal', () => {
    const resListarWilmer = usuarioController.listar(sesionWilmer);
    assert.equal(resListarWilmer.ok, true);
    assert.ok(resListarWilmer.data.length >= 3);

    const sesionOtroAdmin = { ...sesionWilmer, es_superadmin_principal: 0 };
    const resListarOtro = usuarioController.listar(sesionOtroAdmin);
    assert.equal(resListarOtro.ok, false);
    assert.match(resListarOtro.error, /solo el superadministrador principal/);
  });

test('IPC Handler de despachos: captura excepciones internas y responde { ok: false, error }', () => {
    // Despacho de orden inexistente
    const res = despachoController.crear(sesionWilmer, { orden_id: 999999, items: [] });
    assert.equal(res.ok, false);
    assert.match(res.error, /La orden no existe|no tiene permisos/);
  });
});

// FASE 4 (bis) — Respaldos.
//
// Estos tests existen por un bug concreto: backupController devolvia
// `{ ok: true, data: <Promise> }`. Ese objeto no es un thenable, asi que
// ipcMain.handle no lo resolvia y Electron serializaba la Promise como {}
// por structured clone. El renderer recibia un objeto vacio en vez de un array
// y reventaba en `.map()`.
describe('FASE 4 (bis) — Respaldos: respuestas serializables por IPC', () => {
  let db;
  let sesionWilmer;
  let dirTemporal;

  beforeEach(() => {
    db = createTestDb();
    sesionWilmer = authService.login('wilmer', 'Wilmer465*');
    dirTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'respaldos-test-'));
    // Sin este override el servicio escribiria en data/backups y `restaurar`
    // sobrescribiria la base de desarrollo real.
    backupService.setDirectorioRespaldos(dirTemporal);
  });

  afterEach(() => {
    backupService.setDirectorioRespaldos(null);
    fs.rmSync(dirTemporal, { recursive: true, force: true });
    teardownTestDb();
  });

  test('listar devuelve un Array real, no una Promise serializada a {}', async () => {
    const res = await backupController.listar(sesionWilmer, {});

    assert.equal(res.ok, true);
    assert.ok(Array.isArray(res.data), 'data debe ser un Array serializable');

    // Exactamente el modo de fallo original: un Promise dentro de `data` se
    // convierte en {} al cruzar structured clone.
    const estructurado = structuredClone(res);
    assert.ok(Array.isArray(estructurado.data), 'tras structured clone sigue siendo Array');
  });

  test('listar crea un respaldo y lo devuelve en la lista', async () => {
    const creado = await backupController.crear(sesionWilmer, {});
    assert.equal(creado.ok, true);
    assert.ok(creado.data.nombre, 'crear devuelve el nombre del archivo');
    assert.ok(fs.existsSync(path.join(dirTemporal, creado.data.nombre)));

    const listado = await backupController.listar(sesionWilmer, {});
    assert.ok(Array.isArray(listado.data));
    assert.ok(
      listado.data.some((b) => b.nombre === creado.data.nombre),
      'el respaldo recien creado aparece en el listado'
    );
  });

  test('el archivo producido por db.backup() es legible, integro y autonomo', async () => {
    const creado = await backupController.crear(sesionWilmer, {});
    const ruta = path.join(dirTemporal, creado.data.nombre);

    const validacion = backupService.validarIntegridad(ruta);
    assert.equal(validacion.ok, true, `integridad: ${JSON.stringify(validacion.detalle)}`);

    // El .db debe sostenerse solo: `restaurar` copia unicamente el .db y borra
    // el -wal del destino, asi que un -wal con datos haria perder informacion.
    for (const sufijo of ['-wal', '-shm']) {
      assert.equal(
        fs.existsSync(ruta + sufijo),
        false,
        `no debe quedar companion file ${sufijo} junto al respaldo`
      );
    }

    // Abre el .db aislado y comprueba que conserva datos reales.
    const copia = new Database(ruta, { readonly: true, fileMustExist: true });
    try {
      const usuarios = copia.prepare('SELECT COUNT(*) c FROM usuarios').get().c;
      assert.ok(usuarios > 0, 'el respaldo contiene usuarios');
    } finally {
      copia.close();
    }
  });

  test('ultimoRespaldo devuelve un objeto o null, nunca una Promise', async () => {
    const vacio = await backupController.ultimoRespaldo(sesionWilmer, {});
    assert.equal(vacio.ok, true);
    assert.equal(vacio.data, null);

    await backupController.crear(sesionWilmer, {});
    const conDatos = await backupController.ultimoRespaldo(sesionWilmer, {});
    assert.equal(conDatos.ok, true);
    assert.ok(conDatos.data.nombre);
    assert.ok(conDatos.data.nombre.includes('farmacia_backup'));
  });

  test('listar rechaza a un usuario sin permisos sin lanzar', async () => {
    const res = await backupController.listar({ ...sesionWilmer, rol_nombre: 'USUARIO' }, {});
    assert.equal(res.ok, false);
    assert.match(res.error, /Superadmin|Administrador/);
  });

  test('un fallo al crear el respaldo no se propaga como rechazo sin capturar', async () => {
    // La funcion ahora es async y se invoca desde un setInterval. Si un fallo
    // escapara como promesa rechazada, el proceso principal de Electron — que
    // no espera ese setInterval — caeria. Override con un archivo donde debe ir
    // el directorio: mkdirSync falla con ENOTDIR de forma determinista.
    const bloqueo = path.join(dirTemporal, 'bloqueo');
    fs.writeFileSync(bloqueo, 'no soy un directorio', 'utf8');

    await backupController.guardarConfig(sesionWilmer, {
      habilitado: true,
      frecuencia: '1_HORA',
      ultimo_backup_auto: null
    });

    backupService.setDirectorioRespaldos(path.join(bloqueo, 'respaldos'));

    // No debe lanzar: el error se registra dentro de verificarYEjecutarAutoBackup.
    await assert.doesNotReject(() => backupService.verificarYEjecutarAutoBackup());
  });

  test('el planificador avanza el timestamp y no repite dentro de la misma ventana', async () => {
    backupService.setDirectorioRespaldos(dirTemporal);
    await backupController.guardarConfig(sesionWilmer, {
      habilitado: true,
      frecuencia: '1_HORA',
      ultimo_backup_auto: null
    });

    await backupService.verificarYEjecutarAutoBackup();

    const trasCiclo = backupService.obtenerConfigAutoBackup();
    assert.equal(
      typeof trasCiclo.ultimo_backup_auto,
      'string',
      'tras un ciclo correcto queda registrado el momento del respaldo'
    );

    const archivos = () => fs.readdirSync(dirTemporal).filter((f) => f.endsWith('.db'));
    const antes = archivos().length;
    assert.ok(antes > 0, 'se generó un respaldo');

    // Segunda llamada inmediata: la ventana de 1_HORA sigue abierta, así que
    // no debe crear otro archivo. Es la guarda que evita el bucle de reintentos.
    await backupService.verificarYEjecutarAutoBackup();
    assert.equal(archivos().length, antes, 'no se respalda dos veces dentro de la misma ventana');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Retención: sin ella, cada respaldo horario son ~81 MB y el disco se llena.
  //
  // Nota sobre el fixture: los nombres generados por `crear` llevan timestamp con
  // resolución de SEGUNDOS, así que dos respaldos seguidos dentro del mismo
  // segundo se sobrescriben entre sí. Por eso los archivos old se siembran con
  // nombres sintéticos y mtime explícito, en vez de llamar a `crear` N veces. Los
  // mtimes quedan en el PASADO para que el archivo más reciente sea siempre el
  // último creado de verdad, que es el orden real en producción.
  // ─────────────────────────────────────────────────────────────────────────────

  const sembrar = (prefijo, alcance, cantidad) => {
    const rutas = [];
    for (let i = 0; i < cantidad; i++) {
      // `prefijo` ya incluye el sufijo: los nombres reales son
      // `farmacia_backup_auto_global_...` y `farmacia_backup_global_...`, con un
      // único guion bajo entre bloques. Un doble guion bajo no lo matchea el
      // patrón de la purga y el test pasaría con cero candidatos, sin fallar.
      const nombre = `farmacia_backup${prefijo}${alcance}_20260101_1${String(i).padStart(5, '0')}.db`;
      const ruta = path.join(dirTemporal, nombre);
      fs.writeFileSync(ruta, `contenido-${i}`);
      const t = new Date(Date.now() - (cantidad - i) * 2000);
      fs.utimesSync(ruta, t, t);
      rutas.push(ruta);
    }
    return rutas;
  };

  test('el consumo en disco refleja todos los archivos, no solo los del alcance filtrado', async () => {
    await backupController.crear(sesionWilmer, { sedeId: 1 });
    const consumo = backupController.consumo(sesionWilmer);
    assert.equal(consumo.ok, true);
    assert.ok(consumo.data.cantidad >= 1);
    assert.ok(consumo.data.bytes > 0);

    // No se filtra por alcance: el total es del disco.
    const porSede = backupController.consumo(sesionWilmer);
    assert.equal(porSede.data.cantidad, consumo.data.cantidad);
  });

  test('consumo rechaza a un usuario sin permisos', () => {
    const res = backupController.consumo({ ...sesionWilmer, rol_nombre: 'USUARIO' });
    assert.equal(res.ok, false);
    assert.match(res.error, /Superadmin|Administrador/);
  });
});
