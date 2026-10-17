# Submission kit

Live: **https://production-vend-gateway.tyzo.nodeops.app** · Repo: https://github.com/Aankirz/vend
Deadline: form + leaderboard before **06:00 IST** (hackathon page says demo 6:00 PM PT = 06:30 IST; we aim earlier).

## 1. Demo video (2–3 min, you on camera at start and end)

Before recording: open `/sell` at 1440×900, have the admin token ready (`grep VEND_ADMIN_TOKEN ~/Desktop/vend/.env`), open a terminal in `~/Desktop/vend`, and open the Stripe test dashboard → Payments.

| Time | Screen | Say (roughly) |
|---|---|---|
| 0:00–0:20 | **You on camera** | "Agents can use thousands of tools, but the people who build them pay the bills and get nothing. Agents can't fill a checkout page. Vend fixes that: paste a tool, and any AI agent can pay for it per call." |
| 0:20–0:35 | Terminal: `stripe projects status` | "The whole stack came from Stripe Projects — CreateOS for sandboxes and hosting, keys straight into .env." |
| 0:35–1:20 | `/sell`: Load example → name `chart` → $0.50 → token → **Vend it** | "I paste a chart tool. Vend's agent spins up a CreateOS sandbox, **locks its network**, writes a server and tests… a test fails — the tool returns bytes, not text — the agent reads the error, fixes it, 5 of 5 green, and it's live." |
| 1:20–1:55 | Terminal: Claude Code (or `node scripts/buyer.js <url>/t/<id> '{…revenue…}'`) | "Now a plain AI agent calls it. It gets **HTTP 402: pay $0.50**, pays with a Stripe payment token, retries, gets the chart." Show earnings tick on `/sell` and the payment in the Stripe dashboard. "Seller keeps 90%." |
| 1:55–2:20 | Buyer call with `"source_url":"https://evil.example.com"` | "What if a tool tries to phone home? The sandbox network is locked — **BLOCKED** — and the buyer is refunded automatically. Callers pay only when it works." |
| 2:20–2:40 | **You on camera** | "Every Vend seller is a new Stripe merchant and a new CreateOS workload. Vend is the supply side of agent commerce." |

## 2. Launch post (X / LinkedIn) — edit freely

> Built **Vend** at the @createosai × @stripe Projects hackathon 🧃
>
> Paste a Python tool → an agent wraps it, tests it in a network-locked CreateOS sandbox, fixes what breaks → it's live as a pay-per-call API any AI agent can buy over HTTP 402 with Stripe.
>
> Seller keeps 90%. Failed or blocked calls refund automatically.
>
> Stack set up entirely with Stripe Projects. Try it: https://production-vend-gateway.tyzo.nodeops.app
> Code: https://github.com/Aankirz/vend
> #StripeProjects #CreateOS #agents

**Posted on X (05:08 IST):** https://x.com/aankirzz7/status/2111601475919163569

## 3. Checklist (you)
- [ ] Record + upload video (YouTube unlisted / Loom); paste link here and in README.
- [x] Post on X (done). LinkedIn: only when the owner says so.
- [x] Leaderboard: submitted as "vend" (code createos-2026, stack https://projects.dev/s#v1:createos~project). Vote link: https://projects.dev/vote/vend
- [ ] Submission form (link in Discord #announcements): team details, repo, live URL, video, post link.
- [ ] After the hackathon: roll the Stripe test key (it was pasted in chat once).
