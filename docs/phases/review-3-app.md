# Review round 1 — Phase 3 app server + README (coordinator)

Verified: `npm test` passes; no `innerHTML` with data; 409 single-build lock correct; admin compare is timing-safe; deploy steps documented (owner is running them).

Fix (only `src/server.js`, `README.md`, `.env.example`, deploy files):
1. **CRITICAL — seller code on the host:** `server.js:144-147` silently falls back to the local runner when `CREATEOS_SANDBOX_API_KEY` is missing. Use local only when `VEND_RUNNER==='local'` explicitly; otherwise require the key and refuse builds with a clear error.
2. **Admin fails open:** `server.js:139` — when `VEND_ADMIN_TOKEN` is unset and `VEND_RUNNER!=='local'`, refuse POST `/api/tools` (403 "builds disabled: set VEND_ADMIN_TOKEN").
3. **Defence in depth on the leaked URL:** in the `onLog` → `emit('build.log')` path, strip URLs: `line.replace(/https?:\/\/\S+/g, '[hidden]')`. README line ~70 must stay true.
4. **`/api/tools` 500s on a bad LLM schema:** wrap `exampleInput` (`server.js:62-73`) in try/catch → `{}`; in `runBuild` require `Array.isArray(required)` and cap schema size.
5. **Old registry entries for a wiped sandbox:** when a new build succeeds on sandbox X, remove (or mark inactive) older tools with the same `sandboxId` so `/api/tools` never lists dead tools.
6. `/api/stats` + every SSE connect re-read all of `events.jsonl` — cache stats in memory (update on `subscribe`).
7. README: add a Deploy section (the steps in docs/phases/deploy-owner.md), note `VEND_ADMIN_TOKEN` is required for public builds, note one live tool at a time on the free plan, `--reuse` flag.
8. Registry/run: `registerTool` failure after a successful package → release the sandbox (call the runner's `release()`/`destroy()`).

Gate `npm test`; push `git push origin HEAD:build`. Note: `public/**` now belongs to the phase 3b UI builder — don't edit it.
