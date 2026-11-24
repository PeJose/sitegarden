# Proposal

## Why

Everything after the perf pass (checks, map v0 on real data, Docker, the first web plugin) needs a core that does not exist yet: today the server only reads `estates:` for the render pipeline and the UI runs on a mock engine. M1 item 1 in docs/plan.md builds that core.

## What Changes

- **BREAKING** `sitegarden.yaml` moves to the flat shape from docs/plan.md "Config shape": `plugins`, `groups`, `nodes`, `edges`, `extensions`, plus `world: { seed }` (was `accountSeed`). The repo's sample config is converted; the render pipeline reads the new shape through an adapter, so the map renders exactly as before.
- Graph model: groups, nodes, edges with IDs, validated (unique IDs, edges and groups resolve, node types registered).
- Config schema: core schema merged with plugin Zod fragments into one JSON Schema, served at `/schema.json` and written by `pnpm sg schema`.
- Plugin host, tiers A (declarative) and B (trusted in-process code): load from the `plugins:` list (local folders and package names), manifest validation, `apiVersion` check, `dependsOn` order, registries whose `add` returns a disposer, error isolation.
- A first-party `essentials` plugin with only the node types (`repo`, `cms`, `site`, `job`, `db`) to prove the host; shorthands and checks come in M1 item 3.
- Extension tree on the web side: root slots, replace by ID, disable/configure from YAML, a "who replaced what" log. The existing map layers and side-panel tabs are mounted through it.
- Store: SQLite (`node:sqlite`, WAL) with append-only events, status snapshots, a fetch cache with `fetched_at`, and a per-plugin key-value namespace.
- Scheduler: runs registered checks per node on intervals with jitter, backoff, a concurrency limit, and manual refresh.
- Event bus over SSE: typed events with IDs, `Last-Event-ID` catch-up from the store. The existing `release` event moves onto it.

## Capabilities

### New Capabilities
- `garden-config`: the config file, the graph model it defines, validation errors, and the merged JSON Schema.
- `plugin-host`: loading, versioning, registration, unloading and isolation of plugins.
- `extension-tree`: how visual pieces attach to slots and how they are replaced, wrapped, disabled and logged.
- `core-store`: what the server persists and how it survives restarts.
- `check-scheduler`: when checks run, how failures back off, and manual refresh.
- `live-events`: the typed event stream to browsers and catch-up after reconnect.

### Modified Capabilities

## Impact

- Server: new `server/core/` (graph, config, plugins, store, scheduler, events); `server/config.ts`, `server/index.ts`, `server/sg.ts` change; `plan.ts`/`apply.ts` keep their types via the adapter.
- Web: new extension tree module; `App.tsx` and `map/MapView.tsx` mount layers and tabs through it. The UI keeps the mock engine for statuses until M1 item 4.
- Config: `sitegarden.yaml` converted; new generated `schema.json`.
- Dependencies: `zod` (v4, for `z.toJSONSchema`). SQLite via built-in `node:sqlite`, so Node >= 22.13 (`engines`).
- Out of scope: secrets broker and SSRF guard (item 2), shorthands and real checks (item 3), UI on live data (item 4), auth and audit (item 5), web plugins via import map (item 6), hooks (`hookable`), tiers C/D.
