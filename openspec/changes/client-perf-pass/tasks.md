# Tasks

## 1. Measure

- [x] 1.1 Add `web/scripts/perf.ts` and a `pnpm perf` script (design D1): headed system Chrome via `playwright-core`, scenarios `light`, `night`, `light-still`, `night-still`, `pan`, `zoom`, `pan-4x`, printing JSON and appending to `web/perf/results.md`. Verify: `pnpm build && pnpm preview` then `pnpm perf` prints seven JSON lines and appends one dated block.
- [x] 1.2 Make the script save `light-still.png` / `night-still.png` and diff them against a baseline directory with sharp (D9). Verify: two runs with no code change report a diff under threshold.
- [x] 1.3 Record the baseline: run `pnpm perf` on the current code, commit results and baseline screenshots, and add a "Top costs" note ranking H1–H7 from design.md by measured cost (paint area, GPU %, long tasks, bytes). Verify: every H item has a number next to it.
- [x] 1.4 Document the procedure in `web/perf/README.md`. Verify: the README commands run as written.

## 2. Fix, highest measured cost first

Do these in the order 1.3 ranks them. After each: `pnpm perf`, screenshot diff under threshold, numbers logged with the task id.

- [ ] 2.1 Animations on own compositor layers (D2): stars, fires, down pulse, wash on wrappers with opacity/transform animations; lantern via WAAPI over pre-sampled points; flowing roads in road-sized wrappers; wash mounted only when down. Verify: `night-still` trace shows no paints from stars/fires/lanterns and only road-bbox paints from marching dashes; every animation still visible and unchanged by eye.
- [x] 2.2 Paper texture viewport-sized and served as WebP (D3), including the `apply.ts` change. Verify: no seams while panning; texture bytes drop in the `load` scenario; `pnpm test` passes.
- [x] 2.3 Imperative viewport transform (D4) for `.world`, the background and `Anchored`. Verify: React DevTools profiler shows no `WorldLayer` render per pan frame; tiles and pins stay aligned at rest after pan and zoom.
- [ ] 2.4 Zoom-stepped labels and LOD variables on the viewport element (D5). Verify: `zoom` scenario long tasks and style-recalc time drop; labels end at the exact size after zoom.
  - reverted: no measurable gain, numbers in results.md (2.4-decision).
- [x] 2.5 Async tile decoding and smooth first fly-to (D6). Found by the owner: the first click on a plot name after a refresh stutters, later clicks are smooth. Cause: during the 700 ms flight TileLayer mounts sharper-level tiles for every in-between position and decodes them on the main thread. Fix: `decoding="async"` on tiles and preview; before a fly-to, resolve the target view's tiles at the target level and `img.decode()` them; during the flight keep the current level and mount no in-between tiles (tiles already on screen stay as they are, never reloaded); swap in the decoded target tiles at landing; preload a plot's target tiles on hover/focus of its sidebar row. Add a `fly` scenario to `pnpm perf` (cold cache, click a sidebar plot, measure fps, long tasks and main-thread `Decode Image` during the flight). Verify: `fly` shows no long tasks and ≥ 55 fps on a cold cache; second flight unchanged; screenshot diff under threshold; numbers logged.
- [x] 2.6 Lazy chunks for Boring, Panels, Popover (D7). Verify: main chunk smaller in `vite build`; `?style=boring`, `?panel=links` and `?select=copperleaf-site` still work.
- [ ] 2.8 Pin layer during pan (H8, found in the baseline: hiding pins cut pan GPU 13.4% → 4.4%). Profile what the pins repaint per pan frame (rough.js SVGs, chip box-shadows, `.pin svg` scale via `--pin-k`, the `.pulse` inside each pin) and fix it without changing the look, e.g. pulse on its own layer, chip shadow cached on a composited layer, pins promoted so pan only moves them. Verify: pan GPU and paints drop, screenshot diff under threshold, numbers logged.
- [ ] 2.7 Hidden tab and reduced motion (D8). Verify: hidden 5 s → no animation frames; DevTools "prefers-reduced-motion: reduce" → nothing animates.

## 3. Check the budget

- [ ] 3.1 Full `pnpm perf` on the final code against the spec budgets (idle GPU < 10%, pan ≥ 55 fps, pan-4x ≥ 50 fps). Verify: results.md has a final block meeting every budget, or names the one that misses and why.
- [ ] 3.2 Compare `?still=1` light and night by eye against the v4.2 previews. Verify: no visible difference beyond animation phase; `pnpm test` and `pnpm lint` pass.

## Workflow follow-up

- Archive the change after review (`/opsx:archive client-perf-pass`).
