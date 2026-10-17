// CLI: node scripts/package.js examples/chart_tool.py --price 0.50 [--local]
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { packageTool } from '../src/packager/index.js';
import { createLocalRunner } from '../src/packager/runner-local.js';
import { createCreateosRunner } from '../src/packager/runner-createos.js';

try { process.loadEnvFile?.(); } catch { /* no .env: rely on the real environment */ }

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { price: { type: 'string', default: '0.50' }, local: { type: 'boolean', default: false }, name: { type: 'string' }, reuse: { type: 'string' } },
});

function fail(message) {
  console.error(`error: ${message}`);
  const envVar = message.match(/\b([A-Z][A-Z0-9_]+_KEY)\b/)?.[1];
  if (envVar) console.error(`OWNER NEEDED: ${envVar} — add ${envVar}=... to .env (see .env.example)`);
  process.exit(1);
}

async function main() {
  const file = positionals[0];
  if (!file) fail('usage: node scripts/package.js <tool.py> [--price 0.50] [--local | --reuse <sandboxId>]');
  if (!values.local && !process.env.CREATEOS_SANDBOX_API_KEY) fail('CREATEOS_SANDBOX_API_KEY is not set (or pass --local)');
  if (!process.env.AI_GATEWAY_API_KEY) fail('AI_GATEWAY_API_KEY is not set');
  const code = await readFile(file, 'utf8');
  const runner = values.local ? createLocalRunner() : createCreateosRunner({ reuseId: values.reuse });
  const name = values.name || basename(file, '.py');
  const started = Date.now();
  const result = await packageTool(
    { name, description: `Python tool from ${basename(file)}`, code, priceUsd: Number(values.price) },
    { runner, onLog: (line) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`) },
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.testsPassed) process.exit(2);
  if (values.local) {
    console.log('local server running — Ctrl-C to stop');
    process.on('SIGINT', () => runner.destroy().finally(() => process.exit(0)));
  } else {
    console.log(`sandbox ${result.sandboxId} stays up; next package run reuses it`);
    process.exit(0);
  }
}

main().catch((err) => fail(err.message));
