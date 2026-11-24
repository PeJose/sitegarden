# Design

## Context

React Flow (`@xyflow/react` 13) renders `<ReactFlow>` with all editing features off; we use its d3-zoom based pan/zoom/pinch, `panExtent`/`minZoom`, `setViewport` with duration (fly-to in `useFlyTo`, the hero slide, `Controls` zoom buttons), the viewport store (`useViewportStore`, `useReactFlowStoreApi`) that the perf pass reads to write `.world`, `.paper` and `Anchored` transforms imperatively, node positioning for pins (`PinNode` as a node type) and node/pane click handlers. `src/lib/view.ts` already has `clampViewport`, `panExtent`, `minZoom`, `levelFor`. Perf baseline and procedure: `perf/README.md`, `perf/results.md`.

## Goals / Non-Goals

**Goals:** identical look and feel; same or better perf numbers; smaller bundle. **Non-Goals:** Preact, GPU work, new interactions.

## Decisions

### D1. Viewport store
`src/map/viewport.ts`: a tiny external store `{ x, y, zoom }` with `get`, `set`, `subscribe`, plus `useViewport(selector)` via `useSyncExternalStore` for the few React readers that need zoom (labels, LOD). Existing imperative subscribers (the `.world`, `.paper`, `Anchored` writers) subscribe directly, as they do to React Flow's store today. The viewport element gets the same CSS transform React Flow applied (`translate(x,y) scale(zoom)`), on the same element class names the CSS relies on (rename only if the CSS is updated in the same commit).

### D2. Input
Pointer Events on the pane: one pointer drags (with `setPointerCapture`); two pointers pinch (distance ratio, midpoint anchor); `wheel` with `ctrlKey` = trackpad pinch (zoom by `exp(-deltaY * k)`), plain wheel = zoom like React Flow's default (match its zoom step so feel is unchanged), all `passive: false` only where `preventDefault` is needed. Zoom keeps the anchor point fixed. Every update goes through `clampViewport(…, panExtent(…))` and min/max zoom. Updates are applied once per animation frame (rAF-coalesced). A click is a pointerup within 4 px / 300 ms of pointerdown; it hit-tests pins by DOM target (pins stay DOM elements) or reports a pane click.

### D3. Animated moves
`animateTo(target, ms, ease)` interpolates x, y and zoom (zoom in log space) with the easing React Flow used (`d3-ease` cubicInOut equivalent written inline), clamped to the extent at the target as `clampViewport` already does; returns a promise; a new user gesture or new animation cancels the running one. `useFlyTo`, the hero slide and `Controls` call it with their current durations.

### D4. Pins layer
Pins render in an absolutely positioned layer inside the transformed viewport element at `translate(worldX, worldY)` with the same inverse scale handling (`--pin-k`) used today; React keys and `PinNode` props unchanged. Node data comes from the same source as today's React Flow `nodes` array.

### D5. Extension boundary
`resolve()` in `src/ext/tree.ts` wraps each extension render in a small class `ErrorBoundary` keyed by extension id; fallback is a `.ext-failed` card with the id (styled from theme tokens), and the error is logged once. Works unchanged under preact/compat later.

### D6. Measurement
Before any code change, build main and run `pnpm perf --only light,pan,pan-4x,zoom,zoom-4x` 3 times; after the change the same, interleaved (A/B/A/B/A/B, see perf/README.md); plus `light-still,night-still` screenshot diff; plus bundle size from `vite build` output. Append an "own-viewport" block to `perf/results.md`.

## Risks / Trade-offs

- [Feel differs from d3-zoom (wheel step, inertia)] → match React Flow's defaults by reading its source in node_modules before removing it; side-by-side check of wheel step numerically in a test.
- [Safari gesture events for trackpad pinch] → `wheel` + `ctrlKey` covers Safari ≥ 14 on macOS; iOS uses touch pointers.
- [Imperative writers rely on React Flow internals] → D1 keeps the same subscription shape.

## Migration Plan

One PR. Version 0.6.0 if it lands after 0.5.0, else next minor; CHANGELOG entry.
