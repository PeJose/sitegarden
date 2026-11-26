# Proposal

## Why

On a real Android phone (Chrome, OnePlus 10T) the map tiles flash and look like they reload on every pinch and every pan after a zoom-out, so the map is unusable on mobile. 0.11.1 fixed what headless measurement could see (level churn, paper repaint, DOM reshuffle, label layout) but not this. The cause is the display model: every tile is an `<img>` inside one huge `will-change: transform` layer (`.world`, with a 40960-unit paper element) scaled by CSS. On a phone's small GPU tile budget Chrome re-rasterizes that layer after each scale change and drops raster tiles under memory pressure, which shows as tiles reloading. Desktop and headless have the memory, so they never show it.

## What Changes

- Server tiles, the whole-map preview and the paper texture are drawn into one `<canvas>` the size of the map pane, redrawn on viewport changes (one `requestAnimationFrame` per change), from decoded `ImageBitmap`s. No tile `<img>` elements, no CSS-scaled tile layer.
- A tile is fetched and decoded once and kept in a bounded cache; drawing picks, per visible cell, the sharpest decoded tile available (any level), falling back to coarser levels and the preview, so a zoom or pan never shows a hole that was filled before.
- Labels, live layer (wash, fires, flows), pins and chips stay as they are (DOM/SVG above the canvas). No animation or visual element is removed.
- Same tile URLs, levels, release/SSE behaviour, `/api/want` reporting, fly-to preloading and theme warm-up.
- Patch release 0.11.2 (behaviour fix, no API change).

## Capabilities

### New Capabilities
- `map-tiles`: how the browser displays server tiles.

## Impact

- `src/map/TileLayer.tsx` (rewritten as a canvas renderer), `src/map/WorldLayer.tsx` (paper/preview move into the canvas; `.world` keeps only labels/live), `src/map/tiles.ts` (cache of decoded bitmaps replaces `held`), `src/index.css`, `docs/rendering.md`, tests and e2e.
- The `map/layers` extension slot keeps working: `layer:garden:tiles` renders the canvas.
