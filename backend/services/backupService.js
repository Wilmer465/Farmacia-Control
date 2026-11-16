const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const Database = require('better-sqlite3');
const { getDb, resolveDbPath, closeDb } = require('../database/connection');
const { restoreDatabase } = require('../database/startupRecovery');
const { adquirirPausaSincronizacionParaMantenimiento } = require('./cloudSyncService');
const {
  TABLAS_REQUERIDAS,
  crearManifiestoRespaldo,
  leerManifiesto,
  validarContenidoRespaldo,
  rutaManifiesto,
  setClaveManifiestoPath
} = require('./backupManifest');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { AUDIT_ACTIONS, ROLES } = require('../../shared/constants');

class ValidationError extends Error {}

class RespaldoInvalidoError extends ValidationError {
  constructor(codigo, mensaje, causa = null) {
    super(mensaje);
    this.name = 'RespaldoInvalidoError';
    this.codigo = codigo;
    this.causa = causa;
  }
}

function verificarAccesoRespaldos(usuarioSesion) {
  if (!usuarioSesion || ![ROLES.SUPERADMIN, ROLES.ADMIN].includes(usuarioSesion.rol_nombre)) {
    throw new permisoService.PermisoError('Solo el Superadmin y el Administrador de sede pueden gestionar respaldos.');
  }
}

// `carpetaRespaldos()` y `rutaConfigAutoBackup()` se derivan de resolveDbPath(),
// que en tests apunta al archivo real de data/ y no a la base en memoria. Sin
// este override, un test escribiria en data/backups, `restaurar` sobrescribiria
// la base de desarrollo y `guardarConfigAutoBackup` pisaria el backup_config.json
// real. Solo lo usan los tests.
let directorioOverride = null;

function setDirectorioRespaldos(dir) {
  directorioOverride = dir;
}

function carpetaRespaldos() {
  if (directorioOverride) {
    if (!fs.existsSync(directorioOverride)) fs.mkdirSync(directorioOverride, { recursive: true });
    return directorioOverride;
  }
  const dbPath = resolveDbPath();
  const dir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rutaConfigAutoBackup() {
  if (directorioOverride) return path.join(directorioOverride, 'backup_config.json');
  const dbPath = resolveDbPath();
  return path.join(path.dirname(dbPath), 'backup_config.json');
}

function timestampArchivo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Corre PRAGMA integrity_check sobre un archivo de respaldo SIN tocar la base de
// datos activa — abre una conexión aparte, de solo lectura, y la cierra al terminar.
function validarIntegridad(rutaArchivo) {
  let conexionTemporal;
  try {
    conexionTemporal = new Database(rutaArchivo, { readonly: true, fileMustExist: true });
    const resultado = conexionTemporal.pragma('integrity_check');
    const ok = Array.isArray(resultado) && resultado.length === 1 && resultado[0].integrity_check === 'ok';
    const clavesForaneas = conexionTemporal.pragma('foreign_key_check');
    return { ok: ok && clavesForaneas.length === 0, detalle: { integridad: resultado, clavesForaneas } };
  } catch (err) {
    return { ok: false, detalle: err.message };
  } finally {
    if (conexionTemporal) conexionTemporal.close();
  }
}

function motivoNoRestaurable(err) {
  const texto = String(err && err.message ? err.message : '');
  if (/no tiene manifiesto/i.test(texto)) return 'Sin manifiesto de autenticidad.';
  if (/firma|clave|autenticidad/i.test(texto)) return 'Autenticidad no verificada.';
  if (/huella|tamaño|coincide/i.test(texto)) return 'El contenido no coincide con su manifiesto.';
  return 'No verificable con la clave local.';
}

async function listar(usuarioSesion, filtros = {}) {
  verificarAccesoRespaldos(usuarioSesion);

  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, filtros?.sedeId);

  const dir = carpetaRespaldos();
  const archivos = await fsp.readdir(dir);
  const archivosDb = archivos.filter((f) => f.endsWith('.db'));

  const listado = await Promise.all(archivosDb.map(async (nombre) => {
    const rutaCompleta = path.join(dir, nombre);
    const stats = await fsp.stat(rutaCompleta);
    let manifiesto = null;
    let motivo = null;
    try {
      manifiesto = leerManifiesto(rutaCompleta, nombre);
    } catch (err) {
      // Un archivo sin manifiesto válido no es restaurable. Se muestra solo a
      // SUPERADMIN para que pueda auditarlo/sustituirlo, nunca se ofrece como
      // si fuera una copia auténtica.
      motivo = motivoNoRestaurable(err);
    }

    return {
      nombre,
      fecha: stats.mtime.toISOString(),
      tamanoBytes: stats.size,
      esAutomatico: manifiesto ? manifiesto.automatico : nombre.includes('_auto_'),
      sedeId: manifiesto ? manifiesto.sedeId : sedeDeArchivoRespaldo(nombre),
      alcance: manifiesto ? manifiesto.alcance : null,
      restaurable: Boolean(manifiesto),
      motivoNoRestaurable: motivo
    };
  }));

  // Filtrado por sede: un respaldo contiene la BD COMPLETA (todas las sedes,
  // hashes y auditoría), así que un ADMIN de sede solo ve los de su sede.
  // Los `_global` (sedeId null, incluidos todos los automáticos) son exclusivos
  // de SUPERADMIN (visión global). Mostrarlos a ADMIN era escalación cross-sede.
  // Para un ADMIN solo cuentan los manifiestos verificados: el nombre del
  // archivo no acredita la sede de origen.
  const filtrados = listado.filter((b) => {
    if (sedeEfectiva !== null && sedeEfectiva !== undefined) {
      return b.restaurable && b.alcance === 'SEDE' && Number(b.sedeId) === Number(sedeEfectiva);
    }
    return true;
  });

  filtrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  return filtrados;
}

// Espacio libre en el volumen donde vive la carpeta de respaldos. Devuelve null si
// el runtime no expone statfs: en ese caso no se bloquea la creación, porque
// avisar de "disco lleno" cuando no se ha podido medir sería peor que no avisar.
function espacioLibreBytes(dir) {
  try {
    const stat = fs.statfsSync(dir);
    return Number(stat.bavail) * Number(stat.bsize);
  } catch {
    return null;
  }
}

// Comprobación previa: db.backup() necesita del orden del tamaño actual de la base
// en disco. Sin esta comprobación el fallo llega como ENOSPC del sistema, que no
// dice nada útil. Se pide 1.2x el tamaño de la base: el archivo .db no crece
// necesariamente al copiarse, pero la escritura del WAL y el margen del sistema de
// archivos necesitan espacio extra.
function comprobarEspacioDisponible(dir) {
  const disponible = espacioLibreBytes(dir);
  if (disponible === null) return null;

  let tamanoBase = 0;
  try {
    const rutaBase = resolveDbPath();
    tamanoBase = fs.statSync(rutaBase).size;
    // Incluir WAL/SHM vivos: db.backup() los recorre página a página y el
    // chequeo solo con el .db subestimaba el espacio necesario.
    for (const sufijo of ['-wal', '-shm']) {
      try {
        tamanoBase += fs.statSync(rutaBase + sufijo).size;
      } catch { /* companion inexistente: no suma */ }
    }
  } catch {
    return null;
  }
  if (tamanoBase === 0) return null;

  const necesario = Math.ceil(tamanoBase * 1.2);
  if (disponible >= necesario) return null;

  return new ValidationError(
    `No hay espacio suficiente en el disco para crear el respaldo. `
    + `Se necesitan ${formatearBytes(necesario)} y hay ${formatearBytes(disponible)}.`
  );
}

function formatearBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

// `crear` es asincrona porque db.backup() devuelve una Promise: es la API online
// de SQLite y produce un archivo consistente aunque haya escrituras concurrentes,
// cosa que copyFileSync no garantiza entre el checkpoint y la copia.
// `db.backup()` deja los companion files -wal/-shm junto al destino, aunque el
// .db ya este completo y sea autonomo (verificado:integrity_check ok y conteos
// identicos a la base viva abriendo solo el .db). `restaurar` copia unicamente
// el .db, asi que esos residuos no aportan nada y solo clutteran el listado.
//
// El -wal solo se borra si esta VACIO. Si alguna vez quedara con contenido,
// borrarlo perderia datos: en ese caso se deja y se avisa.
function limpiarCompanionFiles(destino) {
  for (const sufijo of ['-wal', '-shm']) {
    const ruta = destino + sufijo;
    if (!fs.existsSync(ruta)) continue;
    try {
      if (sufijo === '-wal' && fs.statSync(ruta).size > 0) {
        console.warn('[backupService] -wal con contenido, se conserva:', ruta);
        continue;
      }
      fs.unlinkSync(ruta);
    } catch (err) {
      console.warn(`[backupService] No se pudo eliminar ${ruta}:`, err.message);
    }
  }
}

// `db.backup()` puede dejar un `-wal` propio con páginas pendientes (por
// ejemplo, cuando la base activa acabó de escribir auditoría o el mantenimiento
// de `optimize`/`incremental_vacuum` generó frames). Un respaldo con companion
// con contenido no es una copia autónoma y, si se aceptara, podría restaurarse
// sin las últimas páginas o con un WAL ajeno. Se abre la copia, se consolida en
// el `.db` y se pasa a journal DELETE; recién entonces se firma la huella.
function consolidarRespaldo(rutaArchivo) {
  const conexion = new Database(rutaArchivo);
  try {
    conexion.pragma('busy_timeout = 5000');
    const modo = conexion.pragma('journal_mode = DELETE', { simple: true });
    if (String(modo).toLowerCase() !== 'delete') {
      throw new Error('No se pudo consolidar el respaldo en un archivo SQLite autónomo.');
    }
    for (const sufijo of ['-wal', '-shm']) {
      const ruta = `${rutaArchivo}${sufijo}`;
      if (!fs.existsSync(ruta)) continue;
      if (fs.statSync(ruta).size > 0) {
        throw new Error('El respaldo conserva archivos auxiliares SQLite con contenido.');
      }
      fs.unlinkSync(ruta);
    }
  } finally {
    if (conexion.open) conexion.close();
  }
}

async function crear(usuarioSesion, opciones = {}) {
  const esAutomatico = typeof opciones === 'boolean' ? opciones : Boolean(opciones?.esAutomatico);
  const sedeIdSolicitada = typeof opciones === 'object' ? opciones?.sedeId : null;

  if (!esAutomatico) {
    verificarAccesoRespaldos(usuarioSesion);
  }

  const db = getDb();
  try {
    db.pragma('wal_checkpoint(FULL)');
    // `optimize` decide con datos reales qué índices sobran y los reconstruye.
    // Antes se ejecutaba `incremental_vacuum(100)`, que liberaba 100 páginas
    // (400 KB) y nada más: auto_vacuum=INCREMENTAL no surte efecto sobre una base
    // que ya tenía tablas —SQLite lo ignora— y solo empieza a funcionar tras un
    // VACUUM completo, que es lo que hace la migración 026. Ahora se pide el
    // vacuum incremental COMPLETO; si sigue sin hacer nada, es inocuo y barato.
    db.pragma('optimize');
    db.pragma('incremental_vacuum');
  } catch (errPragma) {
    console.warn('[backupService] Warning ejecutando pragma de mantenimiento:', errPragma.message);
  }

  const sedeEfectiva = esAutomatico
    ? null
    : permisoService.resolverSedeEfectiva(usuarioSesion, sedeIdSolicitada);

  const sedeNombre = sedeEfectiva
    ? (usuarioSesion?.sede_nombre && Number(usuarioSesion?.sede_id) === Number(sedeEfectiva)
        ? usuarioSesion.sede_nombre
        : `sede_${sedeEfectiva}`)
    : null;
  const alcanceTag = sedeEfectiva
    ? `_sede_${String(sedeNombre).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ]/g, '')}`
    : '_global';

  const dir = carpetaRespaldos();
  const prefijo = esAutomatico ? 'farmacia_backup_auto' : 'farmacia_backup';
  const nombre = `${prefijo}${alcanceTag}_${timestampArchivo()}.db`;
  const destino = path.join(dir, nombre);

  const errorEspacio = comprobarEspacioDisponible(dir);
  if (errorEspacio) throw errorEspacio;

  await db.backup(destino);

  let errorConsolidacion = null;
  try {
    consolidarRespaldo(destino);
  } catch (err) {
    errorConsolidacion = err;
  }
  limpiarCompanionFiles(destino);

  const integridad = errorConsolidacion
    ? { ok: false, detalle: errorConsolidacion.message }
    : validarIntegridad(destino);
  const stats = fs.statSync(destino);

  let manifiesto = null;
  let errorManifiesto = null;
  if (integridad.ok) {
    try {
      manifiesto = await crearManifiestoRespaldo(destino, {
        nombre,
        automatico: esAutomatico,
        sedeId: sedeEfectiva ?? null,
        sedeNombre: sedeEfectiva ? sedeNombre : null
      });
    } catch (err) {
      errorManifiesto = err;
    }
  }

  // Si no se pudo verificar o firmar el respaldo, se elimina. Un .db sin
  // manifiesto válido no sería restaurable por diseño y dejarlo en la carpeta
  // solo confundiría al operador.
  if (!integridad.ok || errorManifiesto) {
    if (errorManifiesto) {
      console.error('[backupService] No se pudo firmar el respaldo:', errorManifiesto.message);
    }
    try { fs.rmSync(destino, { force: true }); } catch { /* limpieza best-effort */ }
    try { fs.rmSync(rutaManifiesto(destino), { force: true }); } catch { /* idem */ }

    if (!esAutomatico && usuarioSesion) {
      try {
        auditoriaRepository.registrar({
          usuario_id: usuarioSesion.id,
          rol: usuarioSesion.rol_nombre,
          sede_id: sedeEfectiva ?? usuarioSesion.sede_id ?? null,
          accion: AUDIT_ACTIONS.CREAR_RESPALDO,
          modulo: 'RESPALDOS',
          registro_afectado: nombre,
          resultado: 'FALLIDO',
          valores_nuevos: {
            nombre,
            automatico: esAutomatico,
            sede_id: sedeEfectiva ?? usuarioSesion.sede_id ?? null,
            motivo: integridad.ok ? 'SIN_FIRMA' : 'INTEGRIDAD'
          }
        });
      } catch (errAuditoria) {
        console.error('[backupService] No se pudo auditar el fallo de creación:', errAuditoria.message);
      }
    }

    if (!integridad.ok) {
      throw new ValidationError('No se pudo crear un respaldo íntegro. El archivo fue descartado.');
    }
    throw new ValidationError('No se pudo firmar el respaldo para verificar su autenticidad. El archivo fue descartado.');
  }

  // Para respaldos automáticos, no hay usuario real; no registrar en auditoría para evitar FK constraint
  if (!esAutomatico && usuarioSesion) {
    const usuarioId = usuarioSesion.id;
    const rol = usuarioSesion.rol_nombre;
    const sedeId = sedeEfectiva ?? usuarioSesion.sede_id ?? null;

    auditoriaRepository.registrar({
      usuario_id: usuarioId,
      rol: rol,
      sede_id: sedeId,
      accion: AUDIT_ACTIONS.CREAR_RESPALDO,
      modulo: 'RESPALDOS',
      registro_afectado: nombre,
      resultado: 'EXITO',
      valores_nuevos: {
        nombre,
        integridad: true,
        automatico: esAutomatico,
        sede_id: sedeId,
        firma: manifiesto.claveId
      }
    });
  }

  return {
    nombre,
    fecha: stats.mtime.toISOString(),
    tamanoBytes: stats.size,
    integridad: true,
    esAutomatico,
    sedeId: sedeEfectiva,
    restaurable: true,
    firma: manifiesto.claveId
  };
}

function sedeDeArchivoRespaldo(nombreArchivo) {
  const match = String(nombreArchivo || '').match(/_sede_(\d+)/);
  return match ? Number(match[1]) : null;
}

// Los respaldos válidos los genera este mismo servicio:
// farmacia_backup[_auto]_global_AAAAMMDD_HHMMSS.db
// farmacia_backup[_auto]_sede_<nombre>_AAAAMMDD_HHMMSS.db
// Restaurar cualquier otro archivo de la carpeta permitiría introducir una BD
// ajena al flujo de respaldos (p. ej. copiada manualmente) y confiar en ella.
const PATRON_NOMBRE_RESPALDO = /^farmacia_backup(?:_auto)?_(?:global|sede_[A-Za-z0-9_áéíóúñÁÉÍÓÚÑ]+)_\d{8}_\d{6}\.db$/;

function nombreRespaldoSeguro(nombreArchivo) {
  if (!nombreArchivo || typeof nombreArchivo !== 'string') return null;
  const base = path.basename(nombreArchivo);
  return base && !base.includes('..') ? base.slice(0, 200) : null;
}

function auditarRestauracion(usuarioSesion, nombreArchivo, resultado, valores = {}) {
  try {
    auditoriaRepository.registrar({
      usuario_id: usuarioSesion?.id ?? null,
      rol: usuarioSesion?.rol_nombre ?? null,
      sede_id: usuarioSesion?.sede_id ?? null,
      accion: AUDIT_ACTIONS.RESTAURAR_RESPALDO,
      modulo: 'RESPALDOS',
      registro_afectado: nombreRespaldoSeguro(nombreArchivo),
      resultado,
      valores_nuevos: valores
    });
  } catch (err) {
    // La auditoría nunca debe ocultar el resultado real de la restauración.
    console.error('[backupService] No se pudo registrar la auditoría de restauración:', err.message);
  }
}

function auditarExitoEnStaging(stagePath, usuarioSesion, nombreArchivo, manifiesto) {
  const db = new Database(stagePath);
  try {
    // El staging se abre en modo DELETE para que la escritura de auditoría no
    // deje un -wal con contenido; después el proceso normal vuelve a WAL.
    db.pragma('journal_mode = DELETE');
    db.pragma('foreign_keys = ON');
    const usuarioExiste = usuarioSesion?.id
      ? db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(usuarioSesion.id)
      : null;
    auditoriaRepository.registrarConConexion(db, {
      usuario_id: usuarioExiste ? usuarioSesion.id : null,
      rol: usuarioSesion?.rol_nombre ?? null,
      sede_id: usuarioSesion?.sede_id ?? null,
      accion: AUDIT_ACTIONS.RESTAURAR_RESPALDO,
      modulo: 'RESPALDOS',
      registro_afectado: nombreArchivo,
      resultado: 'EXITO',
      valores_nuevos: {
        nombre: nombreArchivo,
        alcance: manifiesto.alcance,
        sede_id: manifiesto.sedeId,
        usuario_id_original: usuarioSesion?.id ?? null,
        firma: manifiesto.claveId
      }
    });
  } finally {
    db.close();
  }
}

// El nombre del archivo no acredita la sede: la sede se toma del manifiesto
// firmado. Un ADMIN solo puede restaurar copias de su propia sede; los
// respaldos globales siguen siendo exclusivos de SUPERADMIN.
function verificarPermisoRestaurar(usuarioSesion, manifiesto) {
  verificarAccesoRespaldos(usuarioSesion);
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, null);
  if (sedeEfectiva === null || sedeEfectiva === undefined) return;
  if (manifiesto.alcance !== 'SEDE' || Number(manifiesto.sedeId) !== Number(sedeEfectiva)) {
    throw new permisoService.PermisoError('Solo puede restaurar respaldos de su propia sede.');
  }
}

function mensajeRechazoRespaldo(err) {
  const texto = String(err && err.message ? err.message : '');
  if (/SQLITE_NOTADB|not a database|malformed|disk image|no such table|no such column|SQLITE_CORRUPT/i.test(texto)) {
    return 'El archivo no es una base de datos SQLite válida o está dañado. No se restauró.';
  }
  if (/no tiene manifiesto|manifiesto.*(corrupto|formato|tamaño|objeto|inválid|fecha)/i.test(texto)) {
    return 'El respaldo no tiene un manifiesto de autenticidad válido. No se restauró.';
  }
  if (/firma|clave|autenticidad/i.test(texto)) {
    return 'No se pudo verificar la autenticidad del respaldo. No se restauró.';
  }
  // El esquema se evalúa antes que la coincidencia genérica de tamaño/huella:
  // los errores de migraciones y de huella de esquema contienen "no coincide" y
  // deben explicarse como incompatibilidad, no como corrupción del contenido.
  if (/migraciones|esquema|versión de usuario|tabla/i.test(texto)) {
    return 'El respaldo no es compatible con el esquema de esta versión. No se restauró.';
  }
  if (/huella|tamaño|coincide/i.test(texto)) {
    return 'El contenido del respaldo no coincide con su registro de autenticidad. No se restauró.';
  }
  return 'El respaldo no superó la validación de seguridad. No se restauró.';
}

async function restaurar(usuarioSesion, nombreArchivo) {
  try {
    verificarAccesoRespaldos(usuarioSesion);
  } catch (err) {
    // Un intento de restauración sin rol suficiente también es un evento
    // auditable: deja rastro del usuario y del archivo solicitado sin ejecutar
    // ninguna operación sobre la base activa.
    auditarRestauracion(usuarioSesion, nombreArchivo, 'FALLIDO', { motivo: 'SIN_PERMISO' });
    throw err;
  }

  if (!nombreArchivo || typeof nombreArchivo !== 'string') {
    auditarRestauracion(usuarioSesion, null, 'FALLIDO', { motivo: 'NOMBRE_INVALIDO' });
    throw new ValidationError('Nombre de respaldo inválido.');
  }
  const nombreLimpio = path.basename(nombreArchivo);
  if (nombreLimpio !== nombreArchivo || nombreLimpio.includes('..') || nombreLimpio.length === 0) {
    auditarRestauracion(usuarioSesion, null, 'FALLIDO', { motivo: 'NOMBRE_INVALIDO' });
    throw new ValidationError('Nombre de respaldo inválido.');
  }
  if (!PATRON_NOMBRE_RESPALDO.test(nombreLimpio)) {
    auditarRestauracion(usuarioSesion, nombreLimpio, 'FALLIDO', { motivo: 'FORMATO_NOMBRE' });
    throw new ValidationError('El archivo no tiene el formato de un respaldo generado por la aplicación.');
  }

  const dir = carpetaRespaldos();
  const rutaRespaldo = path.join(dir, nombreLimpio);

  // Validación adicional: asegurar que la ruta resuelta esté DENTRO del directorio de respaldos
  const dirResuelto = path.resolve(dir);
  const rutaResuelta = path.resolve(rutaRespaldo);
  if (!rutaResuelta.startsWith(dirResuelto + path.sep) && rutaResuelta !== dirResuelto) {
    auditarRestauracion(usuarioSesion, null, 'FALLIDO', { motivo: 'RUTA_INVALIDA' });
    throw new ValidationError('Nombre de respaldo inválido (intento de path traversal).');
  }

  if (!fs.existsSync(rutaRespaldo)) {
    auditarRestauracion(usuarioSesion, nombreLimpio, 'FALLIDO', { motivo: 'NO_EXISTE' });
    throw new ValidationError('El respaldo indicado no existe.');
  }

  // Validar autenticidad, tamaño, huella y esquema ANTES de pausar la
  // sincronización o tocar la base activa. Cualquier fallo aquí deja la BD
  // exactamente como estaba.
  let manifiesto;
  try {
    manifiesto = leerManifiesto(rutaRespaldo, nombreLimpio);
    verificarPermisoRestaurar(usuarioSesion, manifiesto);
    await validarContenidoRespaldo(rutaRespaldo, manifiesto);
  } catch (err) {
    if (err instanceof permisoService.PermisoError) {
      auditarRestauracion(usuarioSesion, nombreLimpio, 'FALLIDO', { motivo: 'PERMISO' });
      throw err;
    }
    const mensaje = mensajeRechazoRespaldo(err);
    auditarRestauracion(usuarioSesion, nombreLimpio, 'FALLIDO', { motivo: 'VALIDACION' });
    throw new RespaldoInvalidoError('RESPALDO_RECHAZADO', mensaje, err);
  }

  const dbPath = resolveDbPath();
  const syncState = path.join(path.dirname(dbPath), 'cloud_sync_state.json');
  const reanudarSincronizacion = await adquirirPausaSincronizacionParaMantenimiento();
  try {
    await restoreDatabase({
      databasePath: dbPath,
      cursorPath: syncState,
      sourceBackupPath: rutaRespaldo,
      activeDb: getDb(),
      closeActiveDb: closeDb,
      requiredTables: TABLAS_REQUERIDAS,
      expectedSha256: manifiesto.sha256,
      expectedMigrations: manifiesto.esquema.migraciones,
      expectedSchemaSha256: manifiesto.esquema.sha256,
      expectedUserVersion: manifiesto.esquema.userVersion,
      beforePromote: async ({ stagePath }) => {
        // La auditoría de éxito entra en el staging antes de promover: si esta
        // escritura falla, el rollback conserva la base activa y no se promueve
        // un respaldo sin registro de la operación.
        auditarExitoEnStaging(stagePath, usuarioSesion, nombreLimpio, manifiesto);
      }
    });

    return { restaurado: true, nombre: nombreLimpio };
  } catch (err) {
    auditarRestauracion(usuarioSesion, nombreLimpio, 'FALLIDO', { motivo: 'FALLO_RESTAURACION' });
    throw new RespaldoInvalidoError(
      'FALLO_RESTAURACION',
      'No se pudo completar la restauración. No se reinició la aplicación.',
      err
    );
  } finally {
    reanudarSincronizacion();
  }
}

async function ultimoRespaldo(usuarioSesion, filtros = {}) {
  const listado = await listar(usuarioSesion, filtros);
  return listado.length > 0 ? listado[0] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN Y PLANIFICADOR DE RESPALDOS AUTOMÁTICOS
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_POR_DEFECTO = {
  habilitado: true,
  frecuencia: '1_HORA', // '1_HORA' | '6_HORAS' | '12_HORAS' | 'DIARIO' | 'SEMANAL' | 'MENSUAL'
  hora: '02:00',         // Para diario/semanal/mensual
  dia_semana: 1,         // 1 = Lunes
  dia_mes: 1,            // Día 1 del mes
  ultimo_backup_auto: null
};

// Tamaño total ocupado por los respaldos, para que el operador vea el consumo en
// la pantalla en vez de discoverlo cuando el disco se llena.
function tamanoTotalEnDisco(dir = null) {
  const carpeta = dir || carpetaRespaldos();
  let bytes = 0;
  let cantidad = 0;
  try {
    for (const nombre of fs.readdirSync(carpeta)) {
      if (!nombre.endsWith('.db')) continue;
      try {
        bytes += fs.statSync(path.join(carpeta, nombre)).size;
        cantidad += 1;
      } catch {
        continue;
      }
    }
  } catch {
    return { bytes: 0, cantidad: 0, carpeta };
  }
  return { bytes, cantidad, carpeta };
}

function obtenerConfigAutoBackup(usuarioSesion) {
  if (usuarioSesion) verificarAccesoRespaldos(usuarioSesion);
  const ruta = rutaConfigAutoBackup();
  try {
    if (fs.existsSync(ruta)) {
      const data = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      return { ...CONFIG_POR_DEFECTO, ...data };
    }
  } catch (err) {
    console.error('[backupService] Error al leer config auto-backup:', err);
  }
  return { ...CONFIG_POR_DEFECTO };
}

function guardarConfigAutoBackup(usuarioSesion, nuevaConfig) {
  verificarAccesoRespaldos(usuarioSesion);
  const configActual = obtenerConfigAutoBackup();
  const fusion = { ...configActual, ...nuevaConfig };

  const ruta = rutaConfigAutoBackup();
  fs.writeFileSync(ruta, JSON.stringify(fusion, null, 2), 'utf8');

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: usuarioSesion.sede_id,
    accion: AUDIT_ACTIONS.ACTUALIZAR_CONFIG,
    modulo: 'RESPALDOS',
    registro_afectado: 'backup_config.json',
    resultado: 'EXITO',
    valores_nuevos: fusion
  });

  return fusion;
}

let planificadorInterval = null;

// Es asincrona porque `crear` lo es. El timestamp se escribe SIEMPRE, incluso
// si el respaldo falla: de lo contrario `debeEjecutar` volvería a ser true en
// los siguiente chequeo (cada 60 s) y el planificador reintentaria en bucle
// cuando la causa del fallo sea persistente (disco lleno, permisos).
async function verificarYEjecutarAutoBackup() {
  const config = obtenerConfigAutoBackup();
  if (!config.habilitado) return;

  const ahora = new Date();
  const ultimo = config.ultimo_backup_auto ? new Date(config.ultimo_backup_auto) : null;

  let debeEjecutar = false;

  if (config.frecuencia === '1_HORA') {
    const diffMs = ultimo ? ahora.getTime() - ultimo.getTime() : Infinity;
    if (diffMs >= 60 * 60 * 1000) debeEjecutar = true;
  } else if (config.frecuencia === '6_HORAS') {
    const diffMs = ultimo ? ahora.getTime() - ultimo.getTime() : Infinity;
    if (diffMs >= 6 * 60 * 60 * 1000) debeEjecutar = true;
  } else if (config.frecuencia === '12_HORAS') {
    const diffMs = ultimo ? ahora.getTime() - ultimo.getTime() : Infinity;
    if (diffMs >= 12 * 60 * 60 * 1000) debeEjecutar = true;
  } else if (config.frecuencia === 'DIARIO') {
    const [h, m] = (config.hora || '02:00').split(':').map(Number);
    const esMismoDia = ultimo && ultimo.toDateString() === ahora.toDateString();
    if (!esMismoDia && (ahora.getHours() > h || (ahora.getHours() === h && ahora.getMinutes() >= m))) {
      debeEjecutar = true;
    }
  } else if (config.frecuencia === 'SEMANAL') {
    const diaTarget = Number(config.dia_semana || 1); // 1 = Lunes
    const diaActual = ahora.getDay() === 0 ? 7 : ahora.getDay();
    const [h, m] = (config.hora || '02:00').split(':').map(Number);
    const diffDias = ultimo ? Math.floor((ahora.getTime() - ultimo.getTime()) / (24 * 60 * 60 * 1000)) : Infinity;
    if (diffDias >= 6 && diaActual === diaTarget && (ahora.getHours() > h || (ahora.getHours() === h && ahora.getMinutes() >= m))) {
      debeEjecutar = true;
    }
  } else if (config.frecuencia === 'MENSUAL') {
    const diaTarget = Number(config.dia_mes || 1);
    const [h, m] = (config.hora || '02:00').split(':').map(Number);
    const diffDias = ultimo ? Math.floor((ahora.getTime() - ultimo.getTime()) / (24 * 60 * 60 * 1000)) : Infinity;
    if (diffDias >= 25 && ahora.getDate() === diaTarget && (ahora.getHours() > h || (ahora.getHours() === h && ahora.getMinutes() >= m))) {
      debeEjecutar = true;
    }
  }

  if (!debeEjecutar) return;

  let nombre = null;
  try {
    console.log('[backupService] 🚀 Ejecutando respaldo automático programado...');
    const res = await crear(null, true);
    nombre = res.nombre;
  } catch (err) {
    console.error('[backupService] ❌ Error en respaldo automático:', err);
  } finally {
    config.ultimo_backup_auto = new Date().toISOString();
    const ruta = rutaConfigAutoBackup();
    try {
      fs.writeFileSync(ruta, JSON.stringify(config, null, 2), 'utf8');
    } catch (err) {
      console.error('[backupService] No se pudo actualizar backup_config.json:', err.message);
    }
    if (nombre) console.log(`[backupService] ✅ Respaldo automático completado: ${nombre}`);
  }
}

function iniciarPlanificadorAutoBackup() {
  if (planificadorInterval) clearInterval(planificadorInterval);
  // El intervalo no espera la promesa: un rechazo sin capturar tumba el proceso
  // principal de Electron. El error ya se registra dentro de la propia funcion.
  const ejecutar = () => { verificarYEjecutarAutoBackup().catch(() => {}); };
  // Revisión periódica cada 60 segundos
  planificadorInterval = setInterval(ejecutar, 60 * 1000);
  // Ejecutar primera verificación a los 5 segundos de iniciar
  setTimeout(ejecutar, 5000);
  console.log('[backupService] ⏰ Planificador de respaldos automáticos iniciado.');
}

module.exports = {
  verificarAccesoRespaldos,
  listar,
  crear,
  restaurar,
  validarIntegridad,
  ultimoRespaldo,
  obtenerConfigAutoBackup,
  guardarConfigAutoBackup,
  iniciarPlanificadorAutoBackup,
  verificarYEjecutarAutoBackup,
  setDirectorioRespaldos,
  setClaveManifiestoPath,
  tamanoTotalEnDisco,
  ValidationError,
  RespaldoInvalidoError
};
