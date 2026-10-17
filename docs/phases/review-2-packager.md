# Review round 1 — Phase 2 packager (coordinator)

Verified by coordinator: `npm test` 26/27 (1 skipped); real sandbox serves the chart tool at a public URL (health 200, PNG returned); egress rule `192.0.2.1:9` set at create; 1 running sandbox, 2 creations used today.

Fix (only `src/packager/**`, `examples/**`, `scripts/package.js`):
1. **Payment bypass:** `src/packager/index.js:135` logs `live at <sandbox URL>` — that line reaches the public SSE stream, so anyone can call the tool without paying. Log `live ✅` without the URL.
2. **Egress lock must be enforced:** `index.js:70` ignores `lockNetwork()`'s result. For non-local runners, throw `egress lock not verified` if it returns false (do not go live with open network).
3. **Don't destroy a reused sandbox on failure** (`index.js:129`, `:138`): add `release()` to the CreateOS runner (kill server + wipe workdir, keep the VM) and use it on failure paths; quota is ~10 creations/day.
4. **Orphan on setup failure:** `runner.create()` sits outside the try (`index.js:125`) — destroy/release in the catch.
5. **Local runner env:** `runner-local.js:37` passes the full `process.env` (Stripe/AI/CreateOS keys) to seller code. Give children `PATH` + `PYTHONDONTWRITEBYTECODE` only.
6. **Shell quoting:** `index.js:65,67` interpolate requirements unquoted; single-quote each, or allow exact names only.
7. `llm.js`: set `max_tokens`.
8. **Evidence for Done-when #2/#3:** paste the log of one real broken_tool run (fail → fix → green → network locked) and the output of an in-sandbox `curl https://example.com` failing after lock. Reuse the running sandbox — do not create a new one.

Gate `npm test`; push `git push origin HEAD:build`.
