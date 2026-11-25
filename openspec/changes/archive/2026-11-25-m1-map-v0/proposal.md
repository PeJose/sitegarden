# Proposal

## Why

M1 item 4: the map still runs on a client-side fake engine (`src/mock/engine.ts`). The server already runs checks and emits `check.result` / `node.status` over SSE, but nothing shows them. Map v0 shows the server's real statuses on the map, side panel, Inventory and Links lists, plus Refresh. Per the scope decision of 2026-11-24, the fake statuses move into a server-side `mock` plugin, so the demo and the sample config keep looking alive.

## What Changes

- `GET /api/status`: one snapshot of every node's status, its checks' last results and a short response-time history, plus the last event ID so the client can join the SSE stream without a gap.
- Check results may carry `ms` (response time); `http` reports it. SDK 1.3.0 (additive).
- Client: a live store replaces the fake engine. It loads `/api/status`, then applies `node.status` and `check.result` from the one existing `EventSource`. The map, popover, status strip, hero, Inventory, Links and boring view read it with the same selectors as today.
- Refresh: "Check now" (popover, boring view) and "Check everything" (hero, status strip, command bar) call `POST /api/refresh`.
- `plugins/mock`: a `mock` check type that produces statuses and response times from a node's `mock:` fields (`initialStatus`, `baseMs`), with the occasional slow or broken site. The sample config lists the plugin and gives each mocked node `checks: [{ type: mock }]`. `SITEGARDEN_DEMO=1` loads it even when the config does not list it.
- Deploy and webhook flows (marching paths, lantern, `working` pins) stay a client-side demo animation for now, shown only while the server reports the mock plugin as loaded. Real deploys arrive in M2.
- Version 0.8.0.

## Capabilities

### New Capabilities
- `live-status`: the status snapshot, how the client merges it with events, and Refresh.
- `mock-plugin`: the `mock` check type and demo mode.

### Modified Capabilities
- `live-events`: `check.result` carries `ms` when the check reports one.

## Impact

- Server: `server/core/sdk.ts` (`CheckResult.ms`), `db.ts` (`ms` column on snapshots and history, read of the last N history rows), `scheduler.ts` (passes `ms`), `app.ts` (`/api/status`, demo flag), `plugins/essentials` (`ms` from the `http` check), new `plugins/mock`.
- Client: `src/mock/engine.ts` → `src/live/` store; callers in `App.tsx`, `Boring.tsx`, `ui/*`, `map/WorldLayer.tsx`, `map/PinNode.tsx`, `summary.ts`; the debug menu keeps deploy, webhook and estate buttons, "break a site" and "fix all" go (the mock plugin breaks sites by itself).
- Config: sample `sitegarden.yaml` lists `./plugins/mock` and adds `checks: [{ type: mock }]` to mocked nodes.
- Out of scope: real deploy and webhook events (M2), status history charts beyond the existing sparkline, auth (item 5), e2e suite (item 5).
