# sitegarden web (visual POC)

The map is rendered on the server once and only downloaded by the browser. `pnpm install && pnpm dev` (http://localhost:5173, API on 8787), `pnpm build`, `pnpm preview` (production build with the service worker), `pnpm test`.

## Render pipeline

`sitegarden.yaml` is the input (estates, nodes, edges). Layout positions live apart in `.data/positions.json`.

- `pnpm sg plan`: estates added/changed/removed, artifacts still to render, estimated time.
- `pnpm sg apply`: renders the missing artifacts, publishes `release-<id>.json` and atomically points `current` at it. It renders tile by tile, the light preview and the tiles of the initial view first (`order` in `plan.ts`), then their neighbours, then night and the other levels, and republishes as tiles appear (`rev` in the release). The client reports visible tiles that are still missing (`POST /api/want`); those jump the queue.
- `pnpm dev` runs apply on start and whenever `sitegarden.yaml` changes; "plant an estate" and `POST/DELETE /api/estates` only edit that file. The browser learns about new releases over SSE (`/api/events`).
- Env: `SITEGARDEN_DATA` (data dir, default `.data`), `SITEGARDEN_CONFIG` (default `sitegarden.yaml`), `SG_RENDER_WORKERS` (default cpus - 2; renders run at nice 10).

Artifacts are files in `.data/a/` named by the hash of their exact inputs (SVG, theme, zoom, renderer version), so the same config renders nothing twice:

| file | what | granularity |
|---|---|---|
| `layer-soft-*` | the costly watercolour filters (land edge, washes, trees), rendered at `WC` px/unit (half or less of the level's) and shared by levels 2 and 3 | per estate / per tile |
| `layer-texture-*` | paper grain, specks, fibres (seamless, repeated every 1024 units) | per theme and zoom |
| `layer-terrain-*` | soft layer enlarged, plus full-resolution streets, houses and lamps (wobbled as geometry, no filter) | per tile |
| `layer-estate-*` | one plot: soft land enlarged x paper grain at full resolution, plus roads, trees, buildings, paths, lamps at full resolution | per estate (sliced into tiles when flattened) |
| `tile-*.webp` | the flattened tile the client downloads | per tile, theme, zoom |
| `preview-*.webp` | whole map in one small image | per theme |
| `world-*.json`, `config-*.json` | geometry and the node config | per release |

Zoom levels are 0.125 / 0.5 / 1 / 2 px per world unit (level 0 only feeds the preview). Files not referenced by the current release are deleted after a complete apply. The browser loads `/api/release` (tiny), the preview, then visible tiles; `/a/*` is `immutable`, and `public/sw.js` (production only) keeps it all for offline revisits.

Client tile levels: the level follows the zoom only after it has rested for 200 ms (while zooming, the decoded tiles are drawn scaled and the paper stays), `levelFor` counts screen density up to 2, and a cell is drawn from the sharpest decoded tile up to one level above the settled one, so zooming out never blurs what is decoded. Tiles are fetched and decoded once into `ImageBitmap`s (`src/engine/bitmaps.ts`, 32 Mpx budget, least recently drawn evicted first, never one drawn in the last frame); level 1 is always fetched under the sharper level. Per frame the canvas gets the paper texture (a pattern repeating every 1024 world units, only where a cell has no tile yet), the preview, then one tile per visible cell at whole backing pixels (no seams). `.world` keeps only the live layer and labels above the canvas.

## Map engine

`src/engine` is plain TS (no Preact): `frame.ts` (the frame owner), `bitmaps.ts` (decoded-bitmap cache), `gl.ts` (WebGL2 backend), `engine.ts` (`createEngine(canvas, frames, { gl?, onLost? })` returns `{ addLayer, removeLayer, invalidate, destroy }`; nothing runs while idle), `tiles.ts` (the tile layer).

- Frame owner: `createFrames` has one rAF per frame. Input, flights and invalidations (`frames.raf`, the viewport store's env) run first, then every `onFrame` applier gets the same `{x, y, zoom}`: the engine draws the canvas, `WorldLayer` and `MapView` write their CSS transforms (they no longer write them from `viewport.subscribe`). So a slow canvas frame can never show a different view than the pins and labels. A module-level instance (`frames` in `map/viewport.ts`) is used because the DOM layers mount before the engine and outlive it.
- Backend: WebGL2 (alpha, premultiplied, no antialias, `preserveDrawingBuffer: false`). Each decoded `ImageBitmap` is uploaded once (`texImage2D`, `generateMipmap`, `LINEAR_MIPMAP_LINEAR` / `LINEAR`, clamp; the paper repeats) and its texture is deleted when `bitmaps.ts` evicts the bitmap. One unit-quad buffer; per paper, preview and tile one `drawArrays` with a clip rect (`clipRect`, snapped to whole backing pixels like the 2D path, so no seams) and UVs. The paper is one full-screen quad with UVs in world units / 1024 (`paperUV`).
- Fallback: with no WebGL2 the same layer draws with 2D `drawImage`. On `webglcontextlost` drawing pauses and textures are re-uploaded from the bitmap cache on `webglcontextrestored`; if it does not come back in 2 s, `TileLayer` swaps in a fresh canvas drawn with 2D.
- Each frame builds a `Frame { x, y, zoom, dpr, w, h, rect, now }`; a layer is `{ id, order, draw(ctx2d), drawGL(gl), animating? }` and any `animating()` keeps the frames coming. Backing size is pane x min(dpr, 2). `TileLayer.tsx` only mounts the canvas, feeds the layer world, theme and level, and reports missing tiles. Why a canvas: an `<img>` per tile inside one CSS-scaled `will-change` layer made Android Chrome re-rasterize the huge layer on every scale change; why WebGL: 2D `drawImage` scaling of 256-1024 px bitmaps every frame was the main-thread cost on phones. `window.__sgTiles` (`drawn`, `cached`, `lastDrawMs`, `view`, `gl`) and `window.__sgAlpha` (centre alpha per draw) are read by e2e only.

## Code

- `src/gen`: seeded isomorphic generator (`world`, `estate`, `hood`) and the SVG layer functions in `render.ts`.
- `server/`: `plan.ts` (hash everything), `apply.ts` (render, flatten, publish), `store.ts` (data dir, releases, GC), `config.ts` (YAML), `index.ts` (Hono, watcher, SSE), `sg.ts` (CLI).
- `src/map`: `viewport.ts` is the own pan/zoom store (wheel, drag, pinch, animated flights) and the pin layer's transform; the tile canvas follows it. `src/engine`: the canvas map engine. Chips and path labels fade out by on-screen size (see `MapView`).
- `src/mock`: data and the fake live engine. `src/Boring.tsx`: Boring.dc.html.
- URL helpers: `?theme=night`, `?style=boring`, `?select=copperleaf-site`, `?panel=inventory|links`, `?still=1` (freeze the mock scene).
