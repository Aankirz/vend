# Phase 2 — Packaging agent + CreateOS sandbox

You are a builder on the Vend hackathon project (deadline 06:00 IST today — move fast, ship working slices). Read `PLAN.md` and `docs/phases/CONTRACT.md` first; the contract is binding. Another builder is doing phase 1 (gateway) in parallel — stay inside your files.

## Build
- `examples/chart_tool.py` — the demo seller tool: a plain Python function `make_chart(data: list[{label, value}], title: str, kind: "bar"|"line") -> str` that returns a base64 PNG made with matplotlib. Plus `examples/broken_tool.py` with one realistic bug the agent must fix on the first test run (for the demo).
- `src/packager/llm.js` — minimal chat call with `fetch` (no SDK) to **Vercel AI Gateway**, OpenAI-compatible: `POST https://ai-gateway.vercel.sh/v1/chat/completions`, `Authorization: Bearer $AI_GATEWAY_API_KEY`, model from `VEND_MODEL` defaulting to `stealth/cat-jam` (free; verified working by the coordinator). The key is already in `.env`. Ask for JSON output and parse defensively (strip code fences).
- `src/packager/runner-local.js` and `src/packager/runner-createos.js` — same interface: `create()`, `writeFile(path, content)`, `exec(cmd) -> {exitCode, stdout, stderr}`, `startServer(cmd, port) -> url`, `destroy()`. CreateOS runner uses the installed `@nodeops-createos/sandbox` SDK (read its types in `node_modules`, do not guess): shape `s-1vcpu-1gb`, rootfs with Python + matplotlib (e.g. `devbox:1` — verify), **ingress enabled** (preview URL for port 8080), **egress allowlist empty/locked** after setup, auto-pause on if supported. Local runner uses a temp dir + `python3` subprocesses (for tests and offline dev).
- `src/packager/index.js` — `packageTool({name, description, code, priceUsd}, {onLog, runner})`:
  1. LLM writes `server.py` (Python **stdlib only** `http.server`: `POST /run` JSON → call the tool → `{ok, result|error}`; `GET /health`) and `test_tool.py` (stdlib `unittest`, 3–5 cases incl. bad input), plus a JSON `inputSchema`.
  2. Run tests in the runner. On failure, send the stderr back to the LLM, get fixed files (the LLM may fix the seller's tool code too), retry. **Cap: 4 attempts**, then return `testsPassed:false`.
  3. Green → start the server, wait for `/health`, return `{upstreamUrl, sandboxId, inputSchema, testsPassed, attempts}`.
  4. `onLog` gets short human-readable lines for every step (they are shown live on the seller page): "writing wrapper", "running 4 tests", "test failed: …", "fixing", "✅ 4/4 passed", "network locked", "live at …".
- `scripts/package.js` — CLI: `node scripts/package.js examples/chart_tool.py --price 0.50 [--local]` prints the log and the final URL.
- Tests `test/packager*.test.js` (`node --test`): the write→test→fix loop with a **stubbed LLM** and the local runner (first reply buggy, second fixed → passes on attempt 2; always-broken → stops at cap). Skip tests that need python3/matplotlib cleanly if missing.

## Facts already settled (by the coordinator)
- `.env` already has `AI_GATEWAY_API_KEY`, `CREATEOS_SANDBOX_API_KEY` (verified: lists sandboxes, HTTP 200), `STRIPE_SECRET_KEY` (sk_test). Load it with `process.loadEnvFile?.()` or `node --env-file=.env`. No OWNER NEEDED for keys.
- CreateOS is on the **free plan: 1 sandbox at a time**. Design for it: build, test and serve in the **same** sandbox; `scripts/package.js` must destroy any previous Vend sandbox first (or reuse it) and always destroy on failure. Never leave orphaned sandboxes.

## Not in this phase
Payments, the gateway, `src/registry.js`/`src/events.js` (do not import them — just return the result), the seller web page, `src/server.js`, deploy.

## Done when
1. `npm test` passes (packager tests included). If `package.json` has no test script yet, set `"test": "node --test"`.
2. `node scripts/package.js examples/broken_tool.py --local` with a real LLM key: log shows a failing test, a fix, then all green and a local URL; `curl -X POST <url>/run -d '<sample json>'` returns `{ok:true, result:<base64 png>}`.
3. Same without `--local`, with `CREATEOS_SANDBOX_API_KEY`: a public preview URL that answers `/health` from your laptop, and an outbound request from inside the sandbox (e.g. `curl https://example.com`) fails after lock.
4. Missing keys → a clear error naming the env var, and an `OWNER NEEDED` line in your hand-off — never a crash with a stack trace.
5. No secret in git. All work pushed to `build`.

## Sources of truth
CONTRACT.md list. Key: `https://createos.sh/docs/llms.txt` (sandbox SDK, ingress, egress, pause), `node_modules/@nodeops-createos/sandbox`, OpenRouter and Anthropic API docs. Look it up, never invent an API, model id, or flag.

## Gate
`npm test` — must pass before every push.

## Branch / OWNER NEEDED
Per CONTRACT.md. Branch `build`, `git pull --rebase origin build` before push. Likely OWNER NEEDED: `CREATEOS_SANDBOX_API_KEY` (comes via Stripe Projects or the CreateOS dashboard) and an LLM key (`OPENROUTER_API_KEY` via Stripe Projects, or `ANTHROPIC_API_KEY`). Build and test everything you can with the local runner + stubbed LLM meanwhile.

## Amendment A (coordinator, after plan fact-check) — overrides anything above
1. **Egress lock bug:** an empty allowlist means **open** egress (SDK `setEgress(null|[])` = allow all; createos.sh/docs/Sandbox/REST-API/Egress.md). Lock = a **non-empty** dummy rule, e.g. `["192.0.2.1:9"]`, set **at create time** (check the SDK's create options) so LLM-written tests never run with the network open. devbox:1 already has matplotlib — no pip installs needed.
2. **Free plan caps: 1 concurrent sandbox (paused ones count) and only ~10 creations per rolling 24h — 1 is already used.** Do all dev loops with the local runner. Real-sandbox runs: reuse one long-lived sandbox (`--reuse <id>`), create a new one only when unavoidable. Never leave orphans.
3. **Auto-pause off** — ingress traffic does not count as activity, so a paused tool would break the demo.
4. Demo "BLOCKED" moment: the example tool includes an optional code path that tries `urllib.request.urlopen("https://example.com")`; with egress locked it fails and the wrapper returns `{ok:false, error:"network blocked: ..."}`. Keep the error string prefix `network blocked:` — the gateway keys on it.
5. Don't polish beyond the Done-when list. Ship, push, hand off.
