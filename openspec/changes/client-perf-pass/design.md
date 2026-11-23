# Design

## Context

See proposal.md for why. The map is three stacked layers inside `MapView`:

- `.world` (`WorldLayer.tsx`): one `div` with `transform: translate() scale()` updated from `useViewport()` on every pan/zoom frame. It holds the server tiles (`TileLayer`), a world-sized live SVG (`Live`) and a world-sized label SVG (`Labels`).
- React Flow on top: one `PinNode` per node (rough.js paths, cached per id+status), chips sized by CSS variables set on a wrapper in `MapView` on every zoom change.
- UI panels (hero, command bar, status strip) as HTML over the map. No `backdrop-filter` is used.

What runs continuously today, regardless of activity (from `index.css` and `WorldLayer.tsx`):

| Animation | Where | Paint area |
|---|---|---|
| `.march` dash offset on flowing roads | `Live` SVG | whole world SVG |
| lantern `<animateMotion>` + `filter=url(#glow)` | `Live` SVG, night | whole world SVG |
| `.tw1/2/3` star twinkle, `.fireglow/.flame` flicker | `Live` SVG, night | whole world SVG |
| red wash `filter=url(#aq)` (`feDisplacementMap`) | `Live` SVG, every building, `opacity: 0` when healthy | whole world SVG, filter re-evaluated on repaint |
| `.pulse` on down pins | pin SVG | 34 px pin (fine) |

A single animated element inside a world-sized SVG invalidates that SVG, and inside a scaled layer the browser re-rasterises it, filters included. That matches "300% GPU while idle". The paper `div` in `TileLayer` is 204 800 px square inside the same transformed layer.

Tools at hand: `playwright-core` (devDependency), `web/src/perf.ts` (page-load marks + long tasks), `?still=1` freezes the mock scene, `pnpm build && pnpm preview` gives the production build.

## Goals / Non-Goals

**Goals:**
- A scripted, repeatable measurement (idle GPU %, pan fps, long tasks) run against the production build.
- Fix the measured hot spots so the budgets in `specs/map-performance/spec.md` hold.

**Non-Goals:**
- The M2 flow canvas (rAF lanterns/pulses from `flow.started` events). This change only stops the current SVG animations from costing a world-sized repaint; it does not build the canvas.
- Server render pipeline speed (tile baking cost is M8).
- New visuals or changes to the look.

## Decisions

### D1. Measure with a Playwright script, not by hand
`web/scripts/perf.ts` (run as `pnpm perf`) launches system Chrome via `playwright-core` (`channel: 'chrome'`, headed, real GPU), opens the preview build and runs three phases:

1. **load**: reads `window.__perf` (existing `perf.ts`).
2. **idle**: 10 s with no input. GPU % from CDP `SystemInfo.getProcessInfo` (the `GPU` process `cpuTime`), sampled at start and end. Paint count from a CDP trace (`devtools.timeline` category, count `Paint` events).
3. **pan**: 3 s of `page.mouse` drags; fps from a page-side `requestAnimationFrame` counter; long tasks from the existing observer.

It prints one JSON line per scenario (`light`, `night`, `light-still`, `night-still`, `pan`, `pan-4x` via CDP `Emulation.setCPUThrottlingRate`) and appends it to `web/perf/results.md` with date, commit and label.

Why: by-hand DevTools numbers drift between runs and can't be compared later. Alternative: Lighthouse — no idle/pan scenario, rejected.

### D2. Animated things get their own small boxes
Split `Live` so the world-sized SVG holds only static content (stars, lit windows, fires at rest). Each animated element (flowing road, lantern, wash fading in) renders in its own absolutely positioned SVG sized to its bounding box (road bbox from its path; `getBBox` is not needed, the generator knows the road points). The browser then repaints only those boxes.

Alternative: move all animation onto one canvas now (the M2 flow canvas). Rejected for this change: it's 3 days of M2 work and changes event plumbing; small boxes get the same win for the current scene.

### D3. Ambient night animation is static
Star twinkle and fire flicker stop being infinite CSS animations: stars and fires render at a fixed phase. Their only job is mood, and the v4.2 boards are static. They may come back later on the M2 canvas, gated by the same "only while visible" rule.

### D4. Red wash only for down buildings, no live displacement filter
Mount the wash only when a building is down (fade in with CSS opacity on its own small box, D2). Replace the live `filter=url(#aq)` with the same filter applied once to a small SVG and rasterised to an `<img>` (data URL via `XMLSerializer` + `Image`, or a server artifact if the design scene shows that's simpler); the fade then animates opacity of a bitmap, which the compositor does without repainting.

If the profile shows a live filter on a 140-unit box is already cheap, keep the filter and only do the mount change. Decide from the numbers and log them.

### D5. Paper background follows the viewport, not the world
Replace the 204 800 px `div` with a viewport-sized element outside `.world` whose `background-position` and `background-size` follow the viewport transform (1024 × zoom, offset by `vp.x`, `vp.y` mod size). Same texture, same seam continuity, a layer the size of the screen.

### D6. Stop work when hidden or still
`.march`, `.pulse` and lantern animations get `animation-play-state: paused` while `document.hidden` (one class on the root, set by a `visibilitychange` listener). React re-renders on viewport change stay as they are unless the profile shows `Labels` or `TileLayer` as long tasks; if it does, memoise their per-zoom output (labels only change with zoom, tiles only when the tile set changes).

### D7. Verify the look by screenshots
The perf script also saves `light-still.png` and `night-still.png` at a fixed viewport before and after. A pixel diff (sharp is installed: `sharp(a).composite` difference + stats) must stay under a small threshold outside animated boxes. Compare once by eye against `design/v42-*.preview.html`.

## Risks / Trade-offs

- [GPU % differs by machine] → budgets are for the owner's laptop; the log records machine, Chrome version and commit next to every number.
- [Headless Chrome uses SwiftShader, not the GPU] → the script runs headed with `channel: 'chrome'`.
- [Rasterising the wash once loses its per-frame wobble] → the boards show it static, so nothing is lost.
- [Static stars/fires feel less alive at night] → accepted for now; M2's canvas can bring motion back cheaply.

## Migration Plan

Client-only. No data or API changes; rollback is reverting the commit.
