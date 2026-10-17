# Phase 5 — "Try a paid call" for judges (server side)

Problem (coordinator review): a judge can't run `scripts/buyer.js` against the live site with their own Stripe key — the test-helper SPT is granted to the **seller's** account, so it only works with Vend's key. Judges need a one-click way to watch 402 → pay → result on the live site.

You own `src/server.js` (+ a new `src/demo-buyer.js` if useful) and `test/server*.test.js`, `README.md`. **Not** `public/**` (the craft-pass builder adds the button; you define the API it calls) and not `src/gateway/**` unless strictly needed (then say so).

## Build
- `POST /api/try/:toolId` (no admin token): the server acts as a demo buyer against **its own** gateway, reusing the logic in `scripts/buyer.js` (import/share it — don't fork it): call `/t/:id` with the tool's example input (or a JSON body ≤ 4 KB if given), receive the 402, create a test SPT with the server's `STRIPE_SECRET_KEY` (test mode only — refuse if the key isn't `sk_test_`), pay, retry.
- Response JSON (for the UI to animate, in order): `{ steps: [ {t:'request'}, {t:'402', amountUsd, challengeId}, {t:'paid', paymentIntent}, {t:'result', ok, result?, error?, refunded?, blocked?} ], receipt }`. Keep `result` (base64 PNG) as-is so the page can show the chart.
- Also accept `{"evil": true}` → uses the tool's network-calling input (`source_url` pointing at an outside host) so judges can trigger **BLOCKED → refunded** themselves.
- Abuse limits: per-IP 1 request / 10 s and a global 30 / hour (in memory), 30 s timeout, 429 with a friendly message. Calls flow through the normal gateway so they show up on `/sell` and in `/api/stats` like any other call.
- Tests: refuses without `sk_test_`, rate-limit returns 429, step shape (stub the payment client).
- README: under "Try it", put the button first ("open the site → Try a paid call"), keep the CLI path second and say it needs the seller's test key (i.e. it's for cloning and self-hosting).

## Done when
1. `npm test` passes.
2. Locally against a running server with a registered tool: `curl -X POST localhost:PORT/api/try/<id>` returns the 4 steps with a real `pi_…` and a chart; `-d '{"evil":true}'` returns blocked + refunded; a second call within 10 s gets 429.
3. Pushed: `git pull --rebase --autostash origin build && git push origin HEAD:build`. Tell the coordinator; the coordinator deploys and wires the UI builder.
Deadline: **04:30 IST**.
