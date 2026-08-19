#!/usr/bin/env node
// Launch a script inside the ml-service virtualenv.
//
// Exists because the venv interpreter lives at a different path on
// Windows (.venv/Scripts/python.exe) than everywhere else
// (.venv/bin/python), and because npm runs scripts through cmd.exe on
// Windows, where forward slashes in a bare path are read as switches.
// Resolving it in Node avoids both problems and keeps one command that
// works in PowerShell, cmd, and a POSIX shell.
//
//   npm run ml:compare
//   npm run ml:test

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mlService = path.join(root, 'ml-service');

const python =
  process.platform === 'win32'
    ? path.join(mlService, '.venv', 'Scripts', 'python.exe')
    : path.join(mlService, '.venv', 'bin', 'python');

if (!existsSync(python)) {
  console.error(
    `\nNo virtualenv found at ${python}\n\n` +
      'Create it once:\n' +
      (process.platform === 'win32'
        ? '  python -m venv ml-service\.venv\n' +
          '  ml-service\.venv\Scripts\python.exe -m pip install -r ml-service\requirements.txt\n'
        : '  python3 -m venv ml-service/.venv\n' +
          '  ml-service/.venv/bin/python -m pip install -r ml-service/requirements.txt\n')
  );
  process.exit(1);
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/ml.js <script.py>');
  process.exit(1);
}

const result = spawnSync(python, [path.join(mlService, target), ...process.argv.slice(3)], {
  stdio: 'inherit',
  cwd: mlService,
});

process.exit(result.status ?? 1);
