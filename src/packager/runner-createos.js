// CreateOS runner: build, test and serve in ONE sandbox (free plan = 1 sandbox at a time).
import { CreateosSandboxClient } from '@nodeops-createos/sandbox';

const SHAPE = 's-1vcpu-1gb';
const ROOTFS = 'devbox:1'; // verified: Python 3.13 + matplotlib 3.10 + pip preinstalled
const WORKDIR = '/srv/vend';
const NAME_PREFIX = 'vend-';
const EXEC_TIMEOUT_MS = 180_000;
// A non-empty allowlist is deny-by-default; this TEST-NET-1 address routes nowhere, so nothing passes.
const LOCKED_EGRESS = ['192.0.2.1:9'];
const CLEAN_CMD = `pkill -f '[p]ython3 server.py'; rm -rf ${WORKDIR}; mkdir -p ${WORKDIR}`;
const PROBE_CMD = 'curl -sS -m 5 -o /dev/null https://example.com';

function requireKey(apiKey) {
  if (!apiKey) throw new Error('CREATEOS_SANDBOX_API_KEY is not set (add it to .env, or use --local)');
}

// Only ever touches sandboxes Vend created (name starts with "vend-").
export async function destroyVendSandboxes({ apiKey = process.env.CREATEOS_SANDBOX_API_KEY } = {}) {
  requireKey(apiKey);
  const client = new CreateosSandboxClient({ apiKey });
  const ours = (await client.listSandboxes()).filter(
    (s) => s.name?.startsWith(NAME_PREFIX) && !['destroying', 'destroyed'].includes(s.status),
  );
  for (const s of ours) await s.destroy();
  return ours.map((s) => s.id);
}

async function findReusable(client, reuseId) {
  if (reuseId) return client.getSandbox(reuseId);
  const running = (await client.listSandboxes()).filter((s) => s.name?.startsWith(NAME_PREFIX) && s.status === 'running');
  return running[0];
}

export function createCreateosRunner({ apiKey = process.env.CREATEOS_SANDBOX_API_KEY, reuseId } = {}) {
  let sandbox;
  const run = async (script) => {
    const { result } = await sandbox.runCommand('bash', ['-lc', script], { timeoutMs: EXEC_TIMEOUT_MS });
    return { exitCode: result.exit_code, stdout: result.stdout, stderr: result.stderr || result.error || '' };
  };
  return {
    get id() { return sandbox?.id; },
    // Reuses `reuseId`, else a running vend-* sandbox, else creates one: the free plan allows ~10 creations/day.
    async create() {
      requireKey(apiKey);
      const client = new CreateosSandboxClient({ apiKey });
      sandbox = await findReusable(client, reuseId);
      if (sandbox) {
        await sandbox.setEgress(LOCKED_EGRESS);
        await run(CLEAN_CMD);
        return;
      }
      await destroyVendSandboxes({ apiKey });
      sandbox = await client.createSandbox({
        shape: SHAPE, rootfs: ROOTFS, name: `${NAME_PREFIX}${Date.now()}`,
        ingress_enabled: true, egress: LOCKED_EGRESS, // locked before any seller/LLM code runs; auto-pause off on purpose
      });
      await run(`mkdir -p ${WORKDIR}`);
    },
    writeFile: (path, content) => sandbox.files.upload(`${WORKDIR}/${path}`, content),
    exec: (cmd) => run(`cd ${WORKDIR} && ${cmd}`),
    async startServer(cmd, port) {
      // setsid -f detaches with every fd redirected; a `cmd &` subshell keeps the exec pipe open and runCommand hangs.
      await run(`cd ${WORKDIR} && PORT=${port} setsid -f ${cmd} >/tmp/server.log 2>&1 </dev/null`);
      await sandbox.waitForPortReady(port, { timeoutMs: 30_000 });
      return sandbox.previewUrl(port);
    },
    // Egress is locked at create; returns true only if an outbound request from inside actually fails.
    async lockNetwork() {
      await sandbox.setEgress(LOCKED_EGRESS);
      for (let i = 0; i < 5; i++) {
        if ((await run(PROBE_CMD)).exitCode !== 0) return true;
        await new Promise((r) => setTimeout(r, 2000)); // hostname policy needs a moment to propagate
      }
      return false;
    },
    // Keep the VM (creations are scarce) but leave nothing of this tool running in it.
    async release() {
      if (sandbox) await run(CLEAN_CMD);
    },
    async destroy() {
      if (sandbox) await sandbox.destroy();
    },
  };
}
