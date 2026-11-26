# Design

## Context

`WorldLayer` writes `translate(x,y) scale(zoom)` to `.world` (will-change: transform) on every viewport change and renders the `map/layers` extensions inside it; `layer:garden:tiles` is `TileLayer` (an `<img>` per tile, LRU 96, level 1 under the current level, preview `<img>` under all, fade-in on load), `.paper` is a 40960-unit textured div. Tile geometry: `world.tiles = { size: T (world units per tile), x0, y0, cols, rows, names[theme][z][...] }`; `SCALE = [0.125, 0.5, 1, 2]` px per world unit at level z, so a level-z tile image is `T*SCALE[z]` px square. `viewOf`/`levelFor` (density cap 2, settled level after 200 ms) pick the level; `wantOf` lists wanted and missing cells; missing cells are POSTed to `/api/want`. `preloadTiles` decodes a fly-to destination ahead. `viewport` (`src/map/viewport.ts`) is the pan/zoom store (`get`, `subscribe`).

## Decisions

### D1. One canvas, drawn on demand
`TileLayer` renders a single `<canvas class="tiles">` positioned over the map pane (outside the scaled `.world`, under it in z-order), sized to the pane in CSS px and `pane * min(devicePixelRatio, 2)` in backing pixels (resize via `ResizeObserver`). It subscribes to `viewport` and schedules at most one draw per animation frame (`requestAnimationFrame`, coalesced). No continuous loop: it draws only when the viewport, the release, the theme, or a newly decoded bitmap changes.

### D2. Draw order per frame
`ctx.setTransform(dpr*zoom, 0, 0, dpr*zoom, dpr*x, dpr*y)` (world → backing pixels), `imageSmoothingQuality = 'high'`, then:
1. Paper: the theme/level texture bitmap as a `createPattern(bitmap, 'repeat')`, filled over the visible world rect, pattern scaled so it repeats every 1024 world units (`pattern.setTransform(new DOMMatrix().scale(1024 / bitmap.width))`). Use the settled level's texture; while a texture isn't decoded yet, keep drawing the previous one.
2. Preview: the theme's preview bitmap over the whole tile grid (`x0*T, y0*T, cols*T, rows*T`).
3. Tiles: for each visible cell (from the current `viewOf` range) draw, from coarse to sharp, every decoded tile of that cell at levels 1..3 that is no sharper than needed plus one level (`z <= level + 1`), each at `(x*T, y*T, T, T)`. Sharper decoded tiles therefore cover coarser ones; a cell never goes back to blurrier while a sharper bitmap is cached.
Draw cost is O(visible cells × levels); no per-tile DOM.

### D3. Bitmap cache
Module-level `Map<src, { bmp?: ImageBitmap; p?: Promise<void>; used: number }>` in `tiles.ts`. `ensure(src)`: `fetch(src)` → `blob()` → `createImageBitmap(blob)`; on settle, store and request a draw. Errors: drop the entry (retry next time it is wanted), never throw into the draw. Budget by decoded pixels: 32 Mpx total (≈128 MB RGBA) (`shortcut:` comment: fixed budget, make it depend on `navigator.deviceMemory` when needed); evict least-recently-drawn first, never a bitmap drawn in the last frame; `bmp.close()` on evict. Theme warm-up and fly-to preloading (`preloadTiles`) call `ensure` instead of `new Image()`. The service worker stays (fetch goes through it, cache-first for `/a/`).

### D4. What is fetched
Unchanged rules: current settled level plus level 1 for visible cells (`wantOf`), missing cells reported to `/api/want` with the same debounce. While zooming (level not settled) nothing new is fetched for the target level; the current bitmaps are drawn scaled by the canvas transform (that is cheap on the canvas; no browser re-raster).

### D5. DOM layers
`.world` keeps its transform and holds only the live/labels layers (z above the canvas). The `.paper` div and the preview `<img>` are removed (now in the canvas). Remove the tile `.tile` CSS and the fade-in; a newly decoded tile appears on the next draw (no fade; acceptable, and stepped arrival matches the user's stepped-motion preference). Extension order stays: `layer:garden:tiles` (canvas) first.

### D6. Performance mark and tests hooks
Keep `performance.mark('tiles-visible')` when the first-wave cells are all drawn. Expose for e2e only a read-only `window.__sgTiles = { drawn: number, cached: number, lastDrawMs: number }` updated per draw (no behaviour).

### D7. Engine module
The renderer is a plain-TS module under `src/engine/` (no Preact), the core of the map engine: `bitmaps.ts` (D3), `engine.ts` (`createEngine(canvas, viewport)` -> `{ addLayer, removeLayer, invalidate, destroy }`; one on-demand rAF scheduler; per frame a `Frame { x, y, zoom, dpr, w, h, rect, now }`, the world transform set once, layers drawn in `order`; a layer is `{ id, order, draw(ctx, frame), animating?() }`, and `animating()` keeps drawing for the later live layer), `tiles.ts` (paper -> preview -> tiles as a layer; pure `pick` and `patternScale`). `TileLayer.tsx` is a thin wrapper (canvas in a portal under `.world`, creates the engine, feeds world/theme/level, destroys on unmount). Two measured deviations from D2: per cell only the sharpest decoded tile (z <= level+1) is drawn, since tiles are opaque and drawing every level cost ~180 ms per frame on desktop; paper and preview are drawn only when some visible cell has no tile. Destination rects are snapped to whole backing pixels (no seams).

## Testing

Unit (pure functions extracted from the renderer): cell → list of bitmaps to draw (coarse to sharp, `z <= level+1`, falls back), cache eviction by pixel budget skipping last-frame bitmaps, pattern scale. E2E: map shows tiles (canvas non-blank pixels at the pane centre after load via `page.screenshot` sampling), zoom in then out keeps the cell drawn (no blank-pane frames: sample the canvas centre pixel each rAF during a wheel zoom-out, all non-paper-blank), Check now / settings / existing tests still pass. Real device: run on the user's Android phone over adb + CDP before and after: count frames with blank/checkerboarded tile area during repeated pinch in/out and pan after zoom-out (target 0), and frame time p95.

## Risks / Trade-offs

- [Canvas redraw cost on big phones] → bounded by visible cells (~20–40 draws per frame); measure p95 on the device.
- [No fade-in of tiles] → tiles pop in; stepped motion is acceptable per the user.
- [Memory] → 32 Mpx budget ≈ 128 MB RGBA; measure on the device and lower it if Chrome shows pressure.

## Migration Plan

Client-only, no server or API change. Version 0.11.2, CHANGELOG `### Fixed`.
