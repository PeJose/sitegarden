# Perf results

Appended by `pnpm perf`. See README.md.

## Top costs (baseline, commit dd1d851, Apple M1 Pro, headless Chrome 159 on Metal, 1440x900, dpr 1, 60 Hz)

Ranked by measured effect. "Off" numbers come from one-off experiments on the same build: the same measurement with a CSS rule injected that switches the thing off (`animation:none`, `filter:none`, `display:none`); they are single runs, treat +-1 point as noise. GPU % is the GPU process CPU time over the window (idle 8-10 s, pan/zoom 3 s). Paint area from the trace is not usable (the Paint cull rect is a huge nominal rect, up to 2.8e14 px2 for the world layer), so paint count is the signal.

| rank | item | measured |
|---|---|---|
| 1 | H1 animations in the world SVG | Idle (`light-still`) GPU 21-23 %, 180 paints/s (3 per frame, also with `?still=1`: still does not stop CSS/SMIL animations). With every CSS animation off: 0.3 %, and 0 recurring paints. Pausing SMIL alone (`pauseAnimations`): no change, so the CSS animations (star twinkle, flicker, march) carry it. During pan, animations off: 27.4 -> 13.5 %, paints 747 -> 93. |
| 2 | H2 `feDisplacementMap` wash + glow filters | `filter:none` with animations still running: idle 21.4 -> 14.7 % (about a third of idle GPU is filter work inside the repaints). Night is the same GPU (22.7 %) but style recalc 332 ms vs 100 ms per 10 s. |
| 3 | H4 `useViewport` render per pan frame | Main thread during a 3 s pan: scripting 180-225 ms (6-7 %), style 21-36 ms, 0 long tasks, 60 fps. Under 4x CPU throttle: scripting 677 ms (23 %), style 82 ms, still 60 fps, 0 long tasks. Not a bottleneck yet, grows with throttle. (Separate finding: hiding the React Flow pins drops pan GPU 13.4 -> 4.4 %, so the pin layer is a bigger pan cost than H4's JS; not in the H list.) |
| 4 | H5 labels / LOD per zoom frame | `zoom` 3 s: style 54-75 ms, layout 34-36 ms, scripting 59-94 ms, 0 long tasks, 59.8 fps. Hiding SVG text: layout 36 -> 11 ms, GPU 17.3 -> 13.2 %. |
| 5 | H3 paper texture | Bytes: 1.66 MB of 4.67 MB loaded at this zoom (light; night 1.47 MB), files on disk 4.1 MB light / 3.6 MB night at level 3 (z3). GPU effect: hiding the 204 800 px div changed nothing measurable (idle 21.4 -> 21.2 %, pan 27.4 -> 26.7 %), so H3 is a download/memory cost, not an idle GPU cost, at dpr 1. Decoded size/memory not measured. |
| 6 | H6 tile decode / opacity transition | Not measurable here: 0 ms of `Decode Image` on the main thread in every trace (tiles come from localhost, all loaded before measuring, no new tiles during pan at this zoom). Needs a pan that loads fresh tiles on a throttled network; not done. |
| 7 | H7 one JS bundle | 552 KB file (213 KB transferred), tiles-visible at 210-250 ms on localhost. Cold load on a real network not measured. |

Not measured: the specified pan "at a zoom showing level-2 tiles" (the script pans at the initial zoom 0.34, level 1; the vertical drag moved the map, x is clamped by the pan extent), the throttled-network load, real long tasks (none occurred in any scenario, so the 55 fps / 50 ms budgets already hold on this machine for pan and zoom; the budget that fails is idle GPU, 20-23 % vs < 10 %).

## 2026-11-23 baseline

commit 9a5d331 · 159.0.8154.13 · Apple M1 Pro · 1440x900 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":241,"bytes":{"total":4671552,"texture":1659778,"tiles":2598914,"js":213137},"gpuPct":22.4,"fps":60,"paints":1803,"paintAreaMpx":169166876080.39,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":100,"layout":41,"script":27,"paint":166,"decode":0}}
{"scenario":"night","zoom":0.340909,"loadMs":227,"bytes":{"total":4289938,"texture":1470374,"tiles":2408366,"js":213137},"gpuPct":22.7,"fps":60,"paints":1805,"paintAreaMpx":169448351024.84,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":332,"layout":59,"script":32,"paint":205,"decode":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":225,"bytes":{"total":4671552,"texture":1659778,"tiles":2598914,"js":213137},"gpuPct":23.2,"fps":60,"paints":1800,"paintAreaMpx":168885400413.03,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":81,"layout":34,"script":19,"paint":147,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":217,"bytes":{"total":4289938,"texture":1470374,"tiles":2408366,"js":213137},"gpuPct":19.2,"fps":60,"paints":1800,"paintAreaMpx":168885400413.03,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":317,"layout":58,"script":28,"paint":210,"decode":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":219,"bytes":{"total":4671552,"texture":1659778,"tiles":2598914,"js":213137},"gpuPct":27.1,"fps":60,"paints":752,"paintAreaMpx":52636091475.77,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":21,"layout":6,"script":179,"paint":19,"decode":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":209,"bytes":{"total":4671552,"texture":1659778,"tiles":2598914,"js":213137},"gpuPct":29.4,"fps":59.8,"paints":2112,"paintAreaMpx":347903156468.64,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":54,"layout":34,"script":59,"paint":26,"decode":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":211,"bytes":{"total":4671552,"texture":1659778,"tiles":2598914,"js":213137},"gpuPct":23,"fps":60,"paints":757,"paintAreaMpx":53199042087.46,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":82,"layout":19,"script":677,"paint":80,"decode":0}}
```

## 2026-11-23 diff-check

commit 9a5d331 · 159.0.8154.13 · Apple M1 Pro · 1440x900 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light-still","zoom":0.340909,"loadMs":219,"bytes":{"total":4671552,"texture":1659778,"tiles":2598914,"js":213137},"gpuPct":18.8,"fps":60,"paints":1803,"paintAreaMpx":169166876080.39,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":80,"layout":40,"script":23,"paint":179,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":226,"bytes":{"total":4289938,"texture":1470374,"tiles":2408366,"js":213137},"gpuPct":23.6,"fps":60,"paints":1800,"paintAreaMpx":168885400413.03,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":336,"layout":60,"script":29,"paint":206,"decode":0}}
```

## 2026-11-23 baseline-dpr2

commit fb56601 · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 2 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":236,"bytes":{"total":15014006,"texture":5546414,"tiles":9054732,"js":213137},"gpuPct":21.4,"fps":60,"paints":1802,"paintAreaMpx":169167963189.62,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":97,"layout":38,"script":22,"paint":203,"decode":0}}
{"scenario":"night","zoom":0.340909,"loadMs":241,"bytes":{"total":13777838,"texture":4871717,"tiles":8494923,"js":213137},"gpuPct":17,"fps":60,"paints":1807,"paintAreaMpx":170012388020.69,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":277,"layout":53,"script":23,"paint":193,"decode":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":228,"bytes":{"total":15014006,"texture":5546414,"tiles":9054732,"js":213137},"gpuPct":20.4,"fps":60,"paints":1800,"paintAreaMpx":168886488245.17,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":109,"layout":46,"script":23,"paint":240,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":251,"bytes":{"total":13777838,"texture":4871717,"tiles":8494923,"js":213137},"gpuPct":21.5,"fps":60,"paints":1800,"paintAreaMpx":168886488245.17,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":253,"layout":46,"script":24,"paint":147,"decode":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":240,"bytes":{"total":15014008,"texture":5546414,"tiles":9054732,"js":213137},"gpuPct":28.7,"fps":60,"paints":841,"paintAreaMpx":52637011573.61,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":21,"layout":6,"script":205,"paint":19,"decode":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":223,"bytes":{"total":15019754,"texture":5546414,"tiles":9054732,"js":213137},"gpuPct":28.1,"fps":59,"paints":2765,"paintAreaMpx":554787793363.41,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":65,"layout":35,"script":81,"paint":29,"decode":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":226,"bytes":{"total":15014008,"texture":5546414,"tiles":9054732,"js":213137},"gpuPct":25.2,"fps":59.6,"paints":851,"paintAreaMpx":52918509340.17,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":92,"layout":28,"script":766,"paint":80,"decode":0}}
```
