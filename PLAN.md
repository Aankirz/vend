# Vend — Build Plan

> Make your agent tool pay for itself.
> Paste a tool → ~90s later it is a verified, sandboxed, pay-per-call service any AI agent can buy with Stripe. Callers pay only if it works.

Hackathon: CreateOS × Stripe Projects, 2026-10-17. Submissions lock 5:30 PM PT (6:00 AM IST).

---

## 1. The parts (plain words)

| # | Part | What it does | Built with |
|---|------|--------------|------------|
| 1 | **Seller page** | Web page: paste tool code, set price, click "Vend it". Shows the live build log and earnings. | One HTML page served by the Vend server |
| 2 | **Packaging agent** | AI that wraps the tool in a tiny web server, writes tests, runs them in a sandbox, reads errors, fixes its own code, repeats until green. | Claude (via OpenRouter, provisioned with Stripe Projects) + CreateOS Sandbox SDK |
| 3 | **Tool sandbox** | Sealed cloud computer that runs the seller's tool at a public URL. Network locked, sleeps when idle. | CreateOS: ingress (live URL), egress allowlist, pause/resume |
| 4 | **Vend gateway (toll gate)** | Sits in front of every tool. No payment → replies `402 pay $0.50`. Valid payment → forwards the call to the tool. Tool fails → automatic refund. | Node + `mppx` (Stripe MPP) + Stripe Refunds API (+ Connect split) |
| 5 | **Buyer** | A normal Claude Code with Stripe's Link agent wallet. Finds the tool, pays, uses the result. | Claude Code + Link agent wallet (test mode) |
| 6 | **Stack setup** | All services provisioned from the terminal; keys land in `.env`. | Stripe Projects (`createos/project`, OpenRouter) |

Secrets never leave the Vend gateway. The seller's sandbox never sees a Stripe key.

## 2. End-to-end flow

```
SELLER                          VEND                                   CREATEOS
paste tool + price ──▶ packaging agent ──writes wrapper+tests──▶ sandbox: run tests
                         ▲      │                                    │
                         └─fix──┴──────── errors ◀──────────────────┘
                                │ all green → start server, lock network
                                ▼
                         ✅ verified, live at /t/<tool>  ◀── preview URL
BUYER (Claude Code)
call /t/<tool> ───────▶ gateway: 402 "pay $0.50"
pay via Link wallet ──▶ gateway: verify receipt ──forward──▶ tool sandbox
                         ◀── result ───────────────────────────┘
                         ok    → seller +$0.45, Vend +$0.05 (Connect)
                         fail  → auto-refund $0.50
dashboard updates live (build log, calls, earnings, BLOCKED, refunds)
```

## 3. Build order and timeline (IST)

| Time | Step | Done when |
|------|------|-----------|
| 01:15–01:45 | **Risk spikes.** (a) `stripe projects init` + add CreateOS + OpenRouter. (b) Sandbox with ingress gets a public URL. (c) `mppx` 402 → pay → receipt works on this Stripe account in test mode. (d) Link wallet can pay in test mode. | Each item ✅ or swapped for its fallback |
| 01:45–03:15 | Packaging agent: write → test in sandbox → fix loop → serve → verified | Paste chart tool → live URL in < 2 min |
| 03:15–04:15 | Gateway: 402, verify, forward, refund on failure | Buyer gets a chart, Stripe shows payment |
| 04:15–04:50 | Seller page: build log, earnings, BLOCKED + refund events | Whole demo runs on one screen |
| 04:50–05:20 | README, demo video (you on camera) | Video uploaded |
| 05:20–05:50 | Public post, form, leaderboard (code `CreateOS-2026`) | Submitted before 06:00 |

## 4. Fallbacks (decided now, no debate later)

| If this fails | We do this |
|---------------|------------|
| MPP / SPT not available on this Stripe account | Gateway returns 402 with a Stripe Payment Link; buyer pays; same story |
| Link wallet not usable by Claude Code | A 40-line buyer script using the `mppx` client |
| Connect not available (India) | Ledger in the dashboard shows the 90/10 split; Connect named as next step |
| Free plan = 1 sandbox only | Build and serve in the same sandbox, or $10 Beginner plan (your call) |
| Ingress URL flaky | Gateway calls the tool via sandbox `exec` instead of HTTP |

## 5. Demo script (2–3 min)

1. **You on camera (20s):** the problem. Free agent tools get hammered, authors pay the bills, agents can't use checkout pages.
2. **Stripe Projects (15s):** the setup commands.
3. **Seller (45s):** paste chart tool, $0.50, Vend it → test fails → agent fixes → ✅ verified → live.
4. **Buyer (35s):** plain Claude Code: "chart my revenue" → 402 → pays → chart appears → earnings tick.
5. **Trust (20s):** malicious call → BLOCKED. Bad input → failed → refunded.
6. **You on camera (20s):** every Vend user is a new Stripe merchant and a new CreateOS workload. Supply side of agent commerce.

## 6. Out of scope (said in the pitch as roadmap)

Fresh forked sandbox per call, public tool directory, Vend tools in the Stripe Projects catalog, languages other than Python.
