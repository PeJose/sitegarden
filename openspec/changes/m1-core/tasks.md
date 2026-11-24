# Tasks

## 1. Store and events

- [x] 1.1 `server/core/db.ts` on `node:sqlite` with the D5 tables, WAL and `user_version`; `engines.node >= 22.13`. Verify: `server/core/db.test.ts` covers append-only growing event IDs, `events after id`, cache `fetched_at`, KV namespacing, data survives reopening the file.
- [x] 1.2 `server/core/events.ts` bus and `/api/events` with `Last-Event-ID` catch-up and keep-alive (D7); move the `release` event onto it. Verify: test connects with `Last-Event-ID` and gets the missed events then live ones with no gap or duplicate; web app still refreshes tiles on a new release (`pnpm dev`, run `pnpm sg apply` after a config edit).

## 2. Config and graph

- [x] 2.1 Zod v4 core schema, graph model and referential checks with file/line errors (D2). Verify: tests for duplicate ID, edge to missing node, unknown type, bad field, each asserting the reported line.
- [x] 2.2 Convert `sitegarden.yaml` to the D1 shape and add `toRenderConfig`; switch `plan.ts`/`apply.ts`/`sg.ts`/`index.ts` callers to it; keep `/api/estates` routes working on the new shape. Verify: `pnpm sg plan` reports nothing to do against the release built before the change; `plan.test.ts` passes; plant/remove estate via the GUI still works.
- [x] 2.3 Keep the last good graph on an invalid reload and emit `config.invalid` / `config.loaded`; old `estates:` shape gives the migration message. Verify: test saves a broken file, graph unchanged, event emitted.

## 3. Plugin host

- [x] 3.1 `server/core/sdk.ts` (`SDK_VERSION`, `definePlugin`, ctx types) and `server/core/plugins.ts`: resolve, manifest validation, caret/tilde/exact range check, `dependsOn` sort, tier A without import, disposers, per-plugin error isolation (D3). Verify: tests with fixture plugins under `server/core/fixtures/` for: newer apiVersion refused, missing dependency refused, throwing register isolated, theme-only plugin not imported, unload leaves no registrations.
- [x] 3.2 `plugins/essentials` with the five node types (D4); config lists it; schema merge from plugin fragments; `/schema.json` and `pnpm sg schema`; `# yaml-language-server` header in the sample config. Verify: test that a fixture fragment field appears under `site` in the JSON Schema; `pnpm sg schema` writes `schema.json`.

## 4. Scheduler

- [ ] 4.1 `server/core/scheduler.ts` (D6) with injectable clock and random: jitter, concurrency limit, backoff cap, reset on success, snapshots, `check.result`/`node.status`, `refresh` and `POST /api/refresh`. Verify: tests for each scenario in specs/check-scheduler with a fake clock.

## 5. Web extension tree

- [ ] 5.1 `src/ext/tree.ts` registry (add, replace-by-ID log, override/wrap, disable/config, ordered resolve) (D8). Verify: `src/ext/tree.test.ts` for replace, wrap, disable, order; add it to `pnpm test`.
- [ ] 5.2 Register existing map layers and side-panel tabs as extensions and render through the tree; `GET /api/config` returns `extensions`. Verify: `pnpm perf --only light-still,night-still` screenshot diff passes; `pnpm perf --only pan,light` within noise of the last results.md block; disabling `layer:garden:labels` in YAML hides labels.

## 6. Close-out

- [ ] 6.1 `pnpm test`, `pnpm lint`, `pnpm build` pass; README dev section mentions the new config shape and `pnpm sg schema`; CHANGELOG 0.2.0 entry; `package.json` 0.2.0. Verify: commands pass, version check script passes against main.
