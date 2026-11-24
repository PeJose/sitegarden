# Tasks

## 1. Tile requests

- [x] 1.1 Explain the zoom tile requests (58 vs 42) and fix or document them (D4). Verify: a note in `perf/results.md` with both builds' level-change counts; if fixed, the zoom scenario's `tileReqs` is back to React Flow's level within noise.

## 2. Swap

- [x] 2.1 Packages, `vite.config.ts`, `tsconfig.app.json` (D1) and the four type fixes (D2). Verify: `pnpm ls react` shows no top-level React; `tsc -b` and `pnpm build` clean; `rg "react.production" dist` finds nothing; main chunk ≤ 50 KB gzip.
- [x] 2.2 Behaviour checks (D3). Verify: headless script types in the command bar, blurs the status strip, opens Inventory/Links/popover, flies to a plot; zero console errors; screenshot diff passes.

## 3. Measure, docs, close

- [x] 3.1 Interleaved A/B on AC (D5), appended to `perf/results.md`. Verify: budgets met.
- [x] 3.2 Update `docs/plan.md` (stack table, map rendering layers, M1 list with pre4 = own viewport + Preact, item 6 build-time web plugin), `docs/plugins.md` (build-time plugins replace the import map; supported React API via preact/compat), `docs/visual.md` where it names React; CHANGELOG 0.7.0, `package.json` 0.7.0; archive the change. Verify: `rg -i "react flow|@xyflow|import map" docs` only finds intentional history mentions; `pnpm test`, `npx oxlint` clean; version check passes against main.
