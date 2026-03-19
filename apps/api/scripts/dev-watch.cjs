const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const watchIntervalMs = 700;
const envFilePath = path.join(rootDir, '.env');
const extraFiles = ['.env', 'tsconfig.json', 'tsconfig.build.json']
  .map((file) => path.join(rootDir, file))
  .filter((file) => fs.existsSync(file));
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const watchedFiles = new Set();
const ignoredDirs = new Set(['dist', 'node_modules']);

let child = null;
let restarting = false;
let shuttingDown = false;
let restartTimer = null;
let needsMigration = true;

function parseEnvFile() {
  if (!fs.existsSync(envFilePath)) return {};

  const content = fs.readFileSync(envFilePath, 'utf8');
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function collectSourceFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && /\.(ts|json)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function log(message) {
  process.stdout.write(`[api-dev] ${message}\n`);
}

function buildEnv() {
  const envFromFile = parseEnvFile();
  return {
    ...envFromFile,
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || envFromFile.NODE_ENV || 'development',
  };
}

function isSchemaChange(filePath) {
  if (!filePath) return true;

  return (
    filePath.includes(`${path.sep}src${path.sep}database${path.sep}migrations${path.sep}`) ||
    filePath.endsWith(`${path.sep}src${path.sep}database${path.sep}data-source.ts`) ||
    filePath.includes(`${path.sep}entities${path.sep}`) ||
    filePath.endsWith(`${path.sep}src${path.sep}app.module.ts`)
  );
}

function runMigrations(onDone) {
  log('running pending migrations');

  const migrationProcess = spawn(pnpmCommand, ['run', 'db:migrate'], {
    cwd: rootDir,
    env: buildEnv(),
    stdio: 'inherit',
  });

  migrationProcess.on('exit', (code, signal) => {
    if (code === 0) {
      needsMigration = false;
      onDone?.();
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    log(`migration step failed (${reason})`);
  });
}

function ensureSchema(onDone, filePath) {
  if (!needsMigration && !isSchemaChange(filePath)) {
    onDone?.();
    return;
  }

  needsMigration = true;
  runMigrations(onDone);
}

function startChild() {
  log('server starting');

  child = spawn(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', 'src/main.ts'],
    {
      cwd: rootDir,
      env: buildEnv(),
      stdio: 'inherit',
    },
  );

  child.on('exit', (code, signal) => {
    const expected = restarting || shuttingDown;
    child = null;

    if (expected) return;

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    log(`server exited unexpectedly (${reason})`);
  });
}

function killChild(onExit) {
  if (!child) {
    onExit?.();
    return;
  }

  const processToKill = child;
  const timeout = setTimeout(() => {
    if (processToKill.exitCode == null && processToKill.signalCode == null) {
      processToKill.kill('SIGKILL');
    }
  }, 5000);

  processToKill.once('exit', () => {
    clearTimeout(timeout);
    onExit?.();
  });

  processToKill.kill('SIGTERM');
}

function restart(filePath) {
  if (shuttingDown) return;

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;

    if (restarting) return;
    restarting = true;

    const relativePath = filePath ? path.relative(rootDir, filePath) : 'unknown';
    log(`change detected: ${relativePath}`);

    killChild(() => {
      restarting = false;
      ensureSchema(startChild, filePath);
    });
  }, 120);
}

function watchFile(filePath) {
  if (watchedFiles.has(filePath)) return;
  watchedFiles.add(filePath);

  fs.watchFile(filePath, { interval: watchIntervalMs }, (current, previous) => {
    if (current.mtimeMs !== previous.mtimeMs) {
      restart(filePath);
    }
  });
}

function syncWatchedFiles() {
  const nextFiles = new Set([...collectSourceFiles(srcDir), ...extraFiles]);

  for (const filePath of nextFiles) {
    watchFile(filePath);
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  log(`shutting down (${signal})`);

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  for (const filePath of watchedFiles) {
    fs.unwatchFile(filePath);
  }

  killChild(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

syncWatchedFiles();
setInterval(syncWatchedFiles, 3000).unref();
ensureSchema(startChild);
