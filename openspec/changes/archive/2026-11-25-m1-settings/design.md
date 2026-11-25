# Design

## Context

`server/core/plugins.ts` `host.plugins()` → `PluginRecord {id, dir, version, status: 'loaded'|'failed', error?}`. `server/core/sdk.ts` `SDK_VERSION`; `src/ext/sdk.ts` `WEB_SDK_VERSION`; `server/store.ts` `RENDERER`; `db.latestRev()` and table `config_revs(rev, at, source, yaml)`; demo is `process.env.SITEGARDEN_DEMO === '1'` (see `/api/status` `demo`). Auth in `server/auth.ts`: `who()` checks `Authorization: Bearer` against secret `SITEGARDEN_API_TOKEN` (constant-time `same`) and returns `'api'`; sessions are stored as SHA-256 hashes (`sha(token)`). `src/ui/Debug.tsx` renders the `mock +` tab in `src/App.tsx`. `src/App.tsx` reads `location.search` for `?select`, `?panel`, `?still`. The server serves `index.html` for unknown paths (SPA fallback).

## Decisions

### D1. Route and shell
`App.tsx` keeps a `settings` boolean from `location.pathname === '/settings'`, updated on `popstate`. Opening: `history.pushState(null, '', '/settings')`; closing (×, Esc): `history.pushState(null, '', '/' + location.search)` — or `history.back()` when the page was opened in-app. The map stays mounted and hidden behind it (`<Settings>` is a fixed full-screen `section` with the sheet look of `Panels.tsx`: reuse `.sheet`/`.mono-label`/`.irow`/`.muted` classes and add only layout CSS needed for a wider page). No router dependency. Hero menu gets a last item "Settings →" after the tab buttons.

### D2. `GET /api/settings`
```json
{ "version": "0.11.0", "sdk": "1.3.0", "renderer": "<RENDERER>", "demo": false,
  "config": { "rev": 7, "at": 1764000000000, "source": "ui" } | null,
  "plugins": [{ "id": "essentials", "version": "1.0.0", "status": "loaded" }] }
```
`version` from the root `package.json` (same source as `/api/health`). Plugins map only `id, version, status`; never `error` or `dir` (unit test asserts no `error` key even for a failed plugin). The page adds `WEB_SDK_VERSION` itself. Behind the same auth as every other route.

### D3. Token storage
Migration v6: `CREATE TABLE api_tokens(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, created INTEGER NOT NULL, last_used INTEGER)`. Helpers in `db.ts`: `addToken(name, hash, at)`, `tokens()` (id, name, created, last_used — never hash), `tokenByHash(hash)`, `touchToken(id, at)`, `removeToken(id)`. Revoke deletes the row. Token value: `sg_` + 32 random bytes base64url (`crypto.randomBytes`). Name: trimmed, 1–64 chars, else 400.

### D4. Bearer check
In `who()`: if the bearer equals the env token (constant-time) → `'api'`; else look up `tokenByHash(sha256(value))` → `'token:<name>'` and `touchToken` when `last_used` is null or older than 60 s; else 401 as today. Revoked (deleted) tokens fail immediately. Works in both auth modes; with auth off tokens are still listed but not needed.

### D5. Token routes
`GET /api/tokens` → list; `POST /api/tokens {name}` → `{ id, name, token }` (the only time the value leaves the server); `DELETE /api/tokens/:id` → 204 / 404. Manage rule: allowed when auth is off, for a signed-in user (session or tailscale login), or for the env token (`'api'`); a generated token (`'token:*'`) gets 403. Expose the identity from the auth middleware via `c.set('user', …)` if it isn't already, and check it in a small guard. Log `[auth] token "<name>" created|revoked by <user>` (never the value).

### D6. Page sections
1. **About**: a definition grid (reuse `.b-grid` from `Boring.tsx` styles if suitable) with the fields of D2 plus web SDK; config line `rev 7 · 3 min ago · ui`.
2. **Plugins**: one row per plugin: id, version, `loaded` or `failed to load`.
3. **API tokens**: name input + "Generate" button; after generating, a one-time box with the token, a "Copy" button (`navigator.clipboard.writeText`, toast "Copied") and the note "Shown once. Store it now."; list rows: name, created, last used (or "never"), "Revoke" button (no `confirm()` dialog: the button turns into "Revoke? yes / no" inline). A 403 on list shows "Sign in to manage tokens".
4. **Dev tools**: the four buttons from `Debug.tsx` with the same handlers; deploy/webhook only when demo is on. Delete `Debug.tsx` and its CSS/`App.tsx` usage. Plant/remove act on the mounted map, so they keep working.

## Testing

Unit: `/api/settings` shape and no `error` for a failed plugin; token create/list/revoke; bearer with a generated token works, after revoke 401; generated token cannot manage tokens (403), env token can; `last_used` updates; db migration on an existing v5 db. E2E: open Settings from the hero menu, see the app version and `essentials loaded`; generate a token, use it via `request` with `Authorization: Bearer` on `/api/status` (auth server project) → 200, revoke → 401. Existing e2e stay green.

## Risks / Trade-offs

- [Token value only shown once] → by design; lost token = revoke and generate.
- [No scopes or expiry] → every token has full access like the env token; scopes come with M6.

## Migration Plan

DB v6 additive. Version 0.11.0, CHANGELOG, README tokens section, `docs/plan.md` item 9 done.
