# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
