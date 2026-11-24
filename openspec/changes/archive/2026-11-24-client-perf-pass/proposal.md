# Proposal

## Why

With the POC map open, Chrome's GPU process sits at ~300% even when the map is idle and fully loaded, and pan/zoom feels slow (observed 2026-11-20, PLAN.md M1 item 7). The rest of M1 adds more UI on top of this map, so the cost has to be measured and fixed now, while the client is still small.

## What Changes

- Add a repeatable profiling procedure (dev vs production build, idle vs pan) with recorded baseline numbers, so fixes are judged by data, not guesses.
- Fix what the profile ranks highest. Seven hot spots found in the code (design.md H1–H7): animations inside one world-sized SVG, live displacement filters on every building, a 4.2 MB PNG paper texture on a 204 800 px layer, a React render per pan frame, per-frame label/LOD restyling, main-thread tile decoding, one 565 KB bundle.
- Fixes move work to the compositor and out of React instead of rewriting features: every animation keeps its look and timing.
- Animations pause when the tab is hidden; reduced-motion keeps them off.
- No visual change: the map must still match the v4.2 Light/Night boards.

## Capabilities

### New Capabilities
- `map-performance`: performance budget of the map client (idle GPU, pan/zoom frame rate, animations only while something moves) and how it is measured.

### Modified Capabilities
<!-- none: no specs exist yet -->

## Impact

- Code: `web/src/map/*` (WorldLayer, TileLayer, MapView, PinNode), `web/src/index.css`, `web/src/gen/render.ts` (live night extras), `web/src/perf.ts`.
- Server: `web/server/apply.ts` emits the paper texture as WebP instead of PNG. No API or dependency changes.
- Runs before the monorepo restructure and the M1 core change; those move these files but do not change them.
