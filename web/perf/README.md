# Performance procedure

Measures the production build in system Chrome (headless, real GPU through ANGLE/Metal; if Chrome reports software rendering the script falls back to an off-screen headed window and says so). Results are appended to `results.md` with date, commit, Chrome version, machine, mode and GPU.

## Prerequisites

Google Chrome installed, `pnpm install`, and the API on :8787 (`pnpm dev:server`, wait until `http://localhost:8787/api/release` answers and the tiles are rendered).

## Run

```
cd web
pnpm build
pnpm preview &            # http://localhost:4173, proxies /api and /a to :8787
pnpm perf --label my-change --baseline perf/baseline
```

Options: `--url` (default http://localhost:4173), `--out` (screenshots, default `perf/out`, git-ignored), `--only pan,zoom`, `--baseline <dir>`. Stop `pnpm preview` when done. Seven JSON lines are printed (the two fly scenarios only with `--only fly,fly-warm`) and one block is appended to `results.md`. Compare with the "baseline" block, same machine only.

Scenarios: `light`, `night` (animated scene, 10 s idle), `light-still`, `night-still` (`?still=1`, also saves the screenshot), `pan` (3 s drag), `zoom` (3 s wheel in and out), `pan-4x` (pan with CPU throttled 4x). Only with `--only fly,fly-warm`: `fly` (cold context; after tiles-visible click the last sidebar plot, measure the click plus 1.5 s) and `fly-warm` (one untimed flight to the first plot, then click the second plot and back, 3 s): the first-click stutter of task 2.5. Extra fields: `tileReqs` (tile requests in the window), `ms.decode` (main-thread `Decode*` trace events), `ms.decodeAllThreads` (`ImageDecodeTask` on every thread; these two scenarios also trace `disabled-by-default-devtools.timeline`). Every scenario starts in a fresh, cold browser context with the service worker blocked, 1440x900, dpr 1 (`--dpr 2` for retina; the screenshot diff is skipped then).

## Numbers

- `zoom`: map zoom at measurement start. `loadMs`: `tiles-visible` mark.
- `bytes`: transferred up to tiles-visible (`total`, `texture`, `tiles`, `js`).
- `gpuPct`: GPU process CPU time / wall time during the window. Budget: idle < 10 %.
- `fps`: page-side requestAnimationFrame count / seconds (capped by the display, 60 headless). Budget: pan >= 55, pan-4x >= 50.
- `paints`: Paint events in a `devtools.timeline` trace; idle should be near 0. `paintAreaMpx` / `maxPaintMpx` use the nominal paint clip and are not a real painted area; use the count.
- `longTasks`, `longTaskMs`, `maxLongTask`: main-thread tasks over 50 ms in the window.
- `ms`: top-level trace time for style recalc, layout, scripting, paint and image decode.

## Screenshot check

`light-still.png` / `night-still.png` are compared with `--baseline` (mean absolute difference over 0.5 % or more than 2 % of values off by over 16/255 fails, exit code 1). To accept a new look on purpose, copy `perf/out/*.png` over `perf/baseline/`.
