# Proposal

## Why

A map that is rendered once should only be displayed. On a phone, panning and pinching still make the browser recompute things every frame: the SVG estate and road labels (font size clamped to the screen, road labels fading by zoom), pin and chip sizes and opacity, and Preact re-renders when the visible tile range changes. Those recomputations are what lag on a phone; the GPU can move finished pictures almost for free.

## What Changes

- Estate and road names are baked into the server tiles per level (sized for that level, road names only on levels where they are readable), like the rest of the static map. The SVG `Labels` layer is removed from the browser. Renderer version bump: every artifact re-renders once.
- During a gesture the browser does one thing per frame: the engine frame applies the viewport to the canvas (WebGL) and one CSS transform to each DOM layer. No Preact render, no layout, no style change. Pins, chips and the live layer scale with the map while the gesture runs; 200 ms after it rests they settle to their exact on-screen size and the tile level updates (one render).
- Wanted and missing tile cells are computed inside the engine from the frame, not through Preact state.
- The user agreed to try it and to tune it afterwards. Version 0.12.0 (visible change: labels are part of the map art and scale with it until the zoom rests).

## Capabilities

### Modified Capabilities
- `map-tiles`: labels in tiles, zero recomputation during gestures.

## Impact

- `src/gen/render.ts` (labels layer), `server/apply.ts`/`plan.ts` (compose it into tiles, renderer bump), fonts for the server renderer, `src/map/WorldLayer.tsx` (Labels removed, no `setView` during gestures), `src/map/MapView.tsx` (pins/chips settle), `src/engine/*` (wanted cells), `src/map/viewport.ts` (`useSteppedZoom` replaced by settle), docs, tests.
