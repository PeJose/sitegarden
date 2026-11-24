# Proposal

## Why

M1 item 3: the map needs real data. The selling point in docs/plan.md is "one field instead of ten URLs" (`repo:`, `sanity:`), and the first real checks are HTTP status plus expected text ("200 but broken"). The core (scheduler, `ctx.http` with the SSRF guard) is ready for them.

## What Changes

- Shorthand fields: a plugin registers a field on a node type that expands into standard links when the config loads. Explicit `links:` with the same label win.
- `essentials` registers `repo: owner/name` (GitHub: Actions, Settings, Secrets, Pull requests, Issues), `sanity: <projectId>` (Manage, API, Webhooks) with optional `studio: <name>` (Studio), and `url:` on `site` (a link to the site).
- Config-driven checks: nodes get `checks:` entries whose `type` a plugin registered with its own schema; the scheduler runs each entry on its `every`.
- `essentials` registers the `http` check: `url` (default the node's `url`), `every` (default `5m`), `expect_status` (default any 2xx), `expect_text`, `timeout` (default `10s`), `alert_after` (default 1), `allow_private` (default false). All requests go through `ctx.http`.
- `garden-config`: the "bad edit" requirement is restated for the revision model (an invalid config never replaces the running one), since remote-apply removed the file watch.
- SDK 1.2.0 (additive), version 0.5.0.

## Capabilities

### New Capabilities
- `essentials-links`: shorthand fields and the links they produce.
- `http-checks`: the `http` check's config, results and failure handling.

### Modified Capabilities
- `garden-config`: "A bad edit keeps the last good config" becomes "An invalid config never replaces the running one".

## Impact

- Server: `server/core/sdk.ts` and `plugins.ts` (`registerShorthand`, `registerCheckType`), `graph.ts` (core `checks` field, shorthand expansion after validation), `scheduler.ts` (instances from config entries), `plugins/essentials` (shorthands, `http` check, manifest `permissions.network: ["*"]`).
- Config: sample `sitegarden.yaml` uses `repo:` / `sanity:` / `studio:` / `url:` where the expanded links equal today's explicit ones; mock fields stay until M1 item 4.
- Out of scope: SSL, domain and token expiry, heartbeat (M4); showing check results in the UI (M1 item 4).
