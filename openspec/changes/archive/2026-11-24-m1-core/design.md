# Design

## Context

The server (`server/`) is the POC's render pipeline: `config.ts` reads `sitegarden.yaml` (`accountSeed` + nested `estates[].nodes/edges`), `plan.ts`/`apply.ts` render tiles from it, `index.ts` (Hono) serves releases, tiles, an SSE stream with one `release` event, and two GUI endpoints that edit the YAML (`POST /api/estates`, `DELETE /api/estates/last`). The web app gets statuses from `src/mock/engine.ts`. Target architecture and the plugin design are in docs/plan.md and docs/plugins.md; this change implements their core part and nothing past M1 item 1.

## Goals / Non-Goals

**Goals:**
- One config shape (the docs/plan.md draft) used by both the core and the render pipeline.
- A plugin host and registries narrow enough to freeze later without breaking first-party plugins.
- Every piece testable with `node:test` (via `tsx --test`) without a browser or network.

**Non-Goals:**
- Outbound HTTP for plugins (`ctx.http`), secrets, SSRF guard: M1 item 2. Manifests may declare `permissions`; this change stores them and does not enforce them.
- Hooks (`hookable`), activation events other than `startup`, hot reload of plugin code (a config change reloads the plugin set; a code change needs a restart).
- Web plugins loaded at runtime (import map): M1 item 6. Web extensions in this change are first-party and bundled.
- UI statuses from the server: M1 item 4. The mock engine stays.

## Decisions

### D1. Config shape and adapter
New top level: `world: { seed }`, `plugins`, `groups`, `nodes`, `edges`, `extensions`. `sitegarden.yaml` is converted once by a script (committed result, script not kept). `server/config.ts` exposes `loadGraph()` (validated graph) and a pure `toRenderConfig(graph)` that rebuilds today's `Config` (`accountSeed` + `estates` grouped by `group`), so `plan.ts`, `apply.ts`, `src/gen/*` and positions keep their types and output. Node fields the renderer or mock UI read today (`name`, `host`, `links`, `notes`) are core node fields; mock-only fields (`baseMs`, `initialStatus`, the human `checks` strings) move under a per-node `mock:` object, which the schema allows and the adapter flattens back. The GUI endpoints keep their routes and behaviour, now adding/removing a group with its nodes and edges via the YAML document API (comments kept).
Alternative: keep `estates:` and nest the new fields. Rejected: the plan, schema, shorthands and plugins all assume flat nodes.

### D2. Validation with Zod v4, errors with lines
Add `zod` (v4). Core schema: envelope + node/edge/group base. Plugins contribute per-node-type fragments; the root is `z.discriminatedUnion('type', …)` over registered types. JSON Schema via `z.toJSONSchema(root, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' })`; no `transform`/`date`/`custom` in config schemas. Parse with `YAML.parseDocument` (keeps ranges) and map each Zod issue path to a line through the document's node ranges. Referential checks (duplicate IDs, missing node/group) run after the schema pass and report the same way. Invalid on reload → keep the last good graph, emit `config.invalid`.

### D3. Plugin host
`server/core/plugins.ts`. Resolve entries: starts with `.` or `/` → folder relative to the config file; else `import.meta.resolve` of the package name. Manifest = Zod schema from docs/plugins.md (subset: `id`, `apiVersion`, `dependsOn`, `server`, `contributes`, `permissions`, `tier` fixed to `trusted`). `apiVersion` and `dependsOn` ranges checked with a ~20-line caret/tilde/exact matcher (no `semver` dependency; anything else is refused as unsupported). Topological sort by `dependsOn`, ties in list order. Tier A data is read from the manifest only; the `server` entry is `import()`ed only if present. `definePlugin({ id, register(ctx) })`; `ctx.registerNodeType`, `ctx.registerSchema`, `ctx.registerCheck`, `ctx.store` (namespaced KV + cache), `ctx.emit`. Each `register*` returns a disposer and is also collected on the plugin record; unload calls them in reverse. Errors in load or `register` are caught per plugin and recorded as `failed` with the message. SDK version constant `SDK_VERSION = '1.0.0'` in `server/core/sdk.ts`, also the types plugins import.

### D4. First-party essentials
`plugins/essentials/` (package.json with `sitegarden` key, `server.ts`), registering node types `repo`, `cms`, `site`, `job`, `db` with no extra fields. Listed in the sample config as `./plugins/essentials`. M1 item 3 extends it.

### D5. Store on `node:sqlite`
`server/core/db.ts`, `DatabaseSync` on `<DATA>/sitegarden.db`, `PRAGMA journal_mode=WAL`. Tables: `events(id INTEGER PRIMARY KEY AUTOINCREMENT, at, type, data)`, `snapshots(node, check_id, status, at, detail, PRIMARY KEY(node, check_id))` plus `snapshot_history` append rows, `cache(key PRIMARY KEY, value, fetched_at)`, `kv(plugin, key, value, PRIMARY KEY(plugin, key))`. Schema created with `CREATE TABLE IF NOT EXISTS` and a `user_version` pragma for later migrations. Node >= 22.13 in `engines`; the experimental warning is accepted. Content-addressed render artifacts stay as files (`store.ts` unchanged).
Alternative: `better-sqlite3`. Rejected: native build step, and the built-in module covers this.

### D6. Scheduler
`server/core/scheduler.ts`, one timer per check, a semaphore (default 4). Interval strings `30s|5m|1h|1d`. First run at `random(0, every)`; later runs at `every ± 10 %`; after n consecutive failures (`down`) the delay is `min(every * 2^n, 4 * every)`; one non-`down` result resets. A check is `{ id, node, every, run(ctx) => { status, detail? } }`, registered by plugins for nodes (in this change only test fixtures register checks). Each result → upsert snapshot + `check.result` event; a node's status (worst of its checks: down > degraded > working > unknown > paused > ok) changing → `node.status`. `refresh(nodeId?)` queues the matching checks immediately. `POST /api/refresh` with optional `{ node }`. Time and randomness injectable for tests.

### D7. Event bus and SSE
`server/core/events.ts`: `emit(type, data)` inserts into `events`, then notifies in-process listeners with the row ID. `/api/events` reads `Last-Event-ID`, sends stored rows after it, then live ones; listener attached before the catch-up query and de-duplicated by ID so nothing is lost between them. Keep-alive comment every 25 s. The `release` event moves onto the bus (data `id:rev`, same as today) so the web client needs no change. Events older than 30 days are pruned on start.

### D8. Web extension tree
`src/ext/tree.ts`: `ExtensionRegistry` with `add(ext)`, override log, `override(id, wrap)`, `resolve(slot, input, config)`. Extensions: `{ id, slot, input, order?, render }`. The existing map layers in `MapView` (world/tiles, live SVG, labels, pins as far as they are separate components) and the side-panel tabs in `ui/Panels.tsx` are registered as `layer:garden:*` and `tab:essentials:*` in one first-party module and rendered through `resolve`. The `extensions:` config reaches the browser through a new `GET /api/config` (`{ extensions }` only, nothing secret). Order and DOM structure of the default map stay identical; the perf screenshot diff must pass.

## Risks / Trade-offs

- [Config conversion changes rendered output] → `pnpm sg plan` after conversion must report "nothing to do" against the release built before it; screenshot diff with `pnpm perf --only light-still,night-still`.
- [Extension tree adds wrappers that break compositor layers from the perf pass] → keep the same DOM; registry renders components directly, no extra wrapper elements; check pan/idle numbers with `pnpm perf --only pan,light`.
- [`node:sqlite` is experimental on Node 22] → it is stable enough for one writer; pinned via `engines`; isolated behind `db.ts`.
- [Line mapping of Zod issues fails for some paths] → fall back to the nearest parent node's line.

## Migration Plan

One PR. The sample `sitegarden.yaml` is converted in the same commit as the loader. No production deployments exist yet, so no runtime migration; an old-shape file fails with an error that says "config uses the old `estates:` shape, see CHANGELOG 0.2.0". Version goes to 0.2.0 (breaking config).
