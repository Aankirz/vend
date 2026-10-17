# Vend — session handoff

Read `PLAN.md` and `docs/vend-plan.html` first. They hold the product, the scope, and the timeline.

## Hackathon facts
- CreateOS × Stripe Projects, Sat 2026-10-17 PT. **Submissions lock 5:30 PM PT = 06:00 IST Oct 18.**
- Must use Stripe Projects AND CreateOS Sandbox. New code only.
- Submit: 2–3 min video (person on camera), public repo + README (no .env), team details, public X/LinkedIn post tagging @createosai / CreateOS, form link (posted in Discord #announcements), and projects.dev/leaderboard with code `CreateOS-2026`.
- Leaderboard needs: `stripe whoami` (account ID), `stripe projects share` (share link), the public repo, and a **deployed URL**.
- User approved spending $10 on the CreateOS Beginner plan.

## Setup state
- Repo github.com/Aankirz/vend (public), working branch `build`. gh active account: Aankirz.
- Installed: Stripe CLI 1.54 + projects plugin 0.50, CreateOS CLI 0.0.31 (`~/.local/bin`).
- npm: mppx, stripe, @nodeops-createos/sandbox.
- Pending: `stripe projects init vend --yes` needs browser approval, then `stripe projects add createos/project`, then the AI provider (OpenRouter) if it's in the catalog.

## Reference code
- Stripe machine-payments sample (MPP server, MCP server, x402): `git clone https://github.com/stripe-samples/machine-payments`
- Docs as markdown: append `.md` to any docs.stripe.com URL; CreateOS index at https://createos.sh/docs/llms.txt
