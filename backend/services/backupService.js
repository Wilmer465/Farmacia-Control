const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const Database = require('better-sqlite3');
const { getDb, resolveDbPath, closeDb } = require('../database/connection');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { AUDIT_ACTIONS, ROLES } = require('../../shared/constants');

class ValidationError extends Error {}

// Sin retención, cada respaldo automático horario son ~81 MB: ~2 GB diarios que
// acaban llenando el disco, y entonces fallan a la vez el automático y el manual.
// 20 automáticos equivalen a ~20 h de historia con frecuencia horaria, o ~20 días
// con frecuencia diaria.
const MAXIMO_RESPALDOS_POR_DEFECTO = 20;

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
    return { ok, detalle: resultado };
  } catch (err) {
    return { ok: false, detalle: err.message };
  } finally {
    if (conexionTemporal) conexionTemporal.close();
  }
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
    const match = nombre.match(/_sede_(\d+)/);
    const sedeIdArchivo = match ? Number(match[1]) : null;

    return {
      nombre,
      fecha: stats.mtime.toISOString(),
      tamanoBytes: stats.size,
      esAutomatico: nombre.includes('_auto_'),
      sedeId: sedeIdArchivo
    };
  }));

  // Filtrado por sede: si se seleccionó una sede, mostrar respaldos de esa sede o globales
  const filtrados = listado.filter((b) => {
    if (sedeEfectiva !== null && sedeEfectiva !== undefined) {
      return b.sedeId === Number(sedeEfectiva) || b.sedeId === null;
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
  } catch (err) {
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
    tamanoBase = fs.statSync(resolveDbPath()).size;
  } catch (err) {
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

// RETENCIÓN.
//
// Reglas deliberadas, cada una con un motivo:
//  - Solo toca archivos `farmacia_backup_auto*`. Un respaldo manual es una decisión
//    explícita de una persona; borrarlo porque el planificador lo decidió sería
//    inaceptable.
//  - Cuenta por ALCANCE DE SEDE, no globalmente: los respaldos de una sede no
//    pueden empujar los de otra. El alcance va en el nombre (`_sede_12` o
//    `_global`), que es la única información de sede que tiene un archivo suelto.
//  - Orden por fecha de modificación, no por nombre: el timestamp del nombre tiene
//    resolución de segundos y dos respaldos del mismo segundo se ordenarían mal.
//  - Nunca borra el archivo recién creado: se llama con `protegerNombre` para que
//    una retención mal calculada no destruya el respaldo que acaba de validarse.
function purgarRespaldosAntiguos({ alcanceTag, maximo, protegerNombre, dir }) {
  const limite = Number.isInteger(maximo) && maximo > 0 ? maximo : MAXIMO_RESPALDOS_POR_DEFECTO;
  const patron = new RegExp(`^farmacia_backup_auto${alcanceTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_.+\\.db$`);

  let archivos;
  try {
    archivos = fs.readdirSync(dir);
  } catch (err) {
    console.warn('[backupService] No se pudo leer la carpeta para purgar:', err.message);
    return { eliminados: [], bytesLiberados: 0, limite };
  }

  const candidatos = [];
  for (const nombre of archivos) {
    if (!patron.test(nombre)) continue;
    if (nombre === protegerNombre) continue;
    let stats;
    try {
      stats = fs.statSync(path.join(dir, nombre));
    } catch (err) {
      continue;
    }
    candidatos.push({ nombre, mtime: stats.mtimeMs, bytes: stats.size });
  }

  // Más ANTIGUO primero, y se purga desde el principio de la lista. Ordenar al
  // revés y hacer `slice(0, aPurgar)` parece igual, pero borra justo los más
  // recientes y deja los viejos: el test de retención lo detecta.
  // El desempate por nombre mantiene un orden estable entre ejecuciones cuando dos
  // respaldos comparten mtime.
  candidatos.sort((a, b) => (a.mtime - b.mtime) || a.nombre.localeCompare(b.nombre));

  // Tras purgar deben quedar `limite` archivos del alcance. Si se pasa
  // `protegerNombre` —el respaldo recién creado y validado— ese archivo ya cuenta
  // para el límite y se excluye de `candidatos`, así que de ellos solo se
  // conservan `limite - 1`. Sin él, se conservan `limite`.
  const aConservar = Math.max(protegerNombre ? limite - 1 : limite, 0);
  const aPurgar = candidatos.length - aConservar;
  if (aPurgar <= 0) return { eliminados: [], bytesLiberados: 0, limite };

  const eliminados = [];
  let bytesLiberados = 0;
  for (const cand of candidatos.slice(0, aPurgar)) {
    try {
      fs.unlinkSync(path.join(dir, cand.nombre));
      eliminados.push(cand.nombre);
      bytesLiberados += cand.bytes;
    } catch (err) {
      console.warn(`[backupService] No se pudo purgar ${cand.nombre}:`, err.message);
    }
  }

  if (eliminados.length > 0) {
    console.log(`[backupService] 🧹 Retención ${alcanceTag}: purgados ${eliminados.length} automáticos, liberados ${formatearBytes(bytesLiberados)}`);
  }

  return { eliminados, bytesLiberados, limite };
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

  const dir = carpetaRespaldos();
  const prefijo = esAutomatico ? 'farmacia_backup_auto' : 'farmacia_backup';
  const alcanceTag = sedeEfectiva ? `_sede_${sedeEfectiva}` : '_global';
  const nombre = `${prefijo}${alcanceTag}_${timestampArchivo()}.db`;
  const destino = path.join(dir, nombre);

  const errorEspacio = comprobarEspacioDisponible(dir);
  if (errorEspacio) throw errorEspacio;

  await db.backup(destino);

  limpiarCompanionFiles(destino);

  const integridad = validarIntegridad(destino);
  const stats = fs.statSync(destino);

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
      resultado: integridad.ok ? 'EXITO' : 'FALLIDO',
      valores_nuevos: { nombre, integridad: integridad.ok, automatico: esAutomatico, sede_id: sedeId }
    });
  }

  if (!integridad.ok) {
    throw new ValidationError('El respaldo se creó pero falló la validación de integridad.');
  }

  // Retención DESPUÉS de validar. Si el respaldo nuevo no hubiera pasado
  // validarIntegridad, la purga se salta y no se borra nada: preferimos un disco
  // lleno diagnosticable a perder historia con un respaldo roto.
  const purga = purgarRespaldosAntiguos({
    alcanceTag,
    maximo: maximoRespaldosPorSede(),
    protegerNombre: nombre,
    dir
  });

  return {
    nombre,
    fecha: stats.mtime.toISOString(),
    tamanoBytes: stats.size,
    integridad: integridad.ok,
    esAutomatico,
    sedeId: sedeEfectiva,
    purga: { eliminados: purga.eliminados, bytesLiberados: purga.bytesLiberados, limite: purga.limite }
  };
}

function restaurar(usuarioSesion, nombreArchivo) {
  verificarAccesoRespaldos(usuarioSesion);

  if (!nombreArchivo || typeof nombreArchivo !== 'string') {
    throw new ValidationError('Nombre de respaldo inválido.');
  }
  const nombreLimpio = path.basename(nombreArchivo);
  if (nombreLimpio !== nombreArchivo || nombreLimpio.includes('..') || nombreLimpio.length === 0) {
    throw new ValidationError('Nombre de respaldo inválido.');
  }

  const dir = carpetaRespaldos();
  const rutaRespaldo = path.join(dir, nombreLimpio);

  // Validación adicional: asegurar que la ruta resuelta esté DENTRO del directorio de respaldos
  const dirResuelto = path.resolve(dir);
  const rutaResuelta = path.resolve(rutaRespaldo);
  if (!rutaResuelta.startsWith(dirResuelto + path.sep) && rutaResuelta !== dirResuelto) {
    throw new ValidationError('Nombre de respaldo inválido (intento de path traversal).');
  }

  if (!fs.existsSync(rutaRespaldo)) {
    throw new ValidationError('El respaldo indicado no existe.');
  }

  const integridad = validarIntegridad(rutaRespaldo);
  if (!integridad.ok) {
    throw new ValidationError('El respaldo no pasó la validación de integridad. No se restauró nada.');
  }

  const dbPath = resolveDbPath();

  closeDb();
  fs.copyFileSync(rutaRespaldo, dbPath);
  for (const sufijo of ['-wal', '-shm']) {
    const rutaObsoleta = dbPath + sufijo;
    if (fs.existsSync(rutaObsoleta)) fs.unlinkSync(rutaObsoleta);
  }

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: usuarioSesion.sede_id,
    accion: AUDIT_ACTIONS.RESTAURAR_RESPALDO,
    modulo: 'RESPALDOS',
    registro_afectado: nombreArchivo,
    resultado: 'EXITO'
  });

  return { restaurado: true, nombre: nombreArchivo };
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
  maximo_respaldos_por_sede: MAXIMO_RESPALDOS_POR_DEFECTO,
  ultimo_backup_auto: null
};

// Límite de retención vigente. Se relee de la configuración en cada creación —y no
// como constante de módulo— para que cambiarlo desde la vista de Respaldos tenga
// efecto en el siguiente respaldo sin reiniciar la app. Un valor no numérico o no
// positivo cae al defecto en lugar de dejar la retención desactivada sin avisar.
function maximoRespaldosPorSede() {
  const config = obtenerConfigAutoBackup();
  const valor = Number(config.maximo_respaldos_por_sede);
  if (!Number.isInteger(valor) || valor <= 0) return MAXIMO_RESPALDOS_POR_DEFECTO;
  return valor;
}

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
      } catch (err) {
        continue;
      }
    }
  } catch (err) {
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

  // El límite de retención no puede quedar sin valor: si el formulario lo manda
  // vacío o en cero, `purgarRespaldosAntiguos` lo leería como "sin retención".
  const limite = Number(fusion.maximo_respaldos_por_sede);
  fusion.maximo_respaldos_por_sede = Number.isInteger(limite) && limite > 0
    ? limite
    : MAXIMO_RESPALDOS_POR_DEFECTO;

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
  tamanoTotalEnDisco,
  purgarRespaldosAntiguos,
  MAXIMO_RESPALDOS_POR_DEFECTO,
  ValidationError
};
