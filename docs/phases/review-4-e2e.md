# Review — end-to-end run on a real CreateOS sandbox (coordinator, 03:45 IST)

Passed live: build of examples/broken_tool.py → network locked → test failed (bytes vs str) → fixing → 5/5 → live ✅ (no URL in log) → paid call returns chart with Stripe receipt.

Fix (gateway, owner of src/gateway/**):
1. **BLOCKED never fires against real tools.** The LLM-written wrapper returns HTTP 400 with `{"ok":false,"error":"network blocked: ..."}`. `src/gateway/index.js` maps any non-2xx to `upstream HTTP <code>` before reading the body, so the `network blocked:` prefix is lost and `call.blocked` never fires (verified: pi_3URfOVEeATVahPmE154RsPW8 → call.failed "upstream HTTP 400"). Read the (capped) JSON body first; if it has a string `error`, use it (sliced), else fall back to `upstream HTTP <code>`. Add a test: upstream 400 + `network blocked: x` → `call.blocked` + refund.
Gate `npm test`; push `git push origin HEAD:build`. Tell the coordinator when pushed — the coordinator redeploys.
