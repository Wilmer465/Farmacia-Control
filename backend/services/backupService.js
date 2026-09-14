const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { getDb, resolveDbPath, closeDb } = require('../database/connection');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { AUDIT_ACTIONS, ROLES } = require('../../shared/constants');

class ValidationError extends Error {}

function verificarAccesoRespaldos(usuarioSesion) {
  if (!usuarioSesion || ![ROLES.SUPERADMIN, ROLES.ADMIN].includes(usuarioSesion.rol_nombre)) {
    throw new permisoService.PermisoError('Solo el Superadmin y el Administrador de sede pueden gestionar respaldos.');
  }
}

function carpetaRespaldos() {
  const dbPath = resolveDbPath();
  const dir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rutaConfigAutoBackup() {
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

function listar(usuarioSesion, filtros = {}) {
  verificarAccesoRespaldos(usuarioSesion);

  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, filtros?.sedeId);

  const dir = carpetaRespaldos();
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.db'));

  const listado = archivos.map((nombre) => {
    const rutaCompleta = path.join(dir, nombre);
    const stats = fs.statSync(rutaCompleta);
    const match = nombre.match(/_sede_(\d+)/);
    const sedeIdArchivo = match ? Number(match[1]) : null;

    return {
      nombre,
      fecha: stats.mtime.toISOString(),
      tamanoBytes: stats.size,
      esAutomatico: nombre.includes('_auto_'),
      sedeId: sedeIdArchivo
    };
  });

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

function crear(usuarioSesion, opciones = {}) {
  const esAutomatico = typeof opciones === 'boolean' ? opciones : Boolean(opciones?.esAutomatico);
  const sedeIdSolicitada = typeof opciones === 'object' ? opciones?.sedeId : null;

  if (!esAutomatico) {
    verificarAccesoRespaldos(usuarioSesion);
  }

  const db = getDb();
  try {
    db.pragma('wal_checkpoint(FULL)');
    db.pragma('incremental_vacuum(100)');
  } catch (errPragma) {
    console.warn('[backupService] Warning ejecutando pragma de mantenimiento:', errPragma.message);
  }

  const sedeEfectiva = esAutomatico
    ? null
    : permisoService.resolverSedeEfectiva(usuarioSesion, sedeIdSolicitada);

  const dbPath = resolveDbPath();
  const dir = carpetaRespaldos();
  const prefijo = esAutomatico ? 'farmacia_backup_auto' : 'farmacia_backup';
  const tagSede = sedeEfectiva ? `_sede_${sedeEfectiva}` : '_global';
  const nombre = `${prefijo}${tagSede}_${timestampArchivo()}.db`;
  const destino = path.join(dir, nombre);

  fs.copyFileSync(dbPath, destino);

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

  return {
    nombre,
    fecha: stats.mtime.toISOString(),
    tamanoBytes: stats.size,
    integridad: integridad.ok,
    esAutomatico,
    sedeId: sedeEfectiva
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

function ultimoRespaldo(usuarioSesion, filtros = {}) {
  const listado = listar(usuarioSesion, filtros);
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

function verificarYEjecutarAutoBackup() {
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

  if (debeEjecutar) {
    try {
      console.log('[backupService] 🚀 Ejecutando respaldo automático programado...');
      const res = crear(null, true);
      config.ultimo_backup_auto = ahora.toISOString();
      const ruta = rutaConfigAutoBackup();
      fs.writeFileSync(ruta, JSON.stringify(config, null, 2), 'utf8');
      console.log(`[backupService] ✅ Respaldo automático completado: ${res.nombre}`);
    } catch (err) {
      console.error('[backupService] ❌ Error en respaldo automático:', err);
    }
  }
}

function iniciarPlanificadorAutoBackup() {
  if (planificadorInterval) clearInterval(planificadorInterval);
  // Revisión periódica cada 60 segundos
  planificadorInterval = setInterval(verificarYEjecutarAutoBackup, 60 * 1000);
  // Ejecutar primera verificación a los 5 segundos de iniciar
  setTimeout(verificarYEjecutarAutoBackup, 5000);
  console.log('[backupService] ⏰ Planificador de respaldos automáticos iniciado.');
}

module.exports = {
  listar,
  crear,
  restaurar,
  validarIntegridad,
  ultimoRespaldo,
  obtenerConfigAutoBackup,
  guardarConfigAutoBackup,
  iniciarPlanificadorAutoBackup,
  ValidationError
};
