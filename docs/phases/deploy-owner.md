# Deploy to CreateOS — owner action needed

Phase 3 Done-when #4 (public HTTPS URL) is blocked on one denied command. Everything else in phase 3 is done and pushed to `build`.

## What was denied (do not retry from an agent session)

Command (run from the repo root):

```bash
export CREATEOS_PROJECT_API_KEY="$(grep '^CREATEOS_PROJECT_API_KEY=' .env | cut -d= -f2-)" && export PATH="$HOME/.local/bin:$PATH" && createos projects add --name "Vend" --unique-name vend-gateway --type upload --runtime node:20 --port 8080 --install-command "npm install --omit=dev" --build-command "node --version" --run-command "node src/server.js" < /dev/null
```

Error text, from Claude Code's permission system (not from CreateOS):

> Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Create Public Surface].

Nothing was created on CreateOS: `createos projects list` returned `null` before this, and the command never ran.

Earlier in the session, `git push origin HEAD:build HEAD:main` was also denied, with reason `[CI Bypass]`. That one is settled: agents push to `build` only and the coordinator mirrors to `main`.

## Exact commands for the owner

Run from `~/Desktop/vend` (the `createos` CLI is at `~/.local/bin/createos`, v0.0.31).

**Auth needs no browser login.** The Stripe Projects key authenticates the CLI; `createos whoami` returned the account with it.

```bash
cd ~/Desktop/vend
export PATH="$HOME/.local/bin:$PATH"
export CREATEOS_PROJECT_API_KEY="$(grep '^CREATEOS_PROJECT_API_KEY=' .env | cut -d= -f2-)"
createos whoami
```

**1. Create the project.** This links the directory by writing `.createos.json`, which the CLI also adds to `.gitignore`.

```bash
createos projects add --name "Vend" --unique-name vend-gateway --type upload --runtime node:20 \
  --port 8080 --install-command "npm install --omit=dev" --build-command "node --version" \
  --run-command "node src/server.js"
```

**2. Set env vars from a gitignored file, then delete it.** `.env.*` is excluded from the upload and from git.

```bash
grep -E '^(STRIPE_SECRET_KEY|AI_GATEWAY_API_KEY|CREATEOS_SANDBOX_API_KEY)=' .env > .env.createos
echo "VEND_ADMIN_TOKEN=$(openssl rand -hex 16)" >> .env.createos   # note this token: /sell needs it
createos env push --file .env.createos --force
rm .env.createos
```

Optional:

```bash
createos env set VEND_PUBLIC_URL=https://<deployed-url>      # cleaner buyer snippets
createos env set VEND_SEED_TOOL_URL=<live sandbox tool URL>  # registers demo tool "chart" at startup
```

**3. Deploy.** This prints `Live at: https://…`.

```bash
createos deploy
```

**4. Verify from outside.**

```bash
curl -s https://<url>/healthz                                  # {"ok":true}
curl -s https://<url>/api/tools                                # JSON array
curl -i -X POST https://<url>/t/<id> -H 'content-type: application/json' -d '{}'   # 402 + WWW-Authenticate: Payment
```

Status and logs: `createos status`, `createos deployments logs -f`, `createos deployments build-logs`.

## Unverified points (fallbacks)

- **Runtime without a framework.** If `--runtime node:20` is rejected without a `--framework`, use the repo's `Dockerfile` instead: same `projects add` with `--runtime dockerfile --port 8080` (drop the install/build/run flags). The image was built and smoke-tested locally: `/healthz` OK, `/` 200, `/api/tools` answers, no `.env` in the image (`.dockerignore`).
- **Env changes and redeploys.** It is unknown whether `env push` after a deploy triggers a redeploy. If the vars are missing at runtime, run `createos deployments retrigger`.
- **Platform port.** The platform should set `PORT` from `--port 8080`; the server also defaults to 8080.
- **Data does not survive redeploys.** `data/` is gitignored and not uploaded, so the deploy starts with an empty registry. Seed with `VEND_SEED_TOOL_URL` or vend a tool on `/sell` with the admin token.

## The alternative

Add a Claude Code permission rule that allows `createos` commands. The agent can then run steps 1–4 itself.
