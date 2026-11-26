# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.11.3] - 2026-11-26

### Fixed
- Mobile map: pins, chips, labels and the live layer no longer drift from the map while panning or zooming: one frame owner (`src/engine/frame.ts`) applies the viewport, so the canvas draws and the DOM layers move with the same view in the same frame (before, the DOM moved at once and the canvas a frame later).
- Mobile map: the tile canvas now uses WebGL2 (each tile is uploaded once as a mipmapped texture, a frame is one draw call per tile) instead of 2D `drawImage` scaling; on a 4x throttled phone profile a 1 s pan costs about 250 ms of main thread instead of about 4500 ms, a pinch about 270 ms instead of about 6000 ms. The 2D canvas stays as the fallback when WebGL2 is unavailable or a lost context does not come back.
- The canvas is redrawn in the same task as a resize, so it is never painted blank.

## [0.11.2] - 2026-11-26

### Fixed
- Mobile map: tiles, the whole-map preview and the paper texture are now drawn into one canvas (new `src/engine`, a small 2D map engine) from bitmaps decoded once and kept within a 32 Mpx budget, instead of an `<img>` per tile in one CSS-scaled layer that Android Chrome re-rasterized (flashing) on every pinch and pan. A cell never falls back to a blurrier tile while a sharper one is decoded; labels, pins, chips and the live layer are unchanged. Tiles now appear without a fade.

## [0.11.1] - 2026-11-25

### Fixed
- Mobile map: the tile level now changes only after the zoom has rested for 200 ms (pinch and wheel no longer mount and fetch every level they pass, nor swap the paper texture mid-gesture); zooming out keeps the sharper tiles already loaded (budget 96, off-screen ones evicted first); screen density counts up to 2, so phones (3) ask for the same, lighter tiles as 2x screens.
- Mobile map: the paper texture now lives in the world layer (world units) instead of being repainted on every pan and zoom frame (raster tasks per 2 s pan on a throttled phone profile 826 to 92, per pinch 716-917 to 365-465); the tile images keep a stable DOM order, so a level change no longer removes and re-inserts dozens of them (36 per zoom-out before, 0 now).
- Mobile map: while the zoom moves, the estate and road labels and the pin and chip size variables follow it in 8% steps (stepped, old-map feel) and snap to the exact size once the zoom has rested for 200 ms; on a throttled phone profile this halves a pinch's main-thread time (about 580 to 330 ms) and its layout and style work.

## [0.11.0] - 2026-11-25

### Added
- Settings page at `/settings` (hero menu, Esc or × to close): app, plugin API, web SDK and renderer versions, config revision with time and source, demo mode, and every plugin as loaded or failed to load (the failure reason stays in the server log). `GET /api/settings`.
- Generated API tokens: `GET/POST/DELETE /api/tokens`, shown once, stored as a SHA-256 hash with created and last-used times, revoked in one click; `SITEGARDEN_API_TOKEN` stays as the bootstrap token. Only a signed-in user or the env token manages them; a generated token gets 403. Database schema v6.

### Changed
- The map's `mock +` debug tab is gone; deploy now, webhook now, plant an estate and remove last estate live under Dev tools in Settings (deploy and webhook only in demo mode).

## [0.10.0] - 2026-11-25

### Added
- Web plugins: the manifest's `web` entry is compiled into the web build for every plugin in the config's `plugins:` (`vite/sitegarden-plugins.ts`), against the host's Preact. A plugin registers only when `/api/config` (now with `plugins`) reports it as loaded; one that throws is isolated. Web SDK `@sitegarden/web-sdk` (`defineWebPlugin`, `useNodes`, `useStatuses`) at 1.0.0.
- `essentials` ships a Checks tab (every node's checks: status, detail, response time, when).
- Plugin API v1 is frozen; the stable surface is listed in `docs/plugins.md`.

### Changed
- The hero menu lists every side-panel tab by its title instead of two fixed buttons; `?panel=` takes a tab name.
- `/api/status` checks and `check.result` events feed the live store, which keeps each node's checks.

## [0.9.1] - 2026-11-25

### Fixed
- A group with no nodes hung the server (and the map) at 100 % CPU on config load. It is now a small empty plot of land, and the street generator refuses a non-finite map area instead of looping forever.

## [0.9.0] - 2026-11-25

### Added
- The server serves the built web app next to the API (`SITEGARDEN_WEB`), with long-lived caching for hashed assets, and `GET /api/health`.
- Auth (`auth: { enabled, mode, users }`): `tailscale` mode trusts the `Tailscale-User-Login` header from `tailscale serve` with an allowlist; `password` mode has a login page, scrypt hashes (`pnpm sg hash-password`), 30-day sessions stored hashed in SQLite and a login rate limit. Both accept `Authorization: Bearer` with `SITEGARDEN_API_TOKEN`; `sg` sends `SITEGARDEN_TOKEN`.
- `Dockerfile` and `docker-compose.yml` with a Tailscale sidecar; the map is reachable over HTTPS on the tailnet only.
- Playwright e2e tests (`pnpm e2e`) and e2e and Docker build jobs in PR CI.

### Changed
- The server listens on `HOST` (default `127.0.0.1`) and refuses a non-loopback address with auth off or in tailscale mode, unless `SITEGARDEN_INSECURE=1`.
- `auth.enabled: true` is accepted now that auth exists.

### Fixed
- A node without a `mock:` block (any real node) crashed its details popover.

## [0.8.0] - 2026-11-25

### Added
- `GET /api/status`: every node's status, last check, response time, up to 48 history points and its checks' latest results, plus the last event ID.
- Check results can carry `ms` (response time); the `http` check reports it and `check.result` events include it. Plugin API 1.3.0 (additive).
- `plugins/mock`: a `mock` check type that drives the sample map from the server. `SITEGARDEN_DEMO=1` loads it for any config.

### Changed
- The web app shows the server's statuses (snapshot, then SSE events) instead of a fake client-side engine. "Check now" and "Check everything" run the server's checks.
- Demo deploy and webhook flows play only while the mock plugin is loaded; otherwise deploy buttons are disabled until the GitHub plugin. The debug menu loses "break a site" and "fix all".
- A check with no stored result runs within 5 seconds of start, so a fresh map is not grey for a whole interval.
- A check removed from the config no longer counts toward its node's status.
- Events and check history older than 30 days move to `archive_events` / `archive_history` at start and then daily, kept for the future time scrubber (before, old events were deleted, and only at start). `check.result` events are not archived; the same results are in the archived history. Check history and events are indexed for the per-node and pruning reads.

## [0.7.0] - 2026-11-24

### Changed
- The web app runs on Preact 10 (through `preact/compat`) instead of React 19. The map, panels, command bar and status strip look and behave the same. The main chunk drops from 99 KB to 40 KB gzip.
- Web plugins are compiled into the web build and share the host's Preact; the import-map loader in the plan is dropped. The supported React API is listed in `docs/plugins.md`.

## [0.6.0] - 2026-11-24

### Added
- A plugin that throws while rendering shows a small "plugin X failed" card in its place; every other plugin and the map keep working.

### Changed
- The map's pan, zoom, pinch and animated moves are our own code and React Flow is gone, with the same wheel step, easing and pan extent, so the map looks and feels the same. The main chunk drops from 181 KB to 99 KB gzip.

## [0.5.0] - 2026-11-24

### Added
- Shorthand fields: a plugin registers a field on a node type that expands into links when the config loads (`ctx.registerShorthand`); explicit `links:` with the same label win. `essentials` provides `repo: owner/name`, `sanity: <projectId>` with `studio: <name>`, and `url:` on `site` nodes.
- Config-driven checks: nodes take `checks:` entries whose `type` a plugin registered with its own schema (`ctx.registerCheckType`), each run on its own `every`. `essentials` provides the `http` check (`url`, `expect_status`, `expect_text`, `timeout`, `alert_after`, `allow_private`); results are `ok`, `degraded` until `alert_after` failures in a row, then `down`.
- A plan, apply or GUI edit rejected as invalid emits a `config.invalid` event.
- Plugin API 1.2.0 (additive).

### Changed
- The sample config uses `repo:` and `url:` where they expand to the same links; the rendered map is unchanged.

## [0.4.0] - 2026-11-24

### Added
- `secrets:` in the config declares secret names (optional `expires`); values come from the env var `NAME` or the file in `NAME_FILE`. `${secret:NAME}` references to undeclared names are config errors with their line; declared secrets without a value are warned about in `sg plan` (`warnings` in `POST /api/plan`) and the server log.
- Plugin API 1.1.0: `ctx.http(url, init)`, the only outbound client. It enforces the manifest's `permissions.network` and `permissions.secrets`, substitutes `${secret:NAME}` in the URL and headers, refuses loopback, private, link-local, CGNAT, ULA and metadata addresses on the connection itself (`allowPrivate: true` opts in per request), follows at most 5 re-checked redirects, and applies a timeout (10 s) and a body cap (5 MB).
- Secret values are redacted to `[secret:NAME]` in events, check details, logs and config issues.

### Changed
- Server logging goes through `server/core/log.ts`.

## [0.3.0] - 2026-11-24

### Added
- Config revisions: the server stores every applied config as a numbered revision (source `cli`, `gui` or `bootstrap`) and runs on the latest one.
- `POST /api/plan` (validation errors with lines, graph diff, render estimate), `POST /api/apply`, `GET /api/state`, and `config.applied` and `apply.progress` events.
- `sg plan`, `sg apply` and `sg pull` work against a server (`--server`, `SITEGARDEN_SERVER`), with a drift guard on plan and apply (exit code 3), confirmation (`--yes`) and `--no-wait`; local state in `.sitegarden/state.json`.
- `sg apply --local-render` renders the missing tiles on the local machine and uploads them (`POST /api/artifacts/missing`, `PUT /a/:name`).
- `auth.enabled` in the config: rejected (422) until real auth exists, so a config cannot lock itself out; with a provider, it requires an authorized user for apply, GUI edits and uploads.

### Changed
- **BREAKING:** the server no longer watches `sitegarden.yaml`. It imports the file once as rev 1 on first start with an empty store and ignores it afterwards; change the config with `pnpm sg apply`.
- **BREAKING:** `pnpm sg plan` and `pnpm sg apply` need a running server instead of working on the data directory directly.
- Planting and removing an estate in the GUI make revisions with source `gui`.

## [0.2.0] - 2026-11-24

### Added
- Plugin host with manifests, API version checks and `essentials`, the first-party plugin with the five node types.
- Zod config schema with line-numbered errors, a merged JSON Schema at `/schema.json` and `pnpm sg schema`.
- SQLite store (`node:sqlite`) for events, check snapshots, cache and plugin data.
- Typed event stream on `/api/events` with `Last-Event-ID` catch-up.
- Check scheduler with jitter, concurrency limit and backoff, and `POST /api/refresh`.
- Web extension tree: map layers and side-panel tabs are extensions that can be replaced, wrapped, disabled or configured under `extensions:`; served on `GET /api/config`.
- `PORT` environment variable for the server.

### Changed
- **BREAKING:** `sitegarden.yaml` is now `world`, `plugins`, `groups`, `nodes`, `edges` and `extensions`. The old `estates:` shape is refused with a message; move each estate to a group and its nodes and edges to the top level (mock-only fields go under `mock:`).
- Node and edge fields are validated strictly, and an edge must connect two nodes of the same group.
- An invalid config on reload keeps the last good graph and emits `config.invalid`.
- Requires Node.js 22.13 or newer.

## [0.1.4] - 2026-11-24

### Added
- This changelog.
- GitHub releases: a tagged release with these notes is created when a new version lands on main.
- The PR check now fails when `CHANGELOG.md` has no entry for the new version.

## [0.1.3] - 2026-11-24

### Changed
- Archived the client-perf-pass OpenSpec change and added the map-performance spec.
- Logged the decisions for the two perf experiments that were tried and reverted (zoom-stepped labels, lazy chunks).

## [0.1.2] - 2026-11-24

### Changed
- Moved the app from `web/` to the repository root and fixed paths.
- Removed the design board copies from the repo.
- Ignore local `.claude` tooling.

### Removed
- The `web/` version fallback in CI.

## [0.1.1] - 2026-11-24

### Added
- Project README and a security policy.

### Changed
- Moved planning docs and design boards under `docs/`.

## [0.1.0] - 2026-11-24

### Added
- `pnpm perf`: a repeatable measurement script with scenarios, screenshot diffs and a recorded baseline in `perf/`.

### Changed
- Map client performance pass (client-perf-pass): idle GPU use dropped from about 22% to about 8-10%.
- Animations run on their own compositor layers, and the marching dashes, down pulse and lantern are stepped at 12-15 frames per second.
- Pan and zoom move the map imperatively, with no React render per frame.
- Tiles decode asynchronously and the first fly-to is smooth.
- The paper texture is viewport-sized and served as WebP.
- Animations pause in hidden tabs and stay off with reduced motion.

### Removed
- Star twinkle and campfire animations.

## [0.0.1] - 2026-11-24

### Added
- Initial import: docs, design boards and the visual map proof of concept.
- OpenSpec setup and the client-perf-pass proposal.
- Pull request checks: lint, tests, build and a required version bump.
