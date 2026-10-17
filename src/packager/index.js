// Packaging agent: LLM writes wrapper + tests, runner tests them, LLM fixes, repeat until green, then serve.
import { chatJson } from './llm.js';
import { createLocalRunner } from './runner-local.js';

const MAX_ATTEMPTS = 4;
const SERVER_PORT = 8080;
const HEALTH_TIMEOUT_MS = 60_000;
const OUTPUT_TAIL_CHARS = 4000;
const PIP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9,._-]+\])?([<>=!~]=?[A-Za-z0-9.*]+)?$/;

const SYSTEM_PROMPT = `You package a seller's Python tool as a small HTTP service. Reply with ONE JSON object and nothing else:
{"server_py": string, "test_tool_py": string, "input_schema": object, "requirements": string[], "tool_py": string | null}

- The seller's code is saved as tool.py next to your files. Import the tool function from it (from tool import ...).
- server_py: Python standard library only (http.server, json, os). ThreadingHTTPServer bound to 0.0.0.0, port int(os.environ.get("PORT", "8080")).
  GET /health -> 200 {"ok": true}. POST /run with a JSON object body -> call the tool with the body as keyword arguments -> 200 {"ok": true, "result": <return value>}.
  Invalid JSON, wrong arguments or any tool exception -> 400 {"ok": false, "error": "<message>"}. The server must never crash. Only serve when run as __main__.
  The sandbox has no outbound network: if the tool raises OSError (urllib.error.URLError, socket errors) the error string must start with "network blocked: ".
- test_tool_py: standard library unittest only, 3 to 5 test methods, at least one with bad input. Include one test that starts server.py's server on port 0 in a background thread and POSTs a valid body to /run, asserting ok is true and the result survives json.dumps. No network except localhost.
- input_schema: JSON Schema (type "object") for the POST /run body, with a realistic "examples" array holding one valid body.
- requirements: pip package names tool.py imports outside the standard library (for example ["matplotlib"]).
- tool_py: null in your first reply: never change the seller's code until a test run proves it wrong. Later, if the failure is in tool.py, the full fixed file. Never weaken tests to make them pass.`;

const initialMessages = ({ name, description, code }) => [
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user', content: `Tool name: ${name}\nDescription: ${description || '(none)'}\n\ntool.py:\n${code}` },
];

// Test output can hold whole base64 PNGs; they burn tokens and the free model chokes on them.
const shrinkBlobs = (text) => text.replace(/[A-Za-z0-9+/=]{120,}/g, (m) => `${m.slice(0, 40)}…<${m.length} chars>`);

// Stateless fix turn: the stealth model rejects requests carrying assistant turns, so fold history into one user message.
const fixMessages = (tool, previous, output) => {
  const [system, user] = initialMessages(tool);
  return [system, {
    role: 'user',
    content: `${user.content}\n\nYour previous reply:\n${previous}\n\nThe tests failed. Output:\n${shrinkBlobs(output).slice(-OUTPUT_TAIL_CHARS)}\n\n`
      + 'Find the root cause (it may be in tool.py) and reply with the full corrected JSON object, same keys.',
  }];
};

function checkReply(reply) {
  const missing = ['server_py', 'test_tool_py'].filter((k) => typeof reply?.[k] !== 'string' || !reply[k].trim());
  return missing.length ? `reply is missing ${missing.join(', ')}` : null;
}

export function summarizeTestOutput(output) {
  const ran = Number(output.match(/Ran (\d+) tests?/)?.[1] ?? 0);
  const failed = output.match(/FAILED \(([^)]*)\)/)?.[1]
    .split(',').reduce((n, part) => n + Number(part.split('=')[1] || 0), 0) ?? 0;
  const reason = output.split('\n').find((l) => /^\w*(Error|Exception)\b.*:/.test(l))
    ?? output.split('\n').find((l) => /^(FAIL|ERROR):/.test(l)) ?? 'see output';
  return { ran, failed, passed: Math.max(ran - failed, 0), reason: shrinkBlobs(reason.trim()).slice(0, 160) };
}

async function writeFiles(runner, files) {
  for (const [path, content] of Object.entries(files)) await runner.writeFile(path, content);
}

async function installAndLock(runner, requirements, log) {
  const reqs = (Array.isArray(requirements) ? requirements : []).filter(Boolean);
  const bad = reqs.filter((r) => !PIP_NAME.test(r));
  if (bad.length) throw new Error(`refusing suspicious requirement names: ${bad.join(', ')}`);
  // `pip show` is offline: skip the install when deps are already there (CreateOS devbox, locked egress).
  if (reqs.length && (await runner.exec(`python3 -m pip show -q ${reqs.join(' ')}`)).exitCode !== 0) {
    log(`installing ${reqs.join(', ')}`);
    const res = await runner.exec(`python3 -m pip install -q ${reqs.join(' ')}`);
    if (res.exitCode !== 0) log(`pip install failed: ${res.stderr.trim().split('\n').pop()}`);
  }
  if (await runner.lockNetwork()) log('network locked');
}

async function runTests(runner, testFile, log) {
  const count = (testFile.match(/^\s+def test_/gm) || []).length;
  log(`running ${count} tests`);
  const res = await runner.exec('python3 -m unittest -v test_tool 2>&1');
  const output = `${res.stdout}${res.stderr}`;
  const summary = summarizeTestOutput(output);
  const ok = res.exitCode === 0 && summary.ran > 0;
  log(ok ? `✅ ${summary.passed}/${summary.ran} passed` : `test failed: ${summary.reason}`);
  return { ok, output };
}

async function testLoop(tool, { runner, llm, log, maxAttempts }) {
  let messages = initialMessages(tool);
  const files = { 'tool.py': tool.code };
  let reply;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(attempt === 1 ? 'writing wrapper' : 'fixing');
    reply = await llm(messages);
    const problem = checkReply(reply);
    if (problem) {
      log(`bad LLM reply: ${problem}`);
      messages = fixMessages(tool, JSON.stringify(reply), `Invalid reply: ${problem}.`);
      continue;
    }
    if (typeof reply.tool_py === 'string' && reply.tool_py.trim()) files['tool.py'] = reply.tool_py;
    Object.assign(files, { 'server.py': reply.server_py, 'test_tool.py': reply.test_tool_py });
    await writeFiles(runner, files);
    if (attempt === 1) await installAndLock(runner, reply.requirements, log);
    const { ok, output } = await runTests(runner, reply.test_tool_py, log);
    if (ok) return { testsPassed: true, attempts: attempt, inputSchema: reply.input_schema ?? null };
    messages = fixMessages(tool, JSON.stringify({ ...reply, tool_py: files['tool.py'] }), output);
  }
  log(`giving up after ${maxAttempts} attempts`);
  return { testsPassed: false, attempts: maxAttempts, inputSchema: reply?.input_schema ?? null };
}

async function waitForHealth(url) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server did not answer ${url}/health within ${HEALTH_TIMEOUT_MS / 1000}s`);
}

export async function packageTool(tool, { onLog = () => {}, runner = createLocalRunner(), llm = chatJson, maxAttempts = MAX_ATTEMPTS } = {}) {
  if (!tool?.name || !tool?.code) throw new Error('packageTool needs { name, code }');
  const log = (line) => onLog(line);
  log('creating sandbox');
  await runner.create();
  try {
    const result = await testLoop(tool, { runner, llm, log, maxAttempts });
    if (!result.testsPassed) {
      await runner.destroy();
      return { upstreamUrl: null, sandboxId: null, ...result };
    }
    log('starting server');
    const upstreamUrl = await runner.startServer('python3 server.py', SERVER_PORT);
    await waitForHealth(upstreamUrl);
    log(`live at ${upstreamUrl}`);
    return { upstreamUrl, sandboxId: runner.id, ...result };
  } catch (err) {
    await runner.destroy().catch(() => {});
    throw err;
  }
}
