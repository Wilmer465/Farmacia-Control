const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { runMigrations, cargarMigraciones, obtenerEstadoMigraciones } = require('./migrate');
const { seed } = require('./seeds/seed');
const { getDb, closeDb, beginDatabaseMaintenance, endDatabaseMaintenance } = require('./connection');

const RESERVA_OPERATIVA_BYTES = 64 * 1024 * 1024;
const JOURNAL_SUFFIX = '.recovery-journal.jsonl';

function rutaJournal(databasePath) {
  return `${databasePath}${JOURNAL_SUFFIX}`;
}

function appendJournal(journalPath, entry) {
  const line = `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`;
  const fd = fs.openSync(journalPath, 'a');
  try {
    fs.writeFileSync(fd, line, { encoding: 'utf8' });
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function leerJournal(journalPath) {
  if (!fs.existsSync(journalPath)) return [];
  const contenido = fs.readFileSync(journalPath, 'utf8');
  if (!contenido.endsWith('\n')) throw new Error('El journal de recuperación está incompleto; se requiere revisión manual.');
  return contenido.trimEnd().split('\n').map((linea) => {
    try {
      const entry = JSON.parse(linea);
      if (!entry || typeof entry.operationId !== 'string' || typeof entry.state !== 'string') throw new Error();
      return entry;
    } catch {
      throw new Error('El journal de recuperación está corrupto; se requiere revisión manual.');
    }
  });
}

function lastOperation(entries) {
  if (!entries.length) return null;
  const id = entries[entries.length - 1].operationId;
  const operationEntries = entries.filter((entry) => entry.operationId === id);
  return { id, entries: operationEntries, last: operationEntries[operationEntries.length - 1] };
}

function acquireStartupLock(lockPath) {
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    fs.fsyncSync(fd);
    return fd;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    let lock;
    try { lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch {
      throw new Error('El bloqueo de arranque está incompleto; se requiere revisión manual.');
    }
    if (!Number.isInteger(lock.pid) || lock.pid < 1) throw new Error('El bloqueo de arranque es inválido.');
    try {
      process.kill(lock.pid, 0);
      throw new Error('Ya hay otra instancia preparando la base de datos.');
    } catch (probeError) {
      if (probeError.message === 'Ya hay otra instancia preparando la base de datos.') throw probeError;
      if (probeError.code !== 'ESRCH') throw new Error('No se pudo verificar si el proceso de recuperación sigue activo.');
    }
    fs.unlinkSync(lockPath);
    return acquireStartupLock(lockPath);
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

function fileSize(filePath) {
  try { return fs.statSync(filePath).size; } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

function syncFile(filePath) {
  const fd = fs.openSync(filePath, 'r+');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function getFreeBytes(directory) {
  if (typeof fs.statfsSync !== 'function') return null;
  try {
    const stats = fs.statfsSync(directory);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

function configureDatabase(db) {
  db.pragma('busy_timeout = 10000');
  db.pragma('foreign_keys = ON');
}

function configureStageDatabase(db) {
  configureDatabase(db);
  const mode = db.pragma('journal_mode = WAL', { simple: true });
  if (String(mode).toLowerCase() !== 'wal') throw new Error('No se pudo habilitar WAL en staging.');
  db.pragma('synchronous = NORMAL');
}

function fingerprintSchema(db) {
  const schema = db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type, name, tbl_name
  `).all();
  return crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex');
}

function validateDatabase(filePath, { requireComplete = false, fullIntegrity = requireComplete } = {}) {
  let db;
  try {
    db = new Database(filePath, { readonly: true, fileMustExist: true, timeout: 10000 });
    configureDatabase(db);
    const checkName = fullIntegrity ? 'integrity_check' : 'quick_check';
    const integrity = db.pragma(checkName);
    if (!Array.isArray(integrity) || integrity.length !== 1 || integrity[0][checkName] !== 'ok') {
      throw new Error(`SQLite ${checkName} no devolvió ok.`);
    }
    const foreignKeys = db.pragma('foreign_key_check');
    if (foreignKeys.length) throw new Error(`SQLite reportó ${foreignKeys.length} violación(es) de clave foránea.`);
    const migrations = obtenerEstadoMigraciones(db);
    if (requireComplete && migrations.pending.length) {
      throw new Error('La base validada todavía tiene migraciones pendientes.');
    }
    const userVersion = Number(db.pragma('user_version', { simple: true }));
    return { ok: true, migrations, userVersion, schemaSha256: fingerprintSchema(db) };
  } finally {
    if (db && db.open) db.close();
  }
}

function validateManifest(manifest, expectedOperationId) {
  if (!manifest || manifest.format !== 1 || manifest.operationId !== expectedOperationId) {
    throw new Error('El manifiesto de recuperación no corresponde a la operación activa.');
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.backupSha256)) throw new Error('El manifiesto contiene una huella de respaldo inválida.');
  if (manifest.stageSha256 != null && !/^[a-f0-9]{64}$/.test(manifest.stageSha256)) throw new Error('El manifiesto contiene una huella de staging inválida.');
}

async function recoverInterruptedOperation({ databasePath, journalPath, cursorPath }) {
  const operation = lastOperation(leerJournal(journalPath));
  if (!operation) return;
  const { last } = operation;
  if (last.state === 'COMMITTED' || last.state === 'ABORTED') return;

  const activeHash = fs.existsSync(databasePath) ? await sha256File(databasePath) : null;
  // A FAILED entry without either hash was recorded before staging or promotion
  // began. The active file may have been checkpointed, so its hash can differ
  // from its earlier on-disk form; only reconcile it after a full SQLite and
  // migration-compatibility validation. Never discard the recovery artifacts.
  if (last.state === 'FAILED' && !last.originalSha256 && !last.stageSha256 && activeHash) {
    const validation = validateDatabase(databasePath, { requireComplete: false, fullIntegrity: true });
    if (!validation.ok) {
      throw new Error('La operación anterior falló antes de promover una base y la base activa requiere recuperación manual.');
    }
    appendJournal(journalPath, {
      operationId: operation.id,
      state: 'ABORTED',
      originalSha256: activeHash,
      recoveredFromUnpromotedFailure: true
    });
    return;
  }

  let manifest = null;
  if (last.manifestPath && fs.existsSync(last.manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(last.manifestPath, 'utf8')); } catch {
      if (last.state === 'PROMOTING') throw new Error('El manifiesto de recuperación está corrupto; no se iniciará la aplicación.');
    }
  }
  if (['PROMOTING', 'CURSOR_RESET'].includes(last.state) && activeHash && activeHash === last.stageSha256) {
    const manualRestore = manifest?.operationType === 'MANUAL_RESTORE';
    const result = validateDatabase(databasePath, { requireComplete: !manualRestore, fullIntegrity: true });
    if (!result.ok) throw new Error('La base promovida no pasó la recuperación automática.');
    if (manifest) {
      validateManifest(manifest, operation.id);
      if (activeHash !== manifest.stageSha256 || !fs.existsSync(last.backupPath) || (await sha256File(last.backupPath)) !== manifest.backupSha256) {
        throw new Error('Los hashes del manifiesto no coinciden con la base promovida o su respaldo.');
      }
      if (manifest.cursorSnapshotSha256 && (!cursorPath || !fs.existsSync(cursorPath) || (await sha256File(cursorPath)) !== manifest.cursorSnapshotSha256)) {
        if (!(manualRestore && !fs.existsSync(cursorPath))) {
          throw new Error('El cursor cambió durante una promoción interrumpida; se requiere recuperación manual.');
        }
      }
      if (manifest.cursorAction === 'RESET') {
        await aplicarResetCursor(manifest, last.cursorSnapshotPath, cursorPath);
      }
    }
    if (last.originalSha256 && (!fs.existsSync(last.promotionBackupPath) || (await sha256File(last.promotionBackupPath)) !== last.originalSha256)) {
      throw new Error('La copia generada durante la promoción no coincide con el hash original.');
    }
    appendJournal(journalPath, { operationId: operation.id, state: 'COMMITTED', stageSha256: activeHash });
    return;
  }
  if (manifest && activeHash === manifest.backupSha256) {
    validateManifest(manifest, operation.id);
    if (!(await validateDatabase(databasePath, { requireComplete: false, fullIntegrity: true })).ok) {
      throw new Error('La base restaurada desde respaldo no pasó validación.');
    }
    if (manifest.operationType === 'MANUAL_RESTORE') {
      await restaurarCursorAnterior(manifest, last.cursorSnapshotPath, cursorPath);
    }
    appendJournal(journalPath, { operationId: operation.id, state: 'ABORTED', originalSha256: activeHash, rollbackSha256: activeHash });
    return;
  }
  if (last.state === 'ROLLED_BACK' && activeHash === last.rollbackSha256) {
    if (manifest?.operationType === 'MANUAL_RESTORE') {
      await restaurarCursorAnterior(manifest, last.cursorSnapshotPath, cursorPath);
    }
    appendJournal(journalPath, { operationId: operation.id, state: 'ABORTED', originalSha256: activeHash });
    return;
  }
  if (activeHash === (last.originalSha256 ?? null)) {
    appendJournal(journalPath, { operationId: operation.id, state: 'ABORTED', originalSha256: activeHash });
    return;
  }
  throw new Error('El journal y la base activa describen un estado ambiguo; no se iniciará la aplicación.');
}

async function verificarSnapshotCursor(manifest, snapshotPath) {
  if (!manifest.cursorExisted) return;
  if (!snapshotPath || !fs.existsSync(snapshotPath) || (await sha256File(snapshotPath)) !== manifest.cursorSnapshotSha256) {
    throw new Error('La copia del cursor no está disponible o no coincide con el journal.');
  }
}

async function aplicarResetCursor(manifest, snapshotPath, cursorPath) {
  if (!cursorPath) throw new Error('No se puede reconciliar el cursor de sincronización.');
  await verificarSnapshotCursor(manifest, snapshotPath);
  if (manifest.cursorExisted) {
    if (fs.existsSync(cursorPath) && (await sha256File(cursorPath)) !== manifest.cursorSnapshotSha256) {
      throw new Error('El cursor cambió durante una restauración interrumpida; se requiere recuperación manual.');
    }
    if (fs.existsSync(cursorPath)) fs.unlinkSync(cursorPath);
  } else if (fs.existsSync(cursorPath)) {
    throw new Error('Apareció un cursor inesperado durante la restauración; se requiere recuperación manual.');
  }
}

async function restaurarCursorAnterior(manifest, snapshotPath, cursorPath) {
  if (!cursorPath) throw new Error('No se puede restaurar el estado original del cursor.');
  if (!manifest.cursorExisted) {
    if (fs.existsSync(cursorPath)) throw new Error('Apareció un cursor inesperado durante el rollback.');
    return;
  }
  await verificarSnapshotCursor(manifest, snapshotPath);
  if (fs.existsSync(cursorPath)) {
    if ((await sha256File(cursorPath)) !== manifest.cursorSnapshotSha256) {
      throw new Error('El cursor actual no coincide con el cursor previo a la restauración.');
    }
    return;
  }
  fs.copyFileSync(snapshotPath, cursorPath, fs.constants.COPYFILE_EXCL);
  syncFile(cursorPath);
  if ((await sha256File(cursorPath)) !== manifest.cursorSnapshotSha256) {
    throw new Error('El cursor restaurado no coincide con la copia previa verificada.');
  }
}

async function restoreDatabase({ databasePath, cursorPath, sourceBackupPath, activeDb = null, closeActiveDb = closeDb, promote = promoteWithReplaceFile } = {}) {
  if (!databasePath || !path.isAbsolute(databasePath) || !sourceBackupPath || !path.isAbsolute(sourceBackupPath)) {
    throw new Error('Se requieren rutas absolutas para restaurar SQLite.');
  }
  if (process.platform !== 'win32') throw new Error('La restauración segura solo está habilitada en Windows.');
  if (!fs.existsSync(databasePath) || !fs.existsSync(sourceBackupPath)) throw new Error('No existe la base activa o el respaldo seleccionado.');

  const targetValidation = validateDatabase(sourceBackupPath, { requireComplete: false, fullIntegrity: true });
  if (!targetValidation.ok) throw new Error('El respaldo no pasó las validaciones SQLite.');
  const sourceDb = activeDb || getDb();

  const directory = path.dirname(databasePath);
  const journalPath = rutaJournal(databasePath);
  const lockPath = `${databasePath}.startup-lock`;
  const lockFd = acquireStartupLock(lockPath);
  const operationId = crypto.randomUUID();
  const rollbackPath = path.join(directory, `.startup-recovery-${operationId}.backup.db`);
  const stagePath = path.join(directory, `.startup-recovery-${operationId}.stage.db`);
  const promotionBackupPath = path.join(directory, `.startup-recovery-${operationId}.promoted-old.db`);
  const rollbackStagePath = path.join(directory, `.startup-recovery-${operationId}.rollback-stage.db`);
  const failedVersionPath = path.join(directory, `.startup-recovery-${operationId}.failed-new.db`);
  const manifestPath = path.join(directory, `.startup-recovery-${operationId}.manifest.json`);
  let cursorExisted = false;
  const cursorSnapshotPath = cursorPath ? `${cursorPath}.startup-recovery-${operationId}.snapshot` : null;
  let originalSha256 = null;
  let stageSha256 = null;
  let cursorSnapshotSha256 = null;
  let journalState = 'ABORTED';
  let transactionOpen = false;
  let activeConnectionClosed = false;
  let maintenanceStarted = false;
  const record = (state, values = {}) => {
    journalState = state;
    appendJournal(journalPath, {
      operationId, operationType: 'MANUAL_RESTORE', state, originalSha256, stageSha256,
      backupPath: rollbackPath, promotionBackupPath, stagePath, manifestPath,
      cursorPath, cursorSnapshotPath, cursorSnapshotSha256, cursorAction: 'RESET', cursorExisted,
      ...values
    });
  };

  try {
    await recoverInterruptedOperation({ databasePath, journalPath, cursorPath });
    beginDatabaseMaintenance();
    maintenanceStarted = true;
    assertCheckpoint(sourceDb, 'TRUNCATE');
    if (fileSize(`${databasePath}-wal`) !== 0) throw new Error('El WAL conserva contenido; la restauración se cancela sin sustituir archivos.');
    sourceDb.exec('BEGIN IMMEDIATE');
    transactionOpen = true;
    originalSha256 = await sha256File(databasePath);
    cursorExisted = Boolean(cursorPath && fs.existsSync(cursorPath));
    record('BEGIN', { originalSha256 });
    if (cursorExisted) {
      fs.copyFileSync(cursorPath, cursorSnapshotPath, fs.constants.COPYFILE_EXCL);
      syncFile(cursorSnapshotPath);
      cursorSnapshotSha256 = await sha256File(cursorSnapshotPath);
    }
    fs.copyFileSync(databasePath, rollbackPath, fs.constants.COPYFILE_EXCL);
    syncFile(rollbackPath);
    if (await sha256File(rollbackPath) !== originalSha256) throw new Error('La copia previa no coincide con la base activa.');
    if (!validateDatabase(rollbackPath, { requireComplete: false, fullIntegrity: true }).ok) {
      throw new Error('La copia previa no pasó la validación completa de SQLite.');
    }
    const targetHash = await sha256File(sourceBackupPath);
    fs.copyFileSync(sourceBackupPath, stagePath, fs.constants.COPYFILE_EXCL);
    syncFile(stagePath);
    stageSha256 = await sha256File(stagePath);
    if (stageSha256 !== targetHash || !validateDatabase(stagePath, { requireComplete: false, fullIntegrity: true }).ok) {
      throw new Error('El staging de restauración no coincide con el respaldo validado.');
    }
    const manifest = {
      format: 1, operationId, operationType: 'MANUAL_RESTORE', backupSha256: originalSha256,
      stageSha256, cursorAction: 'RESET', cursorExisted, cursorSnapshotSha256
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { flag: 'wx' });
    syncFile(manifestPath);
    record('STAGE_VALIDATED');

    sourceDb.exec('ROLLBACK');
    transactionOpen = false;
    assertCheckpoint(sourceDb, 'TRUNCATE');
    closeActiveDb();
    activeConnectionClosed = true;
    const activeWal = `${databasePath}-wal`;
    if (fileSize(activeWal) !== 0) throw new Error('El WAL reapareció después del cierre; la restauración se cancela.');
    for (const suffix of ['-wal', '-shm']) {
      const companion = `${databasePath}${suffix}`;
      if (fs.existsSync(companion)) fs.unlinkSync(companion);
    }
    record('PROMOTING', { originalSha256, stageSha256 });
    promote(databasePath, stagePath, promotionBackupPath);
    if (!fs.existsSync(promotionBackupPath) || (await sha256File(promotionBackupPath)) !== originalSha256) {
      throw new Error('La promoción no conservó una copia exacta de la base anterior.');
    }
    if ((await sha256File(databasePath)) !== stageSha256 || !validateDatabase(databasePath, { requireComplete: false, fullIntegrity: true }).ok) {
      throw new Error('La base restaurada no coincide con el staging validado.');
    }
    if (cursorExisted) {
      if (!fs.existsSync(cursorPath) || (await sha256File(cursorPath)) !== cursorSnapshotSha256) {
        throw new Error('El cursor cambió durante la restauración; no se eliminará.');
      }
      fs.unlinkSync(cursorPath);
    } else if (cursorPath && fs.existsSync(cursorPath)) {
      throw new Error('Apareció un cursor durante la restauración; se requiere recuperación manual.');
    }
    record('CURSOR_RESET');
    record('COMMITTED');
    return { restored: true, databasePath, originalSha256, stageSha256 };
  } catch (err) {
    if (transactionOpen && sourceDb.open) {
      try { sourceDb.exec('ROLLBACK'); } catch (rollbackError) {
        console.error('[startupRecovery] No se pudo revertir la transacción previa a restauración:', rollbackError.message);
      }
    }
    if (!activeConnectionClosed && sourceDb.open) {
      try { closeActiveDb(); activeConnectionClosed = true; } catch (closeError) {
        console.error('[startupRecovery] No se pudo cerrar SQLite durante restauración:', closeError.message);
      }
    }
    try {
      if (journalState === 'PROMOTING' && originalSha256 && stageSha256 &&
          fs.existsSync(databasePath) && (await sha256File(databasePath)) === stageSha256) {
        let rollbackSource = null;
        for (const candidate of [promotionBackupPath, rollbackPath]) {
          if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
          if ((await sha256File(candidate)) !== originalSha256) continue;
          if (!validateDatabase(candidate, { requireComplete: false, fullIntegrity: true }).ok) continue;
          rollbackSource = candidate;
          break;
        }
        if (!rollbackSource) {
          throw new Error('No existe una copia íntegra que coincida con la base original.');
        }
        fs.copyFileSync(rollbackSource, rollbackStagePath, fs.constants.COPYFILE_EXCL);
        syncFile(rollbackStagePath);
        if ((await sha256File(rollbackStagePath)) !== originalSha256) throw new Error('El staging de rollback no coincide con la base original.');
        promote(databasePath, rollbackStagePath, failedVersionPath);
        if ((await sha256File(databasePath)) !== originalSha256) throw new Error('El rollback no restauró el hash original.');
        if (cursorExisted) {
          if (!fs.existsSync(cursorSnapshotPath) || (await sha256File(cursorSnapshotPath)) !== cursorSnapshotSha256) {
            throw new Error('No se puede restaurar el cursor original verificado.');
          }
          fs.copyFileSync(cursorSnapshotPath, cursorPath);
          syncFile(cursorPath);
          if ((await sha256File(cursorPath)) !== cursorSnapshotSha256) throw new Error('El cursor restaurado no coincide con la copia verificada.');
        } else if (cursorPath && fs.existsSync(cursorPath)) {
          throw new Error('Apareció un cursor inesperado durante el rollback; no se eliminará automáticamente.');
        }
        record('ROLLED_BACK', { rollbackSha256: originalSha256 });
      } else if (journalState !== 'ABORTED') {
        record('FAILED', { errorCode: String(err.code || 'RESTORE_FAILED').slice(0, 64) });
      }
    } catch (recoveryError) {
      console.error('[startupRecovery] Restauración requiere intervención:', recoveryError.message);
      try { record('RECOVERY_REQUIRED', { errorCode: 'ROLLBACK_UNVERIFIED' }); } catch (journalError) {
        console.error('[startupRecovery] No se pudo registrar el estado de recuperación:', journalError.message);
      }
    }
    throw err;
  } finally {
    if (maintenanceStarted) endDatabaseMaintenance();
    fs.closeSync(lockFd);
    try { fs.unlinkSync(lockPath); } catch (lockError) {
      if (lockError.code !== 'ENOENT') console.error('[startupRecovery] No se pudo quitar el bloqueo de restauración:', lockError.message);
    }
  }
}

function logicalDatabaseBytes(db, fallbackSize) {
  const pages = Number(db.pragma('page_count', { simple: true }));
  const pageSize = Number(db.pragma('page_size', { simple: true }));
  const logical = pages * pageSize;
  return Number.isFinite(logical) && logical > 0 ? logical : fallbackSize;
}

function requiredSpace({ sourceBytes, logicalBytes, hasSource, pendingMigrations }) {
  const backupCopy = hasSource ? sourceBytes : 0;
  const stageCopy = hasSource ? sourceBytes : 0;
  const rollbackCopy = hasSource ? sourceBytes : 0;
  return backupCopy + stageCopy + rollbackCopy + requiredMigrationSpace(logicalBytes, pendingMigrations);
}

function requiredMigrationSpace(logicalBytes, pendingMigrations, rollbackBytes = 0) {
  // Reserva dinámica por crecimiento potencial; VACUUM añade un scratch del
  // tamaño lógico observado. Se vuelve a estimar antes de cada migración.
  const migrationGrowth = pendingMigrations.length ? logicalBytes : 0;
  const vacuumScratch = pendingMigrations.some((name) => ['026_optimizar_catalogo_cum', '038_recompactar_catalogo_local'].includes(name))
    ? logicalBytes : 0;
  return rollbackBytes + migrationGrowth + vacuumScratch + RESERVA_OPERATIVA_BYTES;
}

function assertCheckpoint(db, mode) {
  const result = db.pragma(`wal_checkpoint(${mode})`);
  if (!Array.isArray(result) || !result.length || Number(result[0].busy) !== 0) {
    throw new Error(`No se pudo completar wal_checkpoint(${mode}).`);
  }
}

function promoteWithReplaceFile(activePath, replacementPath, backupPath) {
  if (process.platform !== 'win32') {
    throw new Error('La promoción de base de datos solo está habilitada en Windows.');
  }
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class FarmaciaReplaceFile {',
    '  [DllImport("kernel32.dll", EntryPoint="ReplaceFileW", CharSet=CharSet.Unicode, SetLastError=true)]',
    '  [return: MarshalAs(UnmanagedType.Bool)]',
    '  public static extern bool Replace(string replaced, string replacement, string backup, uint flags, IntPtr exclude, IntPtr reserved);',
    '}',
    '"@',
    '$paths = ConvertFrom-Json $env:FARMACIA_REPLACE_ARGUMENTS',
    '$ok = [FarmaciaReplaceFile]::Replace($paths[0], $paths[1], $paths[2], 0, [IntPtr]::Zero, [IntPtr]::Zero)',
    'if (-not $ok) { $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error(); exit (100 + $code) }',
    'exit 0'
  ].join('\n');
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, FARMACIA_REPLACE_ARGUMENTS: JSON.stringify([activePath, replacementPath, backupPath]) }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ReplaceFileW falló (código ${result.status ?? 'desconocido'}).`);
}

async function prepareDatabase({ databasePath, cursorPath, freeBytesProvider = getFreeBytes, platform = process.platform, promote = promoteWithReplaceFile } = {}) {
  if (!databasePath || !path.isAbsolute(databasePath)) throw new Error('Se requiere una ruta absoluta para SQLite.');
  if (platform !== 'win32') throw new Error('La recuperación segura de arranque aún está soportada solo en Windows.');
  const directory = path.dirname(databasePath);
  fs.mkdirSync(directory, { recursive: true });
  const journalPath = rutaJournal(databasePath);
  const lockPath = `${databasePath}.startup-lock`;
  let lockFd = acquireStartupLock(lockPath);
  try {
    await recoverInterruptedOperation({ databasePath, journalPath, cursorPath });
  } catch (err) {
    fs.closeSync(lockFd);
    lockFd = null;
    try { fs.unlinkSync(lockPath); } catch {}
    throw err;
  }

  const operationId = crypto.randomUUID();
  const backupPath = path.join(directory, `.startup-recovery-${operationId}.backup.db`);
  const stagePath = path.join(directory, `.startup-recovery-${operationId}.stage.db`);
  const promotionBackupPath = path.join(directory, `.startup-recovery-${operationId}.promoted-old.db`);
  const manifestPath = path.join(directory, `.startup-recovery-${operationId}.manifest.json`);
  const cursorSnapshotPath = cursorPath ? `${cursorPath}.startup-recovery-${operationId}.snapshot` : null;
  let sourceDb;
  let backupSourceDb;
  let stageDb;
  let sourceLockHeld = false;
  let originalSha256 = null;
  let stageSha256 = null;
  let cursorSnapshotSha256 = null;
  let journalState = 'BEGIN';

  const record = (state, values = {}) => {
    journalState = state;
    appendJournal(journalPath, { operationId, state, originalSha256, stageSha256, backupPath, promotionBackupPath, stagePath, manifestPath, cursorSnapshotPath, ...values });
  };

  try {
    const hasSource = fs.existsSync(databasePath);
    for (const suffix of ['-wal', '-shm']) {
      if (!hasSource && fs.existsSync(`${databasePath}${suffix}`)) {
        throw new Error('Hay archivos WAL/SHM huérfanos sin base activa; se requiere recuperación manual.');
      }
    }
    let pendingMigrations;
    if (hasSource) {
      sourceDb = new Database(databasePath, { timeout: 10000 });
      configureDatabase(sourceDb);
      assertCheckpoint(sourceDb, 'TRUNCATE');
      if (fileSize(`${databasePath}-wal`) > 0) throw new Error('La base activa conserva WAL con contenido después del checkpoint.');
      let sourceValidation = validateDatabase(databasePath, { requireComplete: false });
      let migrationStatus = obtenerEstadoMigraciones(sourceDb, cargarMigraciones());
      pendingMigrations = migrationStatus.pending;

      if (pendingMigrations.length) {
        sourceDb.exec('BEGIN IMMEDIATE');
        sourceLockHeld = true;
        originalSha256 = await sha256File(databasePath);
        sourceValidation = validateDatabase(databasePath, { requireComplete: false });
        migrationStatus = obtenerEstadoMigraciones(sourceDb, cargarMigraciones());
        pendingMigrations = migrationStatus.pending;
        record('SOURCE_VALIDATED', { sourceValidation, originalSha256 });
        if (!pendingMigrations.length) {
          sourceDb.exec('ROLLBACK');
          sourceLockHeld = false;
          sourceDb.close();
          sourceDb = null;
          return { migrated: false, databasePath };
        }
        record('BEGIN', { hasSource, originalSha256 });
        if (cursorPath && fs.existsSync(cursorPath)) {
          fs.copyFileSync(cursorPath, cursorSnapshotPath, fs.constants.COPYFILE_EXCL);
          const cursorFd = fs.openSync(cursorSnapshotPath, 'r+');
          try { fs.fsyncSync(cursorFd); } finally { fs.closeSync(cursorFd); }
          cursorSnapshotSha256 = await sha256File(cursorSnapshotPath);
        }
        const free = freeBytesProvider(directory);
        if (free === null) throw new Error('No se pudo medir el espacio libre del volumen.');
        const sourceBytes = fileSize(databasePath) + fileSize(`${databasePath}-wal`) + fileSize(`${databasePath}-shm`);
        const needed = requiredSpace({ sourceBytes, logicalBytes: logicalDatabaseBytes(sourceDb, sourceBytes), hasSource, pendingMigrations });
        if (free < needed) throw new Error(`Espacio insuficiente para recuperación segura (requerido: ${needed}; disponible: ${free}).`);
        backupSourceDb = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 10000 });
        await backupSourceDb.backup(backupPath);
        backupSourceDb.close();
        backupSourceDb = null;
        syncFile(backupPath);
        const backupValidation = validateDatabase(backupPath, { requireComplete: false, fullIntegrity: true });
        const backupSha256 = await sha256File(backupPath);
        const backupBytes = fileSize(backupPath);
        const manifest = {
          format: 1, operationId, backupSha256, backupBytes,
          sourceSchema: sourceValidation.migrations.applied,
          sourceSchemaSha256: sourceValidation.schemaSha256,
          sourceUserVersion: sourceValidation.userVersion,
          cursorSnapshotSha256,
          checks: { integrity: true, foreignKeys: true }
        };
        validateManifest({ ...manifest, stageSha256: null }, operationId);
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { flag: 'wx' });
        const manifestFd = fs.openSync(manifestPath, 'r+');
        try { fs.fsyncSync(manifestFd); } finally { fs.closeSync(manifestFd); }
        if (!backupValidation.ok) throw new Error('El respaldo previo no pasó la validación SQLite.');
        record('BACKUP_VERIFIED', { backupSha256, backupBytes });
        const freeAfterBackup = freeBytesProvider(directory);
        const rollbackBytes = fileSize(databasePath);
        const stageAndMigrationNeed = backupBytes + requiredMigrationSpace(logicalDatabaseBytes(sourceDb, backupBytes), pendingMigrations, rollbackBytes);
        if (freeAfterBackup === null || freeAfterBackup < stageAndMigrationNeed) {
          throw new Error(`Espacio insuficiente después del respaldo (requerido adicional: ${stageAndMigrationNeed}; disponible: ${freeAfterBackup ?? 'desconocido'}).`);
        }
        fs.copyFileSync(backupPath, stagePath, fs.constants.COPYFILE_EXCL);
        syncFile(stagePath);
        if (await sha256File(stagePath) !== backupSha256) throw new Error('La copia de staging no coincide con el respaldo verificado.');
      } else {
        sourceDb.close();
        sourceDb = null;
        return { migrated: false, databasePath };
      }
    } else {
      record('BEGIN', { hasSource: false, originalSha256: null });
      pendingMigrations = cargarMigraciones().map(({ migration }) => migration.name);
      const free = freeBytesProvider(directory);
      if (free === null || free < RESERVA_OPERATIVA_BYTES) throw new Error('No se pudo demostrar espacio suficiente para inicializar SQLite.');
      stageDb = new Database(stagePath);
      configureStageDatabase(stageDb);
      stageDb.close();
      stageDb = null;
    }

    record('STAGE_CREATED');
    stageDb = new Database(stagePath, { timeout: 10000 });
    configureStageDatabase(stageDb);
    const beforeMigration = validateDatabase(stagePath, { requireComplete: false, fullIntegrity: true });
    if (!beforeMigration.ok) throw new Error('El staging no pasó las validaciones SQLite previas.');
    const initialRemaining = obtenerEstadoMigraciones(stageDb, cargarMigraciones()).pending;
    const freeAfterStage = freeBytesProvider(directory);
    const rollbackBytes = hasSource ? fileSize(databasePath) : 0;
    const migrationNeed = requiredMigrationSpace(logicalDatabaseBytes(stageDb, fileSize(stagePath)), initialRemaining, rollbackBytes);
    if (freeAfterStage === null || freeAfterStage < migrationNeed) {
      throw new Error(`Espacio insuficiente antes de migrar (requerido adicional: ${migrationNeed}; disponible: ${freeAfterStage ?? 'desconocido'}).`);
    }
    runMigrations(stageDb, {
      beforeEach: ({ db, remaining }) => {
        const free = freeBytesProvider(directory);
        const needed = requiredMigrationSpace(logicalDatabaseBytes(db, fileSize(stagePath)), remaining, rollbackBytes);
        if (free === null || free < needed) {
          throw new Error(`Espacio insuficiente antes de la migración ${remaining[0]} (requerido adicional: ${needed}; disponible: ${free ?? 'desconocido'}).`);
        }
      }
    });
    seed({ db: stageDb });
    assertCheckpoint(stageDb, 'TRUNCATE');
    const postMigration = validateDatabase(stagePath, { requireComplete: true });
    if (!postMigration.ok) throw new Error('El staging migrado no pasó la validación SQLite.');
    stageDb.close();
    stageDb = null;
    for (const suffix of ['-wal', '-shm']) {
      const companion = `${stagePath}${suffix}`;
      if (fs.existsSync(companion) && fileSize(companion) > 0) throw new Error(`El staging conserva ${suffix} no vacío.`);
      if (fs.existsSync(companion)) fs.unlinkSync(companion);
    }
    syncFile(stagePath);
    stageSha256 = await sha256File(stagePath);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const completeManifest = {
        ...manifest,
        stageSha256,
        stageBytes: fileSize(stagePath),
        targetSchema: postMigration.migrations.applied,
        targetSchemaSha256: postMigration.schemaSha256,
        targetUserVersion: postMigration.userVersion
      };
      fs.writeFileSync(manifestPath, `${JSON.stringify(completeManifest)}\n`, { flag: 'w' });
      syncFile(manifestPath);
    }
    record('STAGE_VALIDATED', { stageSha256, targetSchema: postMigration.migrations.applied });

    if (hasSource) {
      record('PROMOTING', { originalSha256, stageSha256 });
      if (sourceDb && sourceLockHeld) {
        sourceDb.exec('ROLLBACK');
        sourceLockHeld = false;
      }
      if (sourceDb) {
        sourceDb.close();
        sourceDb = null;
      }
      const activeWal = `${databasePath}-wal`;
      if (fs.existsSync(activeWal)) {
        if (fileSize(activeWal) > 0) throw new Error('El archivo activo WAL no está vacío al cerrar para promoción.');
        fs.unlinkSync(activeWal);
      }
      const activeShm = `${databasePath}-shm`;
      if (fs.existsSync(activeShm)) fs.unlinkSync(activeShm);
      if (await sha256File(databasePath) !== originalSha256) {
        record('ABORTED', { originalSha256, activeSha256: await sha256File(databasePath) });
        throw new Error('La base activa cambió mientras se preparaba el staging; se cancela la promoción.');
      }
      if (cursorPath && cursorSnapshotSha256 && (await sha256File(cursorPath)) !== cursorSnapshotSha256) {
        record('ABORTED', { originalSha256, cursorChanged: true });
        throw new Error('El cursor de sincronización cambió durante el staging; se cancela la promoción.');
      }
      if (fileSize(`${databasePath}-wal`) > 0) throw new Error('Hay escrituras activas en WAL; se cancela la promoción.');
      if (fs.existsSync(`${databasePath}-shm`)) throw new Error('Se detectó un archivo SHM activo; se cancela la promoción.');
      promote(databasePath, stagePath, promotionBackupPath);
      if (!fs.existsSync(promotionBackupPath) || (await sha256File(promotionBackupPath)) !== originalSha256) {
        throw new Error('ReplaceFileW no conservó una copia coincidente de la base anterior.');
      }
    } else {
      // En primera instalación no existe destino: crea el archivo solo después de
      // migrar/validar staging. No se copia una BD empaquetada.
      record('PROMOTING', { originalSha256: null, stageSha256 });
      fs.renameSync(stagePath, databasePath);
    }
    const promoted = validateDatabase(databasePath, { requireComplete: true });
    const promotedHash = await sha256File(databasePath);
    if (!promoted.ok || promotedHash !== stageSha256) throw new Error('La base promovida no coincide con el staging validado.');
    if (cursorPath && cursorSnapshotSha256 && (await sha256File(cursorPath)) !== cursorSnapshotSha256) {
      throw new Error('El cursor de sincronización cambió durante la promoción.');
    }
    appendJournal(journalPath, { operationId, state: 'COMMITTED', originalSha256, stageSha256, backupPath, manifestPath, cursorSnapshotPath });
    return { migrated: true, databasePath, backupPath, schema: promoted.migrations.applied, schemaSha256: promoted.schemaSha256 };
  } catch (err) {
    if (stageDb && stageDb.open) {
      try { stageDb.close(); } catch {}
    }
    if (backupSourceDb && backupSourceDb.open) {
      try { backupSourceDb.close(); } catch {}
    }
    if (sourceDb && sourceDb.open) {
      if (sourceLockHeld) {
        try { sourceDb.exec('ROLLBACK'); } catch {}
      }
      try { sourceDb.close(); } catch {}
    }
    try {
      if (journalState === 'PROMOTING' && originalSha256 && stageSha256 && fs.existsSync(databasePath) && await sha256File(databasePath) === stageSha256) {
        const restoreStagePath = path.join(directory, `.startup-recovery-${operationId}.rollback-stage.db`);
        const failedVersionPath = path.join(directory, `.startup-recovery-${operationId}.failed-new.db`);
        let rollbackSource = promotionBackupPath;
        if (!fs.existsSync(rollbackSource)) rollbackSource = backupPath;
        if (!fs.existsSync(rollbackSource)) throw new Error('No existe una copia previa disponible para rollback.');
        const rollbackValidation = validateDatabase(rollbackSource, { requireComplete: false, fullIntegrity: true });
        if (!rollbackValidation.ok) throw new Error('La copia disponible para rollback no pasó validación.');
        const rollbackHash = await sha256File(rollbackSource);
        if (rollbackHash !== originalSha256) {
          throw new Error('La copia disponible para rollback no coincide con la base original.');
        }
        if (rollbackSource === backupPath) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          validateManifest(manifest, operationId);
          if (rollbackHash !== manifest.backupSha256) throw new Error('El respaldo de rollback no coincide con el manifiesto.');
        }
        fs.copyFileSync(rollbackSource, restoreStagePath, fs.constants.COPYFILE_EXCL);
        syncFile(restoreStagePath);
        if (!validateDatabase(restoreStagePath, { requireComplete: false, fullIntegrity: true }).ok) throw new Error('El respaldo de rollback no pasó validación.');
        promote(databasePath, restoreStagePath, failedVersionPath);
        const restoredHash = await sha256File(databasePath);
        if (restoredHash !== originalSha256 || restoredHash !== rollbackHash) {
          throw new Error('La restauración automática no coincide con la base original validada.');
        }
        record('ROLLED_BACK', { rollbackSha256: rollbackHash });
      } else {
        if (journalState !== 'ABORTED') record('FAILED', { errorCode: String(err.code || 'RECOVERY_FAILED').slice(0, 64) });
      }
    } catch {
      try { record('RECOVERY_REQUIRED', { errorCode: 'ROLLBACK_UNVERIFIED' }); } catch {}
    }
    throw err;
  } finally {
    if (lockFd !== null) fs.closeSync(lockFd);
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

module.exports = {
  prepareDatabase,
  restoreDatabase,
  validateDatabase,
  fingerprintSchema,
  sha256File,
  syncFile,
  requiredSpace,
  requiredMigrationSpace,
  recoverInterruptedOperation,
  promoteWithReplaceFile,
  rutaJournal
};
