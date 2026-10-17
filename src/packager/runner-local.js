// Local runner: temp dir + python3 subprocesses. For tests and offline dev.
import { exec as cpExec, execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const EXEC_TIMEOUT_MS = 180_000;
// ponytail: one shared venv so `pip install` never touches system Python; per-run venvs if isolation matters
const VENV_DIR = join(tmpdir(), 'vend-venv');

async function ensureVenv(python) {
  if (existsSync(join(VENV_DIR, 'bin', 'python3'))) return;
  await promisify(execFile)(python, ['-m', 'venv', '--system-site-packages', VENV_DIR]);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    }).on('error', reject);
  });
}

export function createLocalRunner({ python = process.env.VEND_PYTHON || 'python3' } = {}) {
  let dir;
  let server;
  let env;
  return {
    get id() { return dir && `local:${dir}`; },
    async create() {
      await ensureVenv(python);
      dir = await mkdtemp(join(tmpdir(), 'vend-'));
      env = { ...process.env, PATH: `${join(VENV_DIR, 'bin')}:${process.env.PATH}`, PYTHONDONTWRITEBYTECODE: '1' };
    },
    async writeFile(path, content) {
      const full = join(dir, path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content);
    },
    exec(cmd) {
      return new Promise((resolve) => {
        cpExec(cmd, { cwd: dir, env, timeout: EXEC_TIMEOUT_MS, maxBuffer: 16 << 20 }, (err, stdout, stderr) => {
          resolve({ exitCode: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr });
        });
      });
    },
    async startServer(cmd) {
      const port = await freePort(); // the requested port may be taken locally; server.py reads PORT
      server = spawn(cmd, { shell: true, cwd: dir, env: { ...env, PORT: String(port) }, stdio: 'ignore' });
      return `http://127.0.0.1:${port}`;
    },
    async lockNetwork() { return false; }, // no egress control locally
    async destroy() {
      server?.kill();
      if (dir) await rm(dir, { recursive: true, force: true });
    },
  };
}
