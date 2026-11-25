# Tasks

## 1. Server

- [x] 1.1 `CheckResult.ms`, db `ms` columns with migration, scheduler passes `ms`, `http` returns `ms`, SDK 1.3.0 (D1). Verify: db test opening an old-schema file; scheduler test sees `ms` in `check.result`; essentials test asserts `ms` on ok and wrong-status results.
- [x] 1.2 `GET /api/status` (D2), `WORST` exported from the scheduler. Verify: app tests for a node with no results, worst-of-checks, history order and `0` for failures, `since`, `lastEventId` taken before the read, `demo` flag.
- [x] 1.3 `plugins/mock` and `SITEGARDEN_DEMO=1` (D6); sample config (D7). Verify: plugin tests with injected random (first run = `initialStatus`, down recovery, `baseMs: 0`); host test for demo load and dedupe; `pnpm sg plan` against a scratch server: 0 tiles to render.

## 2. Client

- [ ] 2.1 `src/live/store.ts` replaces the fake engine for statuses (D3), SSE listeners in `src/world.ts`, callers moved. Verify: store tests (load, `node.status`, `check.result`, old ids ignored, unknown node, history cap); `pnpm build`.
- [ ] 2.2 Refresh wired to `POST /api/refresh` with toasts (D4). Verify: test with a stubbed `fetch` for node and global refresh and the `queued === 0` messages.
- [ ] 2.3 Demo flows in `src/live/demo.ts`, `working` overlay, deploy buttons, Debug menu (D5). Verify: store test for the overlay (working during a flow, server status after); `?still=1` screenshot diff with `pnpm perf --baseline` within thresholds.

## 3. Close-out

- [ ] 3.1 README, `docs/plugins.md`, `docs/plan.md` (item 4 done), CHANGELOG 0.8.0, `package.json` 0.8.0. Verify: `pnpm test`, `pnpm build`, oxlint no errors, version check against main.
