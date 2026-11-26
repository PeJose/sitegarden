# Tasks

## 1. Canvas renderer

- [x] 1.1 Bitmap cache with pixel budget and eviction; `preloadTiles` and theme warm-up use it (D3). Verify: unit tests for eviction.
- [x] 1.2 Canvas `TileLayer`: sizing, coalesced draw on viewport/release/theme/decode, draw order paper → preview → tiles coarse-to-sharp (D1, D2, D4). Verify: unit tests for the per-cell draw list and pattern scale.
- [x] 1.3 Remove `.paper` div, preview `<img>`, tile `<img>` CSS; `.world` keeps labels/live (D5); `tiles-visible` mark and `__sgTiles` (D6). Verify: `pnpm build`, existing e2e green.

## 2. Verify

- [x] 2.1 E2E: canvas shows tiles; wheel zoom-out never shows a blank pane frame. Verify: `pnpm e2e`.
- [x] 2.2 Desktop headless before/after: pan and pinch main-thread and raster time (same harness as the 0.11.1 pass). Verify: numbers in the report, no regression.

## 3. Close-out

- [x] 3.1 `docs/rendering.md` client section, CHANGELOG 0.11.2, `package.json` 0.11.2. Verify: `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e`.
