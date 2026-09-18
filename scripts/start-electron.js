const { spawn } = require('child_process');
const path = require('path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron.cmd');
const child = spawn('cmd', ['/c', electronPath, '.'], {
  env,
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  windowsHide: false,
});

child.on('close', (code) => {
  process.exit(code || 0);
});
