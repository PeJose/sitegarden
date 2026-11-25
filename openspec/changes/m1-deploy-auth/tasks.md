# Tasks

## 1. Production serving

- [x] 1.1 Static `dist/` with SPA fallback and cache headers, `/api/health`, `HOST` + safe start (D1). Verify: app tests for an asset, a deep link falling back to index.html, cache headers, health; a test for the safe-start refusal and its `SITEGARDEN_INSECURE` override.

## 2. Auth

- [x] 2.1 Auth config schema, drop the "not available" lock, `canEditConfig` by user (D2). Verify: config tests (tailscale without users is an error on its line; `auth.enabled: true` accepted); existing guard tests updated.
- [x] 2.2 `server/auth.ts`: identity middleware, bearer token, tailscale header (D3). Verify: unit tests for every path in D3 and the open routes.
- [x] 2.3 scrypt hashing, sessions table + pruning, login/logout pages, rate limit, `sg hash-password` (D4). Verify: unit tests for hash/verify, session lifecycle, sliding expiry, prune, 429 after 5 failures, cookie flags.
- [x] 2.4 CLI token header and 401 message (D5). Verify: sg test against a locked test server.

## 3. Docker

- [ ] 3.1 `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `deploy/serve.json`, `tsx` to dependencies (D6). Verify: `docker build .` and a container run answering `/api/health` and serving the map locally.

## 4. E2E and CI

- [ ] 4.1 Playwright suite and fixtures (D7). Verify: `pnpm e2e` passes locally, headless.
- [ ] 4.2 PR CI `e2e` and `docker` jobs (D7). Verify: workflow file valid (`actionlint` if available); jobs pass on the PR.

## 5. Close-out

- [ ] 5.1 README (Docker, auth, tokens), `docs/security-model.md` (scrypt), `docs/plan.md` (item 5 done), CHANGELOG 0.9.0, `package.json` 0.9.0. Verify: `pnpm test`, `pnpm build`, lint no errors, version check.
