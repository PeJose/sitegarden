# Tasks

## 1. Baseline

- [x] 1.1 Record the "before" numbers (D6) on the current code: 3 runs of `pnpm perf --only light,pan,pan-4x,zoom,zoom-4x`, plus `vite build` main chunk raw/gzip. Verify: a "own-viewport before" block in `perf/results.md`.

## 2. Viewport

- [x] 2.1 `src/map/viewport.ts` store and transform (D1), input handling (D2), animated moves (D3), with unit tests for anchor-preserving zoom, extent clamping, pinch math, click vs drag, and animation cancel. Verify: `src/map/viewport.test.ts` in `pnpm test`.
- [x] 2.2 Replace React Flow in MapView, WorldLayer, PinNode, App, Hero, Controls, Debug (D1, D4); remove `@xyflow/react`. Verify: `pnpm build` passes; `rg "@xyflow" src package.json` finds nothing; headless check that drag, wheel, zoom buttons, sidebar fly-to and pin click work (scripted in the perf browser, screenshots read).

## 3. Isolation

- [x] 3.1 Per-extension error boundary in `resolve()` (D5). Verify: tree test with a throwing extension renders the failure card and the others.

## 4. Measure and close

- [ ] 4.1 "After" numbers interleaved with "before" (D6), screenshot diff, bundle size; append the comparison to `perf/results.md`. Verify: pan ≥ 55 fps, pan-4x ≥ 50 fps, no new long tasks, idle GPU not higher than before beyond noise, screenshot diff passes, main chunk smaller.
- [ ] 4.2 CHANGELOG entry and version bump; archive the change (`openspec archive own-viewport -y`). Verify: `pnpm test`, `pnpm build`, `npx oxlint` no new errors; version check passes against main.
