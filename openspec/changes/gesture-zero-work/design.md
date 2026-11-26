# Design

## Context

Builds on the engine (`src/engine/`, WebGL tile backend, one frame owner that applies the viewport to the canvas and registered DOM appliers in the same rAF; 0.11.3). Labels today: `Labels` in `src/map/WorldLayer.tsx`, SVG text: estate tags at `e.tag.{x,y,text}`, font `600 Outfit`, on-screen size clamped 11–17 px (`px(13, 11, 17)`), letter-spacing 0.2em, halo stroke fe/3 (`--est`, `--est-halo` per theme); road names on `textPath` along `r.labelPath` at `r.labelAt`, `500 JetBrains Mono`, clamp 9.5–13.5 px and never wider than 11.5·1.35 world units, opacity `(11.5·zoom − 7)/2` clamped 0..1, halo `--road-halo`. Tiles: `T = 512` world units, `SCALE = [0.125, 0.5, 1, 2]` px/unit, level chosen by `levelFor(zoom, dpr ≤ 2)` with the 0.9 factor.

## Decisions

### D1. Labels layer in the renderer
`labelsSvg(w: World, t: Theme, v: Box, z: number)` in `src/gen/render.ts` emits the same text elements as `Labels` (same fonts, colors per theme from the theme tokens, halo via `paint-order: stroke`), with font sizes fixed per level: evaluate the client clamp at the level's representative zoom `zr = SCALE[z] / 2` (a dpr-2 screen shows level z around that zoom); road names are emitted only when their opacity at `zr` is ≥ 0.5. It is composited as the top layer of every flattened tile of that level and theme (and the preview at level 0: estate names only). Plot-local layers stay as they are.

### D2. Fonts on the server
The server renderer must draw Outfit 600 and JetBrains Mono 500 identically everywhere (dev Mac, Docker). Check which SVG rasterizer `server/apply.ts` uses and how it resolves fonts. Bundle the two fonts (OFL, `server/fonts/*.ttf` + license file) and load them explicitly (fontconfig file pointed by env in the renderer process, or the rasterizer's font option). If text cannot be rendered deterministically with the current rasterizer, stop and report instead of adding a dependency.

### D3. Renderer bump
`RENDERER = 'r9'`: every artifact re-renders once (~3 min on a 1-CPU dev box, ~14 min on the throttled server). CHANGELOG says so.

### D4. Nothing recomputes during a gesture
- `Labels` and `useSteppedZoom` are removed.
- The engine computes the visible cells, wanted tiles and missing cells from each frame; `TileLayer` no longer gets a `view` prop through Preact for that. Missing cells go to `/api/want` from the engine (same 150 ms debounce). The settled level lives in the engine (same 200 ms rule; zoom-out lowers at once).
- DOM layers (`.world` live layer, pins/chips layer) get only a transform from the frame applier during a gesture. Pins and chips are laid out for the settled zoom `zs`; during a gesture their layer transform includes the factor `zoom / zs`, so they scale with the map. 200 ms after the zoom rests, `zs` updates with one Preact render (sizes, chip opacity), and the layer factor returns to 1.
- A pan without zoom change never renders Preact.

### D5. Verification hooks
`window.__sgRenders` (dev/test only: a counter incremented by the map components' render) and the existing `__sgTiles`. E2E asserts 0 map renders during a scripted pan and during a pinch until it rests.

## Testing

Unit: label font size per level (clamp at `zr`), road label visibility per level, the pin layer factor `zoom/zs`. Snapshot: render one tile with labels on the dev box and in Docker; pixel-identical (fonts deterministic). E2E: 0 renders during pan and pinch, labels visible in the tile at default view (pixel sample at an estate tag), existing tests. Headless phone harness: main-thread, layout and style time during pan and pinch before/after (target: layout and style ≈ 0 during the gesture). Real phone check by the owner (and over adb when connected).

## Risks / Trade-offs

- [Labels scale with the map until the level changes] → accepted by the user as a try; tune afterwards.
- [Full re-render on upgrade] → once; documented.
- [Fonts on the server] → bundled; D2 stops if not deterministic.
