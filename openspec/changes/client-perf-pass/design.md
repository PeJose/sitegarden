# Design

## Context

See proposal.md for why. The map is three stacked layers inside `MapView`:

- `.world` (`WorldLayer.tsx`): one `div` with `will-change: transform` and `transform: translate() scale()`, set from `useViewport()`, so React re-renders `WorldLayer`, `TileLayer` and `Labels` on every pan/zoom frame. It holds the server tiles, a world-sized live SVG (`Live`) and a world-sized label SVG (`Labels`).
- React Flow on top: one `PinNode` per node, sized by CSS variables (`--pin-k`, `--chip-o`, `--hover-k`) that `MapView` rewrites on every zoom frame.
- UI panels (hero, command bar, status strip) as HTML over the map. No `backdrop-filter`.

Hot spots found in the code (all to be confirmed by the baseline profile):

| # | What | Why it costs |
|---|---|---|
| H1 | Animations inside the world-sized `Live` SVG: `.march` dash offset, lantern SMIL `<animateMotion>` + `filter=url(#glow)`, star twinkle, campfire flicker | any change inside one SVG repaints the whole SVG; inside a scaled layer that is a world-sized re-raster, filters included, every frame, forever |
| H2 | Red wash per building: `filter=url(#aq)` (`feDisplacementMap`), mounted for every building at `opacity: 0` | the costly filter is part of every repaint caused by H1 |
| H3 | Paper texture: a 204 800 px square `div` inside `.world`, background = `layer-texture-*-z3` **PNG of 4.2 MB** (2048 px, ~16 MB decoded) | GPU rasters a huge scaled area; the biggest download on the page |
| H4 | `useViewport()` in `WorldLayer` / `Anchored` | full React render + tile-set recompute per pan frame, on the main thread |
| H5 | `Labels`: font size, letter spacing and stroke on every `textPath` change per zoom frame; LOD variables restyle every pin and chip per zoom frame | text relayout + world-sized SVG repaint + style recalc of all pins, per frame |
| H6 | Tiles: `<img>` without `decoding="async"`, opacity transition per tile, up to 48 kept mounted; preview `<img>` is world-sized | decode jank on the main thread during pan/zoom |
| H7 | One 565 KB JS bundle (Boring view, rough.js, generator) | slower first paint than needed |
| H8 | React Flow pin layer during pan (found in the baseline, task 2.8) | hiding pins cut pan GPU 13.4% → 4.4% |

Tools at hand: `playwright-core` (devDependency), `web/src/perf.ts` (page-load marks + long tasks), `?still=1` freezes the mock scene, `pnpm build && pnpm preview` gives the production build.

## Goals / Non-Goals

**Goals:**
- A scripted, repeatable measurement (idle GPU %, pan fps, long tasks, load time) on the production build.
- Fix the measured hot spots so the budgets in `specs/map-performance/spec.md` hold, with every animation kept exactly as it looks today.

**Non-Goals:**
- The M2 flow canvas. Nothing here pre-empts it.
- Server tile baking speed (M8).
- Any change to the look or to what animates.

## Decisions

### D1. Measure with a Playwright script, not by hand
`web/scripts/perf.ts` (`pnpm perf`) launches system Chrome via `playwright-core` (`channel: 'chrome'`, new headless mode with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, so no window opens and the real GPU is used; the script reads `SystemInfo.getInfo`, prints the GPU in the results block, and if it is software rendering falls back to headed but off-screen and unthrottled) against the preview build:

1. **load**: `window.__perf` from `perf.ts`, plus bytes transferred (CDP `Network`).
2. **idle**: 10 s with no input. GPU % from CDP `SystemInfo.getProcessInfo` (`GPU` process `cpuTime` delta), paint events and painted area from a `devtools.timeline` trace.
3. **pan / zoom**: 3 s of `page.mouse` drags and wheel zoom; fps from a page-side rAF counter; long tasks from the existing observer. Repeated with `Emulation.setCPUThrottlingRate(4)`.

Scenarios: `light`, `night`, `light-still`, `night-still`, `pan`, `zoom`, `pan-4x`. One JSON line each, appended to `web/perf/results.md` with date, commit, Chrome version and label. Also saves `light-still.png` / `night-still.png` for D9.

Alternative: Lighthouse. No idle or pan scenario, rejected.

### D2. Every animation gets its own compositor layer (H1, H2)
The cost is not the animations, it's where they live. Keep the markup and CSS of each animated thing as is, but render it in its own small absolutely positioned wrapper (`<div class="fx">` with a tiny SVG sized to the element's box, sharing the existing hidden `<defs>`), outside the world-sized `Live` SVG:

- **Star twinkle, fire flicker, down pulse, wash fade:** they only animate `opacity` and `transform`. Move the CSS animation from the SVG `<g>` to the wrapper `div` with `will-change: opacity` / `transform`. The compositor then runs them off the main thread with **zero repaint**; the SVG inside (filters included) is rasterised once. Same keyframes, same timing.
- **Lantern:** replace SMIL `<animateMotion>` (main thread, repaint) with a Web Animations API `transform: translate()` animation over points pre-sampled from the road path (`getPointAtLength` once, ~48 points, `easing: linear`, same 3.2 s loop). Compositor-run, same motion. The glow filter is rasterised once with the lantern.
- **Marching dashes:** `stroke-dashoffset` cannot run on the compositor, so each flowing road gets its own wrapper sized to the road's bbox. Repaint shrinks from world-sized to one road while a flow runs, and stops when it ends. If the profile still shows it, the fallback is a dash pattern image translated along the road, decided by numbers, not up front.
- **Red wash:** mount only while a building is down (fade in via the wrapper's opacity), so healthy buildings carry no filter at all.

Number of extra layers: one per star cell, fire, lantern, flowing road and down building. Stars are the only large group; if layer count shows up in the profile, stars share a few layers by twinkle class (`tw1`/`tw2`/`tw3` → 3 layers), which keeps the three phases.

Alternatives: rasterising effects to images or freezing ambient animation (rejected: changes the look); one canvas for everything now (rejected: that is M2's flow canvas, 3 days, new event plumbing).

### D3. Paper texture: viewport-sized, WebP (H3)
Replace the 204 800 px `div` with a screen-sized element outside `.world` whose `background-size` is `1024 × zoom` and `background-position` the viewport offset modulo that size. Same texture, same seams, one screen of raster. Server: emit the texture as WebP like the tiles (`apply.ts` already uses sharp), and the client picks the level by on-screen size like tiles. Expected: 4.2 MB → a few hundred KB.

### D4. Drive the transform imperatively (H4)
Subscribe to React Flow's viewport through its store (`useStoreApi().subscribe`) and write `style.transform` of `.world` and the D3 background directly in the subscription. React re-renders only when the visible tile set or the zoom level changes (computed in the subscription, compared, then `setState`). `Anchored` uses the same subscription to move the popover without a React render.

### D5. Labels and level of detail follow zoom in steps (H5)
Quantise zoom for label font size and the LOD CSS variables to steps (e.g. 1/16 of a doubling) and apply them only when the step changes, plus once on `onMoveEnd`. During a continuous zoom the labels scale with the map and snap to their exact size a few times per doubling. Moving the LOD variables from the React Flow wrapper to the `.react-flow__viewport` element limits style recalc to pins.

### D6. Tiles decode off the main thread (H6)
`decoding="async"` on tile and preview `<img>`, `img.decode()` before fading a tile in, and `content-visibility`/`contain: strict` on the preview. Lower `KEEP` only if memory shows up in the profile.

### D7. Split the bundle (H7)
`Boring`, `Panels` and `Popover` as `React.lazy` chunks; rough.js stays in the main chunk because pins need it on first paint. Check with `vite build` output.

### D8. Hidden tab and reduced motion
CSS animations on composited layers already stop in hidden tabs; WAAPI lanterns are paused on `visibilitychange`. The existing reduced-motion rule keeps covering every class after D2 (classes move to the wrappers, so the selector list is updated with them).

### D9. Verify the look by screenshots
The perf script compares `?still=1` light and night screenshots against the committed baseline with sharp (difference + stats) and fails over a small threshold, so no fix silently changes the map. Once by eye against the v4.2 Light and Night boards in the design artifact (the private design artifact).

## Risks / Trade-offs

- [GPU % differs by machine] → budgets are for the owner's laptop; every logged number carries machine, Chrome version and commit.
- [Headless Chrome may use SwiftShader] → the script launches system Chrome headless with ANGLE/Metal flags and checks the GPU through CDP `SystemInfo.getInfo`; on software rendering it falls back to an off-screen headed window. The mode and GPU are logged with every result.
- [Too many compositor layers cost memory] → stars grouped by twinkle class (D2); the profile's Layers panel decides.
- [Imperative transform drifts from React Flow's state] → one source (the React Flow store), written in its own subscription; a test pans and checks the tile layer and pins stay aligned (screenshot at rest).
- [Snapping labels during zoom is visible] → step small enough to read as smooth; check by eye, adjust the step.

## Migration Plan

Client changes plus one server change (texture as WebP, D3), which produces new content-addressed artifacts on the next `sg apply`; old PNGs are garbage-collected as today. Rollback is reverting the commit and re-running apply.
