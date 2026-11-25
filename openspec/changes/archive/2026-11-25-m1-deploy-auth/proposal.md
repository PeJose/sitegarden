# Proposal

## Why

M1 item 5: sitegarden has to run somewhere other than `pnpm dev`, and it has to be locked. Today the server only serves the API (Vite serves the web app in dev), `auth.enabled: true` is rejected because no auth exists, and nothing pins the main flows end to end. The plan's target is one `docker compose up`: the app behind a Tailscale sidecar, tailnet only, with auth on even inside the VPN.

## What Changes

- The server serves the built web app (`dist/`) with the API, listens on `HOST` (default `127.0.0.1`), and refuses to start on a non-loopback address with auth off unless `SITEGARDEN_INSECURE=1`.
- Auth: `auth: { enabled, mode: tailscale | password, users: [...] }`.
  - `tailscale`: trusts the `Tailscale-User-Login` header set by `tailscale serve`, allowlist of logins, fails closed (401) when it is missing.
  - `password`: scrypt hash from the secret `SITEGARDEN_PASSWORD_HASH`, a session cookie (HttpOnly, Secure, SameSite=Strict) stored in SQLite, a plain login page, login rate limiting. `pnpm sg hash-password` prints a hash.
  - API token for the CLI and scripts in both modes: `Authorization: Bearer` checked against the secret `SITEGARDEN_API_TOKEN`; `sg` sends `SITEGARDEN_TOKEN`.
  - With auth on, every route except `/login`, `/api/health` and static assets needs a user. `auth.enabled: true` is accepted from now on.
- `Dockerfile` (multi-stage, non-root, data in a volume) and `docker-compose.yml` with the Tailscale sidecar (`network_mode: service:tailscale`, `serve.json`), README section.
- E2E: Playwright suite against the production build served by the server: map loads, live statuses, Check now, login and 401. Runs in PR CI with a Docker build check.
- Version 0.9.0.

## Capabilities

### New Capabilities
- `app-auth`: modes, sessions, tokens, fail-closed behaviour.
- `deployment`: how the server runs in production and in Docker.
- `e2e-tests`: what the e2e suite pins and where it runs.

### Modified Capabilities
- None (the `garden-config` auth field gains `mode` and `users`; covered in `app-auth`).

## Impact

- Server: `server/app.ts` (static files, auth middleware, login routes, health), new `server/auth.ts`, `server/core/db.ts` (`sessions` table), `server/core/graph.ts` (auth schema), `server/config.ts` (drop the "auth not available" lock), `server/index.ts` (HOST, safe start), `server/sg.ts` (token header, `hash-password`).
- New: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `deploy/serve.json`, `e2e/`, `playwright.config.ts`; `.github/workflows/pr.yml` (e2e + docker build jobs).
- Docs: README (Docker, auth), `docs/security-model.md` (scrypt instead of Argon2id, why), CHANGELOG 0.9.0.
- Out of scope: roles and audit log (M2), OIDC, TOTP/passkeys, publishing the image to a registry, Headscale, settings page (item 9).
