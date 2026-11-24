# Proposal

## Why

The frontend research (2026-11-24) showed that React Flow and React are about 155 KB of the 178 KB gzip main chunk, while we use React Flow only for pan, zoom, pinch, the pan extent, animated viewport moves and placing pins. Step 1 of the agreed path (own viewport → Preact → GPU work) removes React Flow without changing how the map looks or feels.

## What Changes

- An own viewport for the map: drag to pan, wheel and pinch to zoom, zoom buttons, the existing pan extent and min zoom (`src/lib/view.ts`), animated moves for fly-to and the hero slide, and a viewport store the existing imperative transform reads.
- Pins are placed in world coordinates by our own layer; node and pane clicks keep working.
- `@xyflow/react` is removed.
- Per-extension error isolation in `src/ext/tree.ts`: a throwing extension renders a small "plugin X failed" card and the rest of the map keeps working.

## Capabilities

### New Capabilities
- `map-viewport`: how the owner moves around the map and how pins stay attached to the world.

### Modified Capabilities

## Impact

- Web: `src/map/MapView.tsx`, `WorldLayer.tsx`, `PinNode.tsx`, `src/App.tsx`, `src/ui/{Hero,Controls,Debug}.tsx`, new `src/map/viewport.ts`; `src/ext/tree.ts` boundary; `package.json` drops `@xyflow/react`.
- No server change. Version bump (minor).
- Out of scope: the Preact swap and GPU work (next steps).
