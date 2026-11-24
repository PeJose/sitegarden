# Design

## Context

After m1-secrets: `server/core/graph.ts` builds the schema from `NodeTypes` (node type → extra Zod fields) and validates strictly; plugins call `ctx.registerNodeType` / `ctx.registerSchema` / `ctx.registerCheck` (`CheckDef` with fixed `every` and optional `nodeTypes`) and `ctx.http`; `server/core/scheduler.ts` builds instances keyed by check id and node from `set(nodes, checks)`; `plugins/essentials` registers only the five node types. Revisions, plan and apply live in `server/app.ts`.

## Goals / Non-Goals

**Goals:** shorthands and config-driven checks as general plugin features, with essentials as the first user. **Non-Goals:** UI for results (item 4), expiry checks and heartbeat (M4), response-time history.

## Decisions

### D1. Shorthands
`ctx.registerShorthand({ nodeType, field, schema, links(value, node) => { label, url }[] })` → disposer. It also registers `field` on the node type's schema (so editors autocomplete it). After `parseGraph` succeeds, a pure `expandLinks(graph, shorthands)` sets each node's `links` = generated (in registration order) minus labels present in explicit `links`, then the explicit ones. Expansion is part of loading, so plan diffs, the renderer and later the UI all see the final links; the stored YAML is untouched. Line-numbered errors come from the field's Zod schema, as for any field.

### D2. Essentials values
- `repo`: `z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'must be owner/name')` → `https://github.com/<v>/{actions,settings,settings/secrets/actions,pulls,issues}`, labels `Actions, Settings, Secrets, Pull requests, Issues` (the labels already used in the sample config).
- `sanity`: `z.string().regex(/^[a-z0-9]+$/)` → `https://www.sanity.io/manage/project/<v>` (`Sanity manage`), `…/api` (`API`), `…/api#webhooks` (`Webhooks`); `studio`: `z.string().regex(/^[a-z0-9-]+$/)` → `https://<v>.sanity.studio` (`Studio`).
- `url` on `site`: `z.url({ protocol: /^https?$/ })` → one link labelled with the host.

### D3. Config-driven checks
`ctx.registerCheckType({ type, schema, run(config, node, ctx) => CheckResult })` → disposer. Core adds `checks: z.array(z.discriminatedUnion('type', [...registered]))` to every node (optional, default `[]`); each registered schema includes `every` (interval string, validated by the existing `parseEvery`, default `5m`). The `mock.checks` strings stay as they are. The scheduler gets instances for every `(node, index)` entry: key `<node>#<index>:<type>`, `every` from the entry, `run` bound to the entry's config. Plugin `registerCheck` (automatic checks) keeps working. `set()` reuses an instance when its key and config JSON are unchanged, so an apply that does not touch a check does not reset its timer or backoff.

### D4. HTTP check
Runs `ctx.http(url, { timeoutMs, allowPrivate, maxBytes: 5 MB })`, measures time with `performance.now()`. Status match: `expect_status` is a number or a list; default `200–299`. Text match: plain substring, case-sensitive. Consecutive failures are counted in the instance's plugin KV (`ctx.store.kv`, key `fails:<node>#<index>`), so a restart keeps the count; result `degraded` while `fails < alert_after`, `down` from there; success resets to 0. Details: `200 in 182 ms`, `expected 200, got 503 (95 ms)`, `text "Fernhill" not found (200, 182 ms)`, or the `HttpError` message (already redacted). Scheduler backoff stays as it is (applies to `down` only).

### D5. Manifest and SDK
`essentials` manifest gets `permissions.network: ["*"]` (checks hit user URLs; the SSRF guard still applies) and `contributes.shorthands`/`checkTypes` listing what it registers, for the future gallery. `SDK_VERSION` 1.2.0.

### D6. Sample config
Replace explicit links by shorthands only where `expandLinks` produces the identical label+URL list; keep the rest explicit. No real checks in the sample (its domains are fictional). Verify the converted graph's links equal the old ones in a test, and the render plan still has nothing to render.

## Risks / Trade-offs

- [Check instance churn on every apply] → key + config JSON reuse (D3).
- [`expect_text` against huge pages] → 5 MB cap from `ctx.http`, failure detail says so.
- [Shorthand label collisions between plugins] → later registration wins, logged like extension overrides.

## Migration Plan

Additive; existing configs keep working. Version 0.5.0, CHANGELOG entry, README: shorthands and `checks:` example.
