# Shared contract (all phases)

Read `PLAN.md` first. This file fixes the seams between builders so they can work in parallel.

## Runtime
- Node 20+, ESM (`"type": "module"`), plain JavaScript. No TypeScript, no build step, no frontend framework.
- Tests: Node's built-in runner, `node --test`. Gate: `npm test` must pass.
- One process in the end: `node src/server.js` (phase 3 wires it). Each phase must also be runnable/testable on its own.
- Runtime data goes in `data/` (gitignored). Secrets only from `process.env` (loaded from `.env`, never committed). `.env.example` lists names with **blank values**.

## File ownership
| Owner | Files |
|---|---|
| Phase 1 — gateway | `src/gateway/**`, `src/registry.js`, `src/events.js`, `test/gateway*.test.js`, `scripts/buyer.js` |
| Phase 2 — packager | `src/packager/**`, `examples/**`, `test/packager*.test.js` |
| Phase 3 — app | `src/server.js`, `public/**`, `README.md`, deploy config |
| Shared (append only, rebase carefully) | `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `.claude/CHANGELOG.md` |

Do not edit files owned by another phase. If you need a change there, say so in your hand-off.

## Interfaces
```js
// src/registry.js (phase 1) — JSON file at data/tools.json
registerTool({ name, description, priceUsd, upstreamUrl, sandboxId, inputSchema }) // -> tool {id, ...}
getTool(id)   // -> tool | undefined
listTools()   // -> tool[]

// src/events.js (phase 1) — in-memory bus + append to data/events.jsonl
emit(type, data)     // type: 'build.log' | 'build.done' | 'call.paid' | 'call.ok' | 'call.failed' | 'call.refunded' | 'call.blocked'
subscribe(fn)        // -> unsubscribe()
recent(n)            // -> last n events

// src/gateway/index.js (phase 1)
createGateway({ stripeSecretKey, ... }) // -> (req, res) handler for POST /t/:id ; mountable in node:http

// src/packager/index.js (phase 2)
packageTool({ name, description, code, priceUsd }, { onLog }) // -> { upstreamUrl, sandboxId, inputSchema, testsPassed, attempts }
```
A tool upstream is an HTTP service: `POST /run` with a JSON body → JSON result (`{ ok: true, result }` or `{ ok: false, error }`), and `GET /health` → 200.

## Rules for every builder
- **Look it up, never invent an API, model id, or flag.** Sources: `https://docs.stripe.com/llms.txt` (append `.md` to any docs URL), `https://createos.sh/docs/llms.txt`, the installed packages in `node_modules/` (read their `.d.ts`/README), and the Stripe sample at `/private/tmp/claude-501/-Users-ankitkiran-Desktop/1188bc9f-bb76-451b-8ca0-9c8a3c29b44a/scratchpad/refs/machine-payments` (or `git clone https://github.com/stripe-samples/machine-payments`).
- Stripe: **test mode only** (`sk_test_…`). Never live keys, never real money.
- Keep it small: functions < 40 lines, files < 400 lines, no speculative abstractions.
- **Branch policy (owner decision for the hackathon):** commits go straight to `main`. Work on the current checkout, then `git pull --rebase origin build && git push origin HEAD:build HEAD:main` (both, every time; the coordinator also mirrors build → main). Conventional commits (`feat:`, `fix:`, `test:`…). No `Co-Authored-By`, no session links. Commit + push after each working slice, not only at the end.
- Append an entry to `.claude/CHANGELOG.md` with each commit (`## YYYY-MM-DD — title` + bullet).
- **OWNER NEEDED protocol:** before anything only a human can do (a credential/API key you do not have, a browser login, a paid action, a permission prompt that got denied), print a line `OWNER NEEDED: <what> — <exact steps>` and continue with everything else (mock the missing piece behind the real interface). Never work around a denied permission.
- Hand-off: when done, print a report: what was built, each "Done when" item with how you verified it, what is mocked, open OWNER NEEDED items.
