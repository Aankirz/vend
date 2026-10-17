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
    const res = await fetch(`${result.upstreamUrl}/run`, { method: 'POST', body: JSON.stringify({ a: 2, b: 5 }) });
    assert.deepEqual(await res.json(), { ok: true, result: 7 });
  } finally {
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
