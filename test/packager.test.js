import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { packageTool, summarizeTestOutput } from '../src/packager/index.js';
import { chatJson, parseJson } from '../src/packager/llm.js';
import { createLocalRunner } from '../src/packager/runner-local.js';

const hasPython = (() => {
  try { execFileSync('python3', ['--version']); return true; } catch { return false; }
})();
const skip = hasPython ? false : 'python3 not installed';

const BUGGY_TOOL = 'def add(a, b):\n    return a - b\n';
const FIXED_TOOL = 'def add(a, b):\n    return a + b\n';
const SERVER_PY = `import json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from tool import add

class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        self._send(200, {"ok": True}) if self.path == "/health" else self._send(404, {"ok": False, "error": "not found"})
    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
            self._send(200, {"ok": True, "result": add(**body)})
        except Exception as e:
            self._send(400, {"ok": False, "error": str(e)})

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
`;
const TEST_PY = `import unittest
from tool import add

class T(unittest.TestCase):
    def test_adds(self):
        self.assertEqual(add(2, 3), 5)
    def test_negative(self):
        self.assertEqual(add(-1, 1), 0)
    def test_bad_input(self):
        with self.assertRaises(TypeError):
            add(1)
`;
const reply = (toolPy = null) => ({
  server_py: SERVER_PY, test_tool_py: TEST_PY, requirements: [], tool_py: toolPy,
  input_schema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
});

function stubLlm(replies) {
  const calls = [];
  const llm = async (messages) => {
    calls.push(messages.map((m) => m.content).join('\n'));
    return replies[Math.min(calls.length - 1, replies.length - 1)];
  };
  return { llm, calls };
}

test('fixes the seller bug on attempt 2, then serves /run', { skip }, async () => {
  const { llm, calls } = stubLlm([reply(), reply(FIXED_TOOL)]);
  const runner = createLocalRunner();
  const logs = [];
  const result = await packageTool({ name: 'add', code: BUGGY_TOOL }, { runner, llm, onLog: (l) => logs.push(l) });
  try {
    assert.equal(result.testsPassed, true);
    assert.equal(result.attempts, 2);
    assert.match(calls[1], /AssertionError/); // test output was sent back to the LLM
    assert.ok(logs.some((l) => l.startsWith('test failed:')) && logs.includes('fixing') && logs.includes('✅ 3/3 passed'));
    assert.ok(logs.includes('live ✅'));
    assert.ok(!logs.some((l) => l.includes(result.upstreamUrl)), 'public log must not leak the upstream URL');
    const res = await fetch(`${result.upstreamUrl}/run`, { method: 'POST', body: JSON.stringify({ a: 2, b: 5 }) });
    assert.deepEqual(await res.json(), { ok: true, result: 7 });
  } finally {
    await runner.destroy();
  }
});

// Fake runner: records calls; tests "pass" when the stubbed exec says so.
function fakeRunner({ lock = true, failCreate = false, testsPass = true } = {}) {
  const calls = [];
  return {
    calls,
    id: 'sb-fake',
    async create() { calls.push('create'); if (failCreate) throw new Error('quota'); },
    async writeFile() {},
    async exec() { return testsPass ? { exitCode: 0, stdout: '', stderr: 'Ran 3 tests\n\nOK' } : { exitCode: 1, stdout: '', stderr: 'Ran 3 tests\nFAILED (failures=1)' }; },
    async startServer() { calls.push('start'); return 'http://127.0.0.1:1'; },
    async lockNetwork() { return lock; },
    async release() { calls.push('release'); },
    async destroy() { calls.push('destroy'); },
  };
}

test('unverified egress lock aborts before tests run and releases the sandbox', async () => {
  const runner = fakeRunner({ lock: false });
  await assert.rejects(packageTool({ name: 'add', code: FIXED_TOOL }, { runner, llm: stubLlm([reply()]).llm }), /egress lock not verified/);
  assert.deepEqual(runner.calls, ['create', 'release']);
});

test('setup failure releases, never destroys', async () => {
  const runner = fakeRunner({ failCreate: true });
  await assert.rejects(packageTool({ name: 'add', code: FIXED_TOOL }, { runner, llm: stubLlm([reply()]).llm }), /quota/);
  assert.deepEqual(runner.calls, ['create', 'release']);
});

test('failing tests release the reused sandbox instead of destroying it', async () => {
  const runner = fakeRunner({ testsPass: false });
  const result = await packageTool({ name: 'add', code: FIXED_TOOL }, { runner, llm: stubLlm([reply()]).llm, maxAttempts: 2 });
  assert.equal(result.testsPassed, false);
  assert.ok(runner.calls.includes('release') && !runner.calls.includes('destroy'));
});

test('local runner hides this process env from seller code', { skip }, async () => {
  process.env.VEND_TEST_SECRET = 'sk_test_should_not_leak';
  const runner = createLocalRunner();
  await runner.create();
  try {
    const res = await runner.exec('python3 -c "import os; print(os.environ.get(\'VEND_TEST_SECRET\'))"');
    assert.equal(res.stdout.trim(), 'None');
  } finally {
    delete process.env.VEND_TEST_SECRET;
    await runner.destroy();
  }
});

test('always-broken tool stops at the attempt cap', { skip }, async () => {
  const { llm, calls } = stubLlm([reply()]);
  const result = await packageTool({ name: 'add', code: BUGGY_TOOL }, { runner: createLocalRunner(), llm });
  assert.equal(result.testsPassed, false);
  assert.equal(result.attempts, 4);
  assert.equal(calls.length, 4);
  assert.equal(result.upstreamUrl, null);
});

test('malformed LLM reply counts as an attempt instead of crashing', { skip }, async () => {
  const { llm } = stubLlm([{ nope: true }, reply(FIXED_TOOL)]);
  const runner = createLocalRunner();
  const result = await packageTool({ name: 'add', code: BUGGY_TOOL }, { runner, llm });
  await runner.destroy();
  assert.equal(result.testsPassed, true);
  assert.equal(result.attempts, 2);
});

test('parseJson strips code fences and surrounding prose', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Sure! {"a":{"b":2}} hope that helps'), { a: { b: 2 } });
  assert.throws(() => parseJson('no json here'), /not JSON/);
});

test('summarizeTestOutput counts failures and finds the reason', () => {
  const out = 'FAIL: test_adds\nTraceback...\nAssertionError: -1 != 5\n\nRan 3 tests in 0.001s\n\nFAILED (failures=1, errors=1)\n';
  assert.deepEqual(summarizeTestOutput(out), { ran: 3, failed: 2, passed: 1, reason: 'AssertionError: -1 != 5' });
});

test('chatJson names the missing env var', async () => {
  await assert.rejects(chatJson([], { apiKey: '' }), /AI_GATEWAY_API_KEY/);
});
