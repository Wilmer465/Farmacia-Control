const { spawnSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const rootDir = path.join(__dirname, '..');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// Rebuild native modules (better-sqlite3) for Electron's ABI (v128)
console.log('[start-electron] Rebuilding native modules for Electron...');
const sqliteDir = path.join(rootDir, 'node_modules', 'better-sqlite3');
  spawnSync('node', ['../prebuild-install/bin.js', '-r', 'electron', '-t', '32.3.3', '-a', 'x64', '--force'], {
    env: { ...env, npm_config_build_from_source: 'false' },
    cwd: sqliteDir,
    stdio: 'inherit',
    shell: true,
    timeout: 120000
  });
  if (!fs.existsSync(path.join(sqliteDir, 'build', 'Release', 'better_sqlite3.node'))) {
    console.error('[start-electron] prebuild-install failed, falling back to electron-builder...');
    spawnSync('npm', ['run', 'rebuild:electron'], {
      env,
      stdio: 'inherit',
      cwd: rootDir,
      shell: true,
      timeout: 120000
    });
  }

console.log('[start-electron] Starting Electron...');
const electronPath = path.join(rootDir, 'node_modules', '.bin', 'electron.cmd');
const child = spawn('cmd', ['/c', electronPath, '.'], {
  env,
  stdio: 'inherit',
  cwd: rootDir,
  windowsHide: false,
});

child.on('close', (code) => {
  process.exit(code || 0);
});
