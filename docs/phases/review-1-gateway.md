# Review round 1 — Phase 1 gateway (coordinator)

Verified by coordinator: `npm test` 14 pass / 1 skipped; no keys in git history; contract interfaces match; 402 challenge correct for $0.50.

## Fix these (numbered; reply per number in your hand-off)
1. **Crash:** `src/gateway/index.js:101-102` — `decodeURIComponent` + `getTool` run outside try; `POST /t/%E0%A4%A` kills the process (unhandled rejection). Wrap the whole handler body in try/catch → 404/500.
2. **Charged, never refunded:** `index.js:52` passes a non-string `error` through; `index.js:60` `error.startsWith` throws after the charge → 500, no refund. Coerce: `typeof body?.error === 'string' ? body.error.slice(0,200) : 'tool failed'`.
3. **Anything throwing after the charge must still refund:** wrap the post-charge section (emit, forward, response) so any exception goes to the refund path.
4. **Prototype lookup:** `src/registry.js:48` — use `Object.hasOwn(tools, id) ? tools[id] : undefined` (`/t/__proto__`, `/t/constructor` → 500 today).
5. **SSRF via redirect:** upstream fetch `index.js:44` follows redirects — set `redirect: 'manual'`, treat 3xx as failure. Validate `upstreamUrl` scheme is http(s) at `registerTool`.
6. **Unbounded upstream body:** cap upstream response at ~1 MB (read with a byte limit). Request body overflow: `req.destroy()`; set `server.requestTimeout` ~10s in dev.js.
7. **Registry write atomicity:** write `tools.json` via temp file + `renameSync` (packager and gateway share it).
8. **Price validation:** `registerTool` requires `Number.isFinite(price)`, ≥ 0.50, whole cents.
9. Refund failure emits `call.failed` twice — emit `call.refund_failed` instead.
10. **Done-when #3, #4, #5 not evidenced:** run `VEND_LIVE_STRIPE=1 npm test` (live **test mode**), `node scripts/buyer.js` against dev gateway, a forced upstream failure → real refund visible in `stripe refunds list --limit 1`, and `npx mppx@latest validate`. Paste outputs in your hand-off. Confirm `receipt.reference` is a real `pi_…`.

Add a regression test for 1, 2, 4. Gate `npm test`. Push `git push origin HEAD:build` (coordinator mirrors to main).
