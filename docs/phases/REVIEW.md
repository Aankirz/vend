# Review queue

Every builder push is reviewed by the coordinator before the next phase starts. A builder's "done" is a claim; these checks are the evidence.

| # | What | When | Status |
|---|------|------|--------|
| 0 | Plan fact-check (MPP on this account, test buyer credential, refunds, CreateOS limits, rules) | done | ✅ amendments sent |
| 1 | Phase 1 gateway: diff read, "Done when" walked item by item, `npm test`, live 402 → pay → receipt in test mode, refund verified in Stripe | on push | ✅ passed round 2 (coordinator ran pay + refund live in test mode) |
| 2 | Phase 2 packager: diff read, "Done when" walked, `npm test`, real sandbox gets a public URL, egress lock verified, no orphaned sandboxes | on push | queued |
| 3 | Independent agents per phase: code-reviewer + security-reviewer (payments, untrusted seller code, secrets) — prompts state constraints, not a preferred fix | on push | queued |
| 4 | Phase 3 app: landing + seller page, deployed URL works from outside, README, GTM section | on push | queued |
| 5 | Pre-submit: secrets scan of full history, hackathon checklist, demo run-through end to end | before 05:20 IST | queued |

Gaps found go back to the builder as a numbered list. Third failed round on one phase → escalate to the owner.
