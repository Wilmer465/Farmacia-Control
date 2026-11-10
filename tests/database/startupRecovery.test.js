const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { runMigrations, cargarMigraciones } = require('../../backend/database/migrate');
const {
  prepareDatabase,
  restoreDatabase,
  recoverInterruptedOperation,
  rutaJournal,
  sha256File,
  requiredSpace,
  validateDatabase,
  promoteWithReplaceFile
} = require('../../backend/database/startupRecovery');

function crearTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-startup-recovery-'));
}

function eliminarTemporal(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('el registro conserva los nombres duplicados 019/020 como identidades distintas', () => {
  const migrations = cargarMigraciones();
  const duplicadas = migrations
    .filter(({ file }) => /^(019|020)_/.test(file))
    .map(({ migration }) => migration.name);

  assert.equal(duplicadas.length, 4);
  assert.equal(new Set(duplicadas).size, 4);
  assert.deepEqual(duplicadas, [...duplicadas].sort());
});

test('validación completa usa exclusivamente una base sintética migrada', (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'synthetic.db');
  const db = new Database(dbPath);
  try {
    runMigrations(db);
    db.prepare('CREATE TABLE pending_fixture (id TEXT PRIMARY KEY, payload TEXT NOT NULL)').run();
    db.prepare('INSERT INTO pending_fixture (id, payload) VALUES (?, ?)').run('op-1', 'fixture');
  } finally {
    db.close();
  }

  assert.equal(validateDatabase(dbPath, { requireComplete: true }).ok, true);
  const readOnly = new Database(dbPath, { readonly: true });
  try {
    assert.equal(readOnly.prepare('SELECT payload FROM pending_fixture WHERE id = ?').get('op-1').payload, 'fixture');
  } finally {
    readOnly.close();
  }
});

test('las migraciones FTS y de compactación no se repiten en el siguiente arranque', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const repetidas = [];
  runMigrations(db, { beforeEach: ({ migration }) => repetidas.push(migration.name) });
  assert.deepEqual(repetidas, []);
  assert.equal(db.prepare("SELECT COUNT(*) total FROM migrations WHERE nombre IN ('037_catalogo_busqueda_fts', '038_recompactar_catalogo_local')").get().total, 2);
  db.close();
});

test('validación bloquea violaciones de claves foráneas sin leer filas de negocio', (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'foreign-key-violation.db');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE parent (id INTEGER PRIMARY KEY);
    CREATE TABLE child (parent_id INTEGER REFERENCES parent(id));
    INSERT INTO child (parent_id) VALUES (42);
  `);
  db.close();

  assert.throws(() => validateDatabase(dbPath), /violación\(es\) de clave foránea/);
});

test('validación bloquea un nombre de migración que esta versión no reconoce', (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'future-schema.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      ejecutado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO migrations (nombre) VALUES ('999_future_migration');
  `);
  db.close();

  assert.throws(() => validateDatabase(dbPath), /no reconocidas/);
});

test('recovery aborta una operación previa a promoción solo si coincide la base original', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const cursorPath = path.join(dir, 'cloud_sync_state.json');
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('original');`);
  db.close();
  const originalSha256 = await sha256File(dbPath);
  const operationId = crypto.randomUUID();
  fs.writeFileSync(rutaJournal(dbPath), `${JSON.stringify({ operationId, state: 'STAGE_VALIDATED', originalSha256 })}\n`);

  await recoverInterruptedOperation({ databasePath: dbPath, journalPath: rutaJournal(dbPath), cursorPath });
  const journal = fs.readFileSync(rutaJournal(dbPath), 'utf8');
  assert.match(journal, /"state":"ABORTED"/);
  assert.equal(await sha256File(dbPath), originalSha256);
});

test('una interrupción antes de promoción conserva la base original y cierra el journal como abortado', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const db = new Database(dbPath);
  db.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('original');");
  db.close();
  const originalHash = await sha256File(dbPath);
  const operationId = crypto.randomUUID();
  fs.writeFileSync(rutaJournal(dbPath), `${JSON.stringify({ operationId, state: 'STAGE_VALIDATED', originalSha256: originalHash })}\n`);

  await recoverInterruptedOperation({ databasePath: dbPath, journalPath: rutaJournal(dbPath) });

  assert.equal(await sha256File(dbPath), originalHash);
  assert.match(fs.readFileSync(rutaJournal(dbPath), 'utf8'), /"state":"ABORTED"/);
});

test('recovery termina una restauración interrumpida después de promover y resetea el cursor una sola vez', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const cursorPath = path.join(dir, 'cloud_sync_state.json');
  const backupPath = path.join(dir, 'original-copy.db');
  const promotionBackupPath = path.join(dir, 'promotion-copy.db');
  const stagePath = path.join(dir, 'stage.db');
  const manifestPath = path.join(dir, 'manifest.json');
  const original = new Database(dbPath);
  original.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('old');");
  original.close();
  fs.copyFileSync(dbPath, backupPath);
  fs.copyFileSync(dbPath, promotionBackupPath);
  const originalHash = await sha256File(dbPath);
  const cursorBytes = Buffer.from('{"cursor":"old-cursor"}\n');
  fs.writeFileSync(cursorPath, cursorBytes);
  const target = new Database(stagePath);
  target.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('restored');");
  target.close();
  const stageHash = await sha256File(stagePath);
  fs.copyFileSync(stagePath, dbPath);
  const cursorSnapshotPath = path.join(dir, 'cursor.snapshot');
  fs.writeFileSync(cursorSnapshotPath, cursorBytes);
  const cursorSnapshotSha256 = await sha256File(cursorSnapshotPath);
  const operationId = crypto.randomUUID();
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    format: 1,
    operationId,
    operationType: 'MANUAL_RESTORE',
    backupSha256: originalHash,
    stageSha256: stageHash,
    cursorAction: 'RESET',
    cursorExisted: true,
    cursorSnapshotSha256
  })}\n`);
  fs.writeFileSync(rutaJournal(dbPath), `${JSON.stringify({
    operationId,
    operationType: 'MANUAL_RESTORE',
    state: 'PROMOTING',
    originalSha256: originalHash,
    stageSha256: stageHash,
    backupPath,
    promotionBackupPath,
    stagePath,
    manifestPath,
    cursorSnapshotPath,
    cursorSnapshotSha256
  })}\n`);

  await recoverInterruptedOperation({ databasePath: dbPath, journalPath: rutaJournal(dbPath), cursorPath });

  assert.equal(fs.existsSync(cursorPath), false);
  assert.equal(await sha256File(dbPath), stageHash);
  assert.match(fs.readFileSync(rutaJournal(dbPath), 'utf8'), /"state":"COMMITTED"/);
});

test('recovery termina una restauración interrumpida después del reset del cursor', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const cursorPath = path.join(dir, 'cloud_sync_state.json');
  const backupPath = path.join(dir, 'original-copy.db');
  const promotionBackupPath = path.join(dir, 'promotion-copy.db');
  const stagePath = path.join(dir, 'stage.db');
  const manifestPath = path.join(dir, 'manifest.json');
  const original = new Database(dbPath);
  original.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('old');");
  original.close();
  fs.copyFileSync(dbPath, backupPath);
  fs.copyFileSync(dbPath, promotionBackupPath);
  const originalHash = await sha256File(dbPath);
  const target = new Database(stagePath);
  target.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('restored');");
  target.close();
  const stageHash = await sha256File(stagePath);
  fs.copyFileSync(stagePath, dbPath);
  const operationId = crypto.randomUUID();
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    format: 1,
    operationId,
    operationType: 'MANUAL_RESTORE',
    backupSha256: originalHash,
    stageSha256: stageHash,
    cursorAction: 'RESET',
    cursorExisted: false,
    cursorSnapshotSha256: null
  })}\n`);
  fs.writeFileSync(rutaJournal(dbPath), `${JSON.stringify({
    operationId,
    operationType: 'MANUAL_RESTORE',
    state: 'CURSOR_RESET',
    originalSha256: originalHash,
    stageSha256: stageHash,
    backupPath,
    promotionBackupPath,
    stagePath,
    manifestPath,
    cursorAction: 'RESET',
    cursorExisted: false
  })}\n`);

  await recoverInterruptedOperation({ databasePath: dbPath, journalPath: rutaJournal(dbPath), cursorPath });

  assert.equal(await sha256File(dbPath), stageHash);
  assert.match(fs.readFileSync(rutaJournal(dbPath), 'utf8'), /"state":"COMMITTED"/);
});

test('recovery valida y completa una promoción interrumpida con hashes coherentes', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const backupPath = path.join(dir, 'verified-backup.db');
  const promotionBackupPath = path.join(dir, 'promoted-old.db');
  const stagePath = path.join(dir, 'stage.db');
  const manifestPath = path.join(dir, 'manifest.json');
  const original = new Database(dbPath);
  original.exec(`CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('original');`);
  original.close();
  fs.copyFileSync(dbPath, backupPath);
  fs.copyFileSync(dbPath, promotionBackupPath);
  const oldHash = await sha256File(dbPath);
  const stage = new Database(stagePath);
  runMigrations(stage);
  stage.close();
  fs.copyFileSync(stagePath, dbPath);
  const stageHash = await sha256File(dbPath);
  const operationId = crypto.randomUUID();
  fs.writeFileSync(manifestPath, JSON.stringify({
    format: 1,
    operationId,
    backupSha256: await sha256File(backupPath),
    stageSha256: stageHash,
    cursorSnapshotSha256: null
  }));
  const journalEntry = {
    operationId,
    state: 'PROMOTING',
    originalSha256: oldHash,
    stageSha256: stageHash,
    backupPath,
    promotionBackupPath,
    stagePath,
    manifestPath
  };
  fs.writeFileSync(rutaJournal(dbPath), `${JSON.stringify(journalEntry)}\n`);

  await recoverInterruptedOperation({ databasePath: dbPath, journalPath: rutaJournal(dbPath) });

  assert.match(fs.readFileSync(rutaJournal(dbPath), 'utf8'), /"state":"COMMITTED"/);
  assert.equal(validateDatabase(dbPath, { requireComplete: true }).ok, true);
});

test('journal ambiguo bloquea recuperación automática', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('changed');`);
  db.close();
  const operationId = crypto.randomUUID();
  fs.writeFileSync(rutaJournal(dbPath), `${JSON.stringify({ operationId, state: 'PROMOTING', originalSha256: '0'.repeat(64), stageSha256: '1'.repeat(64) })}\n`);

  await assert.rejects(
    recoverInterruptedOperation({ databasePath: dbPath, journalPath: rutaJournal(dbPath) }),
    /estado ambiguo/
  );
});

test('bloqueo activo de preparación impide dos procesos escritores', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  fs.writeFileSync(`${dbPath}.startup-lock`, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));

  await assert.rejects(
    prepareDatabase({ databasePath: dbPath, platform: 'win32', freeBytesProvider: () => 8 * 1024 * 1024 * 1024 }),
    /otra instancia preparando/
  );
  assert.equal(fs.existsSync(dbPath), false);
});

test('preparación de migración mantiene cursor y filas sintéticas pendientes', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const cursorPath = path.join(dir, 'cloud_sync_state.json');
  const cursorOriginal = Buffer.from('{"cursor":"fixture-123"}\n', 'utf8');
  fs.writeFileSync(cursorPath, cursorOriginal);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE pending_fixture (id TEXT PRIMARY KEY, payload TEXT NOT NULL); INSERT INTO pending_fixture VALUES ('pending-1', 'must-survive');`);
  db.close();

  const replaceForTest = (activePath, stagePath, backupPath) => {
    fs.renameSync(activePath, backupPath);
    fs.renameSync(stagePath, activePath);
  };
  const result = await prepareDatabase({
    databasePath: dbPath,
    cursorPath,
    platform: 'win32',
    promote: replaceForTest,
    freeBytesProvider: () => 8 * 1024 * 1024 * 1024
  });

  assert.equal(result.migrated, true);
  assert.deepEqual(fs.readFileSync(cursorPath), cursorOriginal);
  assert.equal(validateDatabase(dbPath, { requireComplete: true }).ok, true);
  const restored = new Database(dbPath, { readonly: true });
  try {
    assert.equal(restored.prepare('SELECT payload FROM pending_fixture WHERE id = ?').get('pending-1').payload, 'must-survive');
  } finally {
    restored.close();
  }
});

test('restauración falla antes de promoción sin alterar la base activa', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const backupPath = path.join(dir, 'selected-backup.db');
  const original = new Database(dbPath);
  original.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('original');");
  original.close();
  const target = new Database(backupPath);
  target.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('restored');");
  target.close();
  const originalHash = await sha256File(dbPath);
  const activeDb = new Database(dbPath);
  const promote = () => { throw new Error('fallo simulado antes del reemplazo'); };

  await assert.rejects(restoreDatabase({
    databasePath: dbPath,
    sourceBackupPath: backupPath,
    activeDb,
    closeActiveDb: () => activeDb.close(),
    promote
  }), /fallo simulado antes del reemplazo/);
  assert.equal(await sha256File(dbPath), originalHash);
  assert.equal(validateDatabase(dbPath, { fullIntegrity: true }).ok, true);
  assert.match(fs.readFileSync(rutaJournal(dbPath), 'utf8'), /"state":"FAILED"/);
  assert.ok(fs.readdirSync(dir).some((name) => name.endsWith('.backup.db')));
});

test('restauración sintética usa ReplaceFileW real y resetea el cursor junto con la base', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const backupPath = path.join(dir, 'selected-backup.db');
  const cursorPath = path.join(dir, 'cloud_sync_state.json');
  const original = new Database(dbPath);
  original.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('current');");
  original.close();
  const target = new Database(backupPath);
  target.exec(`
    CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('restored');
    CREATE TABLE catalogo_cum (cum TEXT PRIMARY KEY, producto TEXT, fuente_url TEXT);
    INSERT INTO catalogo_cum VALUES ('SYN-1', 'CATALOGO DE REFERENCIA', 'https://datos.gov.co/resource/i7cb-raxc.json');
    CREATE TABLE catalogo_codigos_pendientes (gtin TEXT PRIMARY KEY, estado TEXT);
    INSERT INTO catalogo_codigos_pendientes VALUES ('7700000000000', 'PENDIENTE_CATALOGO');
  `);
  target.close();
  const cursorBytes = Buffer.from('{"cursor":"old"}\n');
  fs.writeFileSync(cursorPath, cursorBytes);
  const originalHash = await sha256File(dbPath);
  const targetHash = await sha256File(backupPath);
  const activeDb = new Database(dbPath);

  const result = await restoreDatabase({
    databasePath: dbPath,
    cursorPath,
    sourceBackupPath: backupPath,
    activeDb,
    closeActiveDb: () => activeDb.close()
  });

  assert.equal(result.restored, true);
  assert.equal(result.originalSha256, originalHash);
  assert.equal(await sha256File(dbPath), targetHash);
  const restaurada = new Database(dbPath, { readonly: true });
  assert.equal(restaurada.prepare('SELECT producto FROM catalogo_cum WHERE cum = ?').get('SYN-1').producto, 'CATALOGO DE REFERENCIA');
  assert.equal(restaurada.prepare('SELECT estado FROM catalogo_codigos_pendientes WHERE gtin = ?').get('7700000000000').estado, 'PENDIENTE_CATALOGO');
  restaurada.close();
  assert.equal(fs.existsSync(cursorPath), false);
  const promotionCopy = fs.readdirSync(dir).find((name) => name.endsWith('.promoted-old.db'));
  assert.ok(promotionCopy);
  assert.equal(await sha256File(path.join(dir, promotionCopy)), originalHash);
  assert.match(fs.readFileSync(rutaJournal(dbPath), 'utf8'), /"state":"COMMITTED"/);
});

test('rollback rechaza una copia SQLite válida con hash ajeno y usa la copia exacta original', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const backupPath = path.join(dir, 'selected-backup.db');
  const cursorPath = path.join(dir, 'cloud_sync_state.json');
  const original = new Database(dbPath);
  original.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('original');");
  original.close();
  const target = new Database(backupPath);
  target.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('restored');");
  target.close();
  const wrongPath = path.join(dir, 'valid-but-wrong.db');
  const wrong = new Database(wrongPath);
  wrong.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('wrong database');");
  wrong.close();
  const originalHash = await sha256File(dbPath);
  const cursorBytes = Buffer.from('{"cursor":"pre-restore"}\n');
  fs.writeFileSync(cursorPath, cursorBytes);
  const activeDb = new Database(dbPath);
  let promotionCount = 0;
  const promoteThenCorruptPromotionCopy = (activePath, replacementPath, promotionCopyPath) => {
    promotionCount += 1;
    fs.renameSync(activePath, promotionCopyPath);
    fs.renameSync(replacementPath, activePath);
    if (promotionCount === 1) {
      fs.copyFileSync(wrongPath, promotionCopyPath);
      throw new Error('error después de promover: copia previa válida pero incorrecta');
    }
  };

  await assert.rejects(restoreDatabase({
    databasePath: dbPath,
    cursorPath,
    sourceBackupPath: backupPath,
    activeDb,
    closeActiveDb: () => activeDb.close(),
    promote: promoteThenCorruptPromotionCopy
  }), /error después de promover/);

  assert.equal(promotionCount, 2, 'el rollback debe usar la copia previa con hash exacto');
  assert.equal(await sha256File(dbPath), originalHash);
  assert.deepEqual(fs.readFileSync(cursorPath), cursorBytes);
  assert.equal(validateDatabase(dbPath, { fullIntegrity: true }).ok, true);
  assert.equal(validateDatabase(path.join(dir, 'valid-but-wrong.db'), { fullIntegrity: true }).ok, true);
  const wrongPromotionCopy = fs.readdirSync(dir).find((name) => name.endsWith('.promoted-old.db'));
  assert.ok(wrongPromotionCopy);
  assert.equal(await sha256File(path.join(dir, wrongPromotionCopy)), await sha256File(wrongPath));
  assert.match(fs.readFileSync(rutaJournal(dbPath), 'utf8'), /"state":"ROLLED_BACK"/);
});

test('fallo de cierre no promueve el respaldo y conserva activa la conexión y la base', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const backupPath = path.join(dir, 'selected-backup.db');
  const original = new Database(dbPath);
  original.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('original');");
  original.close();
  const target = new Database(backupPath);
  target.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('restored');");
  target.close();
  const originalHash = await sha256File(dbPath);
  const activeDb = new Database(dbPath);
  let promotions = 0;

  await assert.rejects(restoreDatabase({
    databasePath: dbPath,
    sourceBackupPath: backupPath,
    activeDb,
    closeActiveDb: () => { throw new Error('cierre simulado'); },
    promote: () => { promotions += 1; }
  }), /cierre simulado/);

  assert.equal(activeDb.open, true, 'el test no debe fingir que la conexión fallida se cerró');
  assert.equal(promotions, 0);
  assert.equal(await sha256File(dbPath), originalHash);
  activeDb.close();
});

test('checkpoint bloqueado aborta restauración y conserva WAL/SHM sin promover', async (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const dbPath = path.join(dir, 'active.db');
  const backupPath = path.join(dir, 'selected-backup.db');
  const activeDb = new Database(dbPath);
  activeDb.pragma('journal_mode = WAL');
  activeDb.exec('CREATE TABLE fixture (value INTEGER NOT NULL); INSERT INTO fixture VALUES (1);');
  const reader = new Database(dbPath, { readonly: true });
  reader.exec('BEGIN');
  reader.prepare('SELECT * FROM fixture').all();
  activeDb.exec('INSERT INTO fixture VALUES (2);');
  const target = new Database(backupPath);
  target.exec('CREATE TABLE fixture (value INTEGER NOT NULL); INSERT INTO fixture VALUES (9);');
  target.close();
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  assert.ok(fs.statSync(walPath).size > 0);
  assert.ok(fs.existsSync(shmPath));
  let promotions = 0;

  await assert.rejects(restoreDatabase({
    databasePath: dbPath,
    sourceBackupPath: backupPath,
    activeDb,
    closeActiveDb: () => activeDb.close(),
    promote: () => { promotions += 1; }
  }), /No se pudo completar wal_checkpoint/);

  assert.equal(promotions, 0);
  assert.ok(fs.existsSync(walPath), 'el WAL no se elimina cuando falla checkpoint');
  assert.ok(fs.existsSync(shmPath), 'el SHM no se elimina cuando falla checkpoint');
  reader.exec('ROLLBACK');
  reader.close();
  const verify = new Database(dbPath, { readonly: true });
  try {
    assert.deepEqual(verify.prepare('SELECT value FROM fixture ORDER BY value').all(), [{ value: 1 }, { value: 2 }]);
  } finally {
    verify.close();
  }
});

test('espacio estimado se deriva de tamaños SQLite y scratch de VACUUM', () => {
  const base = requiredSpace({ sourceBytes: 2_000, logicalBytes: 4_000, hasSource: true, pendingMigrations: ['001_example'] });
  const withVacuum = requiredSpace({ sourceBytes: 2_000, logicalBytes: 4_000, hasSource: true, pendingMigrations: ['026_optimizar_catalogo_cum'] });
  const withCatalogCompaction = requiredSpace({ sourceBytes: 2_000, logicalBytes: 4_000, hasSource: true, pendingMigrations: ['038_recompactar_catalogo_local'] });
  assert.equal(withVacuum - base, 4_000);
  assert.equal(withCatalogCompaction - base, 4_000);
});

test('ReplaceFileW conserva el archivo anterior en un respaldo en Windows', { skip: process.platform !== 'win32' }, (t) => {
  const dir = crearTemporal();
  t.after(() => eliminarTemporal(dir));
  const active = path.join(dir, 'active.bin');
  const stage = path.join(dir, 'stage.bin');
  const backup = path.join(dir, 'backup.bin');
  fs.writeFileSync(active, 'original');
  fs.writeFileSync(stage, 'replacement');

  promoteWithReplaceFile(active, stage, backup);

  assert.equal(fs.readFileSync(active, 'utf8'), 'replacement');
  assert.equal(fs.readFileSync(backup, 'utf8'), 'original');
});
