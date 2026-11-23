# Proposal

## Why

With the POC map open, Chrome's GPU process sits at ~300% even when the map is idle and fully loaded, and pan/zoom feels slow (observed 2026-11-20, PLAN.md M1 item 7). The rest of M1 adds more UI on top of this map, so the cost has to be measured and fixed now, while the client is still small.

## What Changes

- Add a repeatable profiling procedure (dev vs production build, idle vs pan) with recorded baseline numbers, so fixes are judged by data, not guesses.
- Fix whatever the profile shows. Likely candidates found in the code (to confirm by profiling, not to fix blindly):
  - the live SVG overlay in `src/map/WorldLayer.tsx` spans the whole world inside the scaled `.world` layer and carries infinite CSS/SMIL animations (`march`, twinkling stars, campfire flicker, lantern `animateMotion`), so every frame repaints a world-sized layer;
  - the red wash per building uses `filter="url(#aq)"` (`feDisplacementMap`) live in the browser, and stays mounted at `opacity: 0` for healthy buildings;
  - the 204 800 × 204 800 px paper `div` in `src/map/TileLayer.tsx` under the transformed layer;
  - `Labels` and `TileLayer` re-rendering on every viewport change.
- Idle animations stop when nothing is happening and pause when the tab is hidden; reduced-motion keeps them off.
- No visual change: the map must still match the v4.2 Light/Night boards.

## Capabilities

### New Capabilities
- `map-performance`: performance budget of the map client (idle GPU, pan/zoom frame rate, animations only while something moves) and how it is measured.

### Modified Capabilities
<!-- none: no specs exist yet -->

## Impact

- Code: `web/src/map/*` (WorldLayer, TileLayer, MapView, PinNode), `web/src/index.css`, `web/src/gen/render.ts` (live night extras), `web/src/perf.ts`.
- No API, server or dependency changes expected. If a fix needs the server to bake something (e.g. pre-filtered red wash), that is called out in design.md.
- Runs before the monorepo restructure and the M1 core change; those move these files but do not change them.
