# Design

## Context

`server/app.ts` is a Hono app started by `server/index.ts` (`serve({ fetch, port })`, all interfaces). Vite serves the web app in dev and proxies `/api` and `/a/` (`vite.config.ts`). Config changes go through `canEditConfig` in `server/config.ts`, which today locks them when `auth.enabled` is true, and `authIssue` rejects `auth.enabled: true` (`auth.provider` stub). Secrets come from env or `_FILE` (`server/core/secrets.ts`). Data lives in `SITEGARDEN_DATA` (SQLite + artifacts). CI (`.github/workflows/pr.yml`): lint, test, build, version check, Node 22. `playwright-core` is a dev dependency (used by `scripts/perf.ts` with system Chrome). The security model is `docs/security-model.md` §1–2.

## Goals / Non-Goals

**Goals:** one `docker compose up` behind Tailscale; auth that fails closed; the CLI keeps working against a locked server; e2e pins the main flows. **Non-Goals:** roles, audit log, OIDC, 2FA, registry publishing, Headscale.

## Decisions

### D1. Production serving
- Hono `serveStatic` from `@hono/node-server/serve-static` serves `dist/` (path from `SITEGARDEN_WEB`, default `<repo>/dist`) after the API routes; unknown non-API GET paths fall back to `dist/index.html`. Hashed assets under `/assets/` get `Cache-Control: public, max-age=31536000, immutable`, `index.html` gets `no-cache`.
- `GET /api/health` → `{ ok: true, version }` (version from `package.json`), no auth, for Docker `HEALTHCHECK`.
- `server/index.ts`: `HOST` env (default `127.0.0.1`) passed to `serve({ hostname })`. If `HOST` is not a loopback address and the current config has auth off, or auth is in `tailscale` mode (the header is only trustworthy on loopback behind `tailscale serve`), log an error and exit 1 unless `SITEGARDEN_INSECURE=1`. Rate limiting behind the loopback proxy uses the last `X-Forwarded-For` hop (the one the proxy added).

### D2. Auth config
`auth: z.strictObject({ enabled: boolean default false, mode: enum['tailscale','password'] default 'tailscale', users: array(string) default [] })`.
- `tailscale` mode requires `users` non-empty when enabled (config error on its line otherwise).
- `password` mode: one user named `owner` (`users` ignored), password hash from secret `SITEGARDEN_PASSWORD_HASH`; if the secret is missing while enabled, every login fails and the server logs a warning (fail closed, same as any missing secret).
- Remove `authIssue`'s "not available yet" error and the `auth.provider` stub; `canEditConfig(c)` becomes "the request has a user" (always true when auth is off). Applying a config that turns auth on is allowed; turning it off is allowed only for a signed-in user (it already must be, since apply needs a user when auth is on).

### D3. Request identity (`server/auth.ts`)
One middleware `who(c) → string | null`, set on `c` for every request when auth is on:
1. `Authorization: Bearer <t>` → `api` if `t` equals the secret `SITEGARDEN_API_TOKEN` (constant-time compare, `crypto.timingSafeEqual` on SHA-256 digests). Wrong token → 401, no fallthrough.
2. `tailscale` mode: `Tailscale-User-Login` header in `auth.users` (case-insensitive) → that login. Present but not allowlisted → 403.
3. Session cookie `sg_session` → the session's user (both modes; in tailscale mode only via password login, which is disabled unless `SITEGARDEN_PASSWORD_HASH` is set, for tagged devices).
4. Otherwise unauthenticated: API and `/a/` → 401 JSON; page GETs → 302 to `/login` (password configured) or 401 page (tailscale only).
Open routes: `/login` (GET, POST), `/logout` (POST), `/api/health`, `/assets/*`, favicon. SSE `/api/events` needs a user like any API route.

### D4. Password and sessions
- Hash: `scrypt` from `node:crypto` (N=2^15, r=8, p=1, 16-byte salt, 64-byte key), stored as `scrypt$N$r$p$salt_b64$key_b64`. scrypt instead of Argon2id: built into Node, no native dependency in the image, OWASP-listed. `security-model.md` is updated to say so.
- `pnpm sg hash-password` reads the password from stdin (no echo when a TTY) and prints the hash.
- Sessions table (db user_version 5): `sessions(id_hash TEXT PRIMARY KEY, user TEXT, created INTEGER, expires INTEGER)`. Cookie value is 32 random bytes base64url; only its SHA-256 is stored. Lifetime 30 days, sliding (expires bumped at most once a day). Expired rows deleted by the daily pruner.
- Cookie: `HttpOnly; SameSite=Strict; Path=/; Secure` (Secure omitted only when the request is plain http to localhost, so local e2e works).
- Login page: server-rendered minimal HTML form (no JS bundle), same paper colours as the app via a few inline styles. Wrong password: same page with "Wrong password", status 401.
- Rate limit: per client IP (from `x-forwarded-for` first hop only when the socket is loopback, else the socket address), 5 failures per 15 minutes → 429. In memory (`shortcut:` comment: single process).
- Logout: delete the session row, clear the cookie.

### D5. CLI
`server/sg.ts` sends `Authorization: Bearer $SITEGARDEN_TOKEN` when the env var is set; a 401 prints "server needs a token: set SITEGARDEN_TOKEN" and exits 4.

### D6. Docker
- `Dockerfile`: `node:22-bookworm-slim`, pnpm via corepack. Stage 1 installs all deps and runs `pnpm build`. Stage 2 installs production deps only (`pnpm install --prod --frozen-lockfile`) plus `tsx` (move it to `dependencies`: the server runs TypeScript through tsx), copies `server/`, `plugins/`, `src/gen/` and whatever else `server/` imports from `src/` (check imports), `dist/`, `package.json`, sample `sitegarden.yaml`. Runs as user `node`, `ENV HOST=127.0.0.1 SITEGARDEN_DATA=/data PORT=8787`, `VOLUME /data`, `HEALTHCHECK` curl-free (`node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"`), `CMD ["pnpm","exec","tsx","server/index.ts"]` (or `node --import tsx`), `UV_THREADPOOL_SIZE=16`.
- `.dockerignore`: `node_modules`, `.data`, `.git`, `perf/out`, `web/`, `dist` (rebuilt), `.sitegarden`.
- `docker-compose.yml` as in `docs/security-model.md` §1: `tailscale` service (`tailscale/tailscale:stable`, `TS_AUTHKEY`, `TS_STATE_DIR`, `TS_SERVE_CONFIG=/config/serve.json`, `TS_AUTH_ONCE=true`, `TS_HOSTNAME=sitegarden`, volumes `ts-state`, `./deploy:/config:ro`), `sitegarden` service (`build: .`, `network_mode: service:tailscale`, volume `sg-data:/data`, `./sitegarden.yaml:/app/sitegarden.yaml:ro`, env for secrets via `_FILE`). `deploy/serve.json`: HTTPS 443 → `http://127.0.0.1:8787`, using `${TS_CERT_DOMAIN}`.
- The image is built locally (`docker compose up --build`); publishing to a registry is out of scope.

### D7. E2E
- `@playwright/test` as a dev dependency (pin the version matching `playwright-core`), `playwright.config.ts`, tests in `e2e/`. `webServer` starts `pnpm build` output via `tsx server/index.ts` on a free port with a temp `SITEGARDEN_DATA` and a test config (fixture `e2e/sitegarden.yaml`: two groups, mock plugin, `every: 2s` so statuses move fast).
- Specs: (1) map loads: pins render, status strip shows counts; (2) live status: a node reaches a non-unknown status from the server within 10 s; (3) Check now in the popover sends `/api/refresh` and a newer "last checked" appears; (4) auth: a second server instance with `auth: {enabled: true, mode: password}` and a known hash: `/` redirects to `/login`, wrong password → error, right password → map, `/api/status` without cookie → 401, bearer token works.
- Chromium only, headless, 1 worker, retries 1 in CI.
- CI: new `e2e` job (`pnpm exec playwright install --with-deps chromium`, `pnpm build`, `pnpm e2e`), upload the HTML report on failure; new `docker` job: `docker build .` and run the container, wait for `/api/health` (with `HOST=0.0.0.0 SITEGARDEN_INSECURE=1` inside the job only).
- `pnpm e2e` script. E2E is not added to `pnpm test`.

## Testing

Unit tests (node:test) for: scrypt hash/verify and format parsing; `who()` for each path (bearer ok/wrong, tailscale allowlisted/not/missing, session valid/expired, none); session create/sliding expiry/prune; rate limit; auth config validation (tailscale without users); `canEditConfig` with auth on/off; safe start refusal; static fallback and cache headers; sg token header and 401 message. Plus the e2e suite and the CI docker job.

## Risks / Trade-offs

- [Header trust in tailscale mode] → only safe when the app listens on loopback behind `tailscale serve`; the safe-start rule (D1) and the README say so.
- [tsx at runtime] → small startup cost, no build step for the server; revisit if startup matters.
- [Docker build time in CI] → separate job, runs in parallel.

## Migration Plan

Existing configs keep working (auth off by default). Version 0.9.0, CHANGELOG, README (Docker, auth, tokens), `docs/security-model.md`.
