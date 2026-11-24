# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
