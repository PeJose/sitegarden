# Design

## Context

Server: `createScheduler` saves every result with `db.saveSnapshot(node, check, status, detail)` (tables `snapshots`, `snapshot_history`), emits `check.result {node, check, status, detail}` and, when a node's worst status changes, `node.status {node, status, from}`. `POST /api/refresh {node?}` runs checks now. SSE lives at `/api/events` with stored IDs and `Last-Event-ID` catch-up. Node `mock:` fields (`checks` strings, `baseMs`, `initialStatus`) are flattened onto the node for the UI by `server/config.ts`.

Client: `src/mock/engine.ts` holds `EngineState { nodes: Record<id, NodeState>, edges, flows, updatedAt }` behind `useEngine(select)` (`useSyncExternalStore`). `NodeState = { status, lastChecked, since, responseMs, history: number[48] }`. `src/world.ts` owns the only `EventSource` (listens for `release`).

## Goals / Non-Goals

**Goals:** every status on screen comes from the server; Refresh works end to end; the sample/demo map still looks alive with every current animation kept. **Non-Goals:** real deploys/webhooks, new UI, auth.

## Decisions

### D1. `ms` on results
`CheckResult` gets optional `ms?: number`. The scheduler passes it to `saveSnapshot` and puts it in `check.result`. `db`: add a nullable `ms INTEGER` column to `snapshots` and `snapshot_history` (on open: `PRAGMA table_info`, `ALTER TABLE ... ADD COLUMN` when missing). `http` returns the `ms` it already measures, for ok and failed responses (not for connection errors). SDK 1.3.0.

### D2. `GET /api/status`
```
{ lastEventId: number, demo: boolean,
  nodes: { [id]: { status, since, lastChecked, responseMs, history: number[], checks: [{ id, status, detail, at, ms }] } } }
```
- Read in one synchronous block, `lastEventId = db.lastEventId()` taken first, so an event emitted during the read is replayed, never lost.
- Every node in the current graph appears. A node with no results yet: `status: 'unknown'`, `lastChecked: null`, `since: null`, `responseMs: null`, `history: []`, `checks: []`.
- `status`: worst of the node's latest check results (same `WORST` order as the scheduler; export it from `scheduler.ts` instead of copying).
- `lastChecked`: newest `at` of the node's checks. `responseMs`: `ms` of the newest result that has one, `null` when that result failed.
- `history`: the last 48 `snapshot_history` rows of the node that have `ms` or a non-ok status, oldest first, as numbers: `ms`, or `0` for a non-ok result (the sparkline's existing convention, 0 = failed).
- `since`: `at` of the oldest row in the trailing run of rows whose node-level status equals the current one, within the last 500 history rows (approximation; `shortcut:` comment).
- `demo`: true when the `mock` plugin is loaded.
- `Cache-Control: no-store`.

### D3. Client live store
New `src/live/store.ts` (moves and replaces `src/mock/engine.ts`; `src/mock/data.ts` and `types.ts` stay where they are). Same `EngineState`/`NodeState` shapes and the same `useEngine(select)` export, so most callers change only their import path.
- `load()`: fetch `/api/status`, set `nodes` (history padded on the left with nothing; the sparkline must cope with fewer than 48 points, check `Popover`/`Boring`), remember `lastEventId` and `demo`.
- Events: `src/world.ts` keeps the only `EventSource`; it adds listeners for `node.status` and `check.result` that call `live.apply(type, data, eventId)`. Events with an id ≤ the snapshot's `lastEventId` are ignored. `node.status` → `status`, `since = now`. `check.result` → `lastChecked = now`, `responseMs`, push to `history` (cap 48) as `ms` or `0`.
- On SSE `error` → reconnect is automatic (EventSource + `Last-Event-ID`); on `release` (new config) → `load()` again so new nodes appear.
- Nodes the store does not know (config changed before the reload) render as `unknown`.
- `?still=1`: load the snapshot, do not apply events, no demo flows (screenshots).

### D4. Refresh
`live.check(id)` → `POST /api/refresh {node: id}`; `live.checkAll()` → `POST /api/refresh {}`. The returned `queued` count drives the toast: `queued === 0` → "No checks on <name>" / "Nothing to check". Results arrive by SSE; no optimistic status change. Callers: `Popover` ("Check now"), `Boring` ("Refresh", "Check everything"), `Hero` ("Check everything"), `StatusStrip` (refresh button), `CommandBar` (`check everything|all`).

### D5. Demo flows (client)
The flow part of the old engine (`deploy`, `webhook`, `finishDeploy`, the copperleaf opening scene, timers) moves to `src/live/demo.ts`, unchanged in look and timing, and runs only when the snapshot says `demo: true` and not `still`. It writes `flows`, `edges[...].lastResult` and a `working` overlay: while a deploy flow is in flight, both endpoints render `working`, then go back to the server status. The overlay never writes server-owned fields. "break a site" / "fix all" in `Debug` are removed; "deploy now", "webhook now" and the estate buttons stay. The deploy buttons (Popover, Hero, Boring, CommandBar `redeploy`) call `demo.deploy`; without demo they are disabled with title "Deploys arrive with the GitHub plugin (M2)".

### D6. `mock` plugin
`plugins/mock/server.ts` + `package.json` (same shape as essentials), `permissions` none.
- `ctx.registerCheckType({ type: 'mock', schema: {}, run })`, default `every` 5m; the sample sets `every: 15s` on sites and `1m` elsewhere so the map moves.
- `run(cfg, node, ctx)`: reads `node.mock` (`initialStatus`, `baseMs`) — `server/config.ts` keeps `mock` on the node handed to checks; verify, and fix there if it is stripped.
  - First run: return `initialStatus` (so the sample opens with the designed scene: copperleaf's site down).
  - Later: a node whose `baseMs` is 0 returns `ok` with no `ms`. Otherwise `ms = baseMs * U(0.7, 1.5)`; 6 % → `degraded` with `ms`; 2 % → `down` for the next ~25 s (store `downUntil:<node>` in `ctx.store.kv`), then back to `ok`. A node that started `down` recovers after its first 3 runs.
  - Randomness through an injectable `random` (module-level `let`, set in tests).
- Demo mode: `SITEGARDEN_DEMO=1` makes the plugin host load `./plugins/mock` even when `plugins:` does not list it (dedupe if it does). Nodes still need `checks: [{type: mock}]`; the sample has them.

### D7. Sample config
`plugins: [./plugins/essentials, ./plugins/mock]`; each node with a `mock:` block gets `checks: [{ type: mock, every: 15s }]` (sites) or `every: 1m` (others). `mock.checks` strings stay for the popover text. `pnpm sg plan` must show nothing to render.

## Testing

Unit tests for every task (`node:test`, add new files to the `test` script): db migration and `ms`, `/api/status` shapes (empty, mixed, `since`, event-id ordering), mock check (scene, recovery, randomness injected), live store (`load`, event merge, ignore old ids, unknown nodes), refresh calls. No smoke or e2e script in this change; the e2e suite starts in M1 item 5.

## Risks / Trade-offs

- [Sample map changes look: statuses now random server-side] → initial statuses match `initialStatus`, so the screenshot scene (`?still=1`) is identical; diff it with `pnpm perf --baseline`.
- [Snapshot/event race] → `lastEventId` first, id filter (D3).
- [`since` approximation] → bounded scan, `shortcut:` comment.

## Migration Plan

Additive server API and SDK; existing DBs get the `ms` columns on open. Version 0.8.0, CHANGELOG, README (mock plugin, `SITEGARDEN_DEMO`), `docs/plugins.md` (`ms`).
