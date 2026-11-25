# Proposal

## Why

M1 item 9: one plain place to see what is running (versions, config revision, plugins) and to do housekeeping, so the map stops carrying debug controls and later settings work (M6) has a home. Scripts and machines also need their own API tokens instead of sharing the single env token.

## What Changes

- `/settings`: a plain full-screen page over the map (the map stays mounted underneath), opened from the hero menu, closed with × or Esc back to `/`.
- **About:** app version, plugin API (server SDK) and web SDK versions, renderer, config revision with time and source, demo mode.
- **Plugins:** id, version, "loaded" or "failed to load". The failure reason is never sent to the browser; it stays in the server log.
- **Dev tools:** the debug menu's buttons (deploy now, webhook now, plant an estate, remove last estate) move here; the `mock +` tab leaves the map. Deploy and webhook only show in demo mode.
- **API tokens:** generate a named token (shown once, copy button), stored as a SHA-256 hash with created and last-used times, revoke in one click. The env `SITEGARDEN_API_TOKEN` stays as the bootstrap and recovery token. Only a signed-in user or the env token can manage tokens; a generated token cannot.
- Version 0.11.0.

## Capabilities

### New Capabilities
- `settings-page`: the settings page, its API, and generated API tokens.

### Modified Capabilities
- None (the `app-auth` bearer rule gains generated tokens; covered in the new spec).

## Impact

- `server/app.ts` (`GET /api/settings`, token routes), `server/auth.ts` (bearer lookup), `server/core/db.ts` (migration v6 `api_tokens`), `src/settings/Settings.tsx` (new), `src/App.tsx`, `src/ui/Hero.tsx`, `src/ui/Debug.tsx` (removed), CSS, tests, e2e, README, CHANGELOG.
- Out of scope: settings forms, enable/disable plugins, display preferences, token scopes or expiry (M6).
