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

## 2026-11-23 2.1

commit 02ccdd3 (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":226,"bytes":{"total":4672383,"texture":1659778,"tiles":2598914,"js":213937},"gpuPct":14.8,"fps":60,"paints":1802,"paintAreaMpx":169166875357.48,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":101,"layout":44,"script":27,"paint":165,"decode":0}}
{"scenario":"night","zoom":0.340909,"loadMs":205,"bytes":{"total":4290771,"texture":1470374,"tiles":2408366,"js":213937},"gpuPct":17.3,"fps":60,"paints":1800,"paintAreaMpx":168885400413.03,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":257,"layout":34,"script":30,"paint":161,"decode":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":211,"bytes":{"total":4672385,"texture":1659778,"tiles":2598914,"js":213937},"gpuPct":12.5,"fps":60,"paints":1800,"paintAreaMpx":168885400413.03,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":108,"layout":43,"script":24,"paint":129,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":218,"bytes":{"total":4290769,"texture":1470374,"tiles":2408366,"js":213937},"gpuPct":18.9,"fps":60,"paints":1800,"paintAreaMpx":168885400413.03,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":290,"layout":37,"script":29,"paint":157,"decode":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":228,"bytes":{"total":4672383,"texture":1659778,"tiles":2598914,"js":213937},"gpuPct":16.9,"fps":59.7,"paints":865,"paintAreaMpx":55450916087.82,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":23,"layout":6,"script":274,"paint":14,"decode":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":214,"bytes":{"total":4672383,"texture":1659778,"tiles":2598914,"js":213937},"gpuPct":18.1,"fps":60.1,"paints":2149,"paintAreaMpx":347903164047.76,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":57,"layout":32,"script":72,"paint":27,"decode":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":228,"bytes":{"total":4672383,"texture":1659778,"tiles":2598914,"js":213937},"gpuPct":13.6,"fps":59.7,"paints":878,"paintAreaMpx":56013872482.85,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":78,"layout":22,"script":694,"paint":51,"decode":0}}
```

## 2026-11-23 2.1-dpr2

commit 02ccdd3 (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 2 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":234,"bytes":{"total":15014837,"texture":5546414,"tiles":9054732,"js":213937},"gpuPct":14.3,"fps":60,"paints":1800,"paintAreaMpx":168886488245.17,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":120,"layout":46,"script":28,"paint":179,"decode":0}}
{"scenario":"night","zoom":0.340909,"loadMs":219,"bytes":{"total":13778669,"texture":4871717,"tiles":8494923,"js":213937},"gpuPct":20,"fps":60,"paints":1802,"paintAreaMpx":169167963189.62,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":287,"layout":33,"script":31,"paint":148,"decode":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":221,"bytes":{"total":15014837,"texture":5546414,"tiles":9054732,"js":213937},"gpuPct":14.5,"fps":60,"paints":1803,"paintAreaMpx":169167965725.57,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":114,"layout":41,"script":28,"paint":156,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":226,"bytes":{"total":13778669,"texture":4871717,"tiles":8494923,"js":213937},"gpuPct":20.7,"fps":60,"paints":1803,"paintAreaMpx":169167965725.57,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":263,"layout":29,"script":29,"paint":142,"decode":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":220,"bytes":{"total":15014837,"texture":5546414,"tiles":9054732,"js":213937},"gpuPct":18.4,"fps":59.7,"paints":945,"paintAreaMpx":55452001919.33,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":22,"layout":6,"script":219,"paint":16,"decode":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":216,"bytes":{"total":15014837,"texture":5546414,"tiles":9054732,"js":213937},"gpuPct":18.5,"fps":59,"paints":2799,"paintAreaMpx":554787834151.03,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":66,"layout":36,"script":82,"paint":28,"decode":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":231,"bytes":{"total":15014837,"texture":5546414,"tiles":9054732,"js":213937},"gpuPct":16.3,"fps":59.8,"paints":966,"paintAreaMpx":55170575163.49,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":106,"layout":29,"script":815,"paint":71,"decode":0}}
```

### 2.1 note (animations on own layers; blocks "2.1" and "2.1-dpr2" above, baseline blocks "baseline" and "baseline-dpr2")

Idle GPU % / paints per 10 s, before -> after (single runs, +-3 points noise): dpr 1 light-still 23.2 -> 12.5 / 1800 -> 1800; night-still 19.2 -> 18.9 / 1800; light 22.4 -> 14.8; night 22.7 -> 17.3. dpr 2 light-still 20.4 -> 14.5; night-still 21.5 -> 20.7; light 21.4 -> 14.3; night 17.0 -> 20.0. Pan GPU dpr 1 27.1 -> 16.9, pan-4x 23 -> 13.6, zoom 29.4 -> 18.1; dpr 2 pan 28.7 -> 18.4, zoom 28.1 -> 18.5. Screenshot diff (dpr 1): light-still 0.001 %, night-still 0.002 % mean difference, passes.

Findings: (1) the paints that remain (1800 per 10 s, 3 per frame) are the march dashes and the down pulse, both main-thread painters (dash offset and `r` cannot run on the compositor); they are now small layers. With both stopped, light idle is 0.3 %. (2) Night is not fixed by layers alone: any compositor animation makes Chrome composite the whole scene every frame, and that floor is about 9-10 % GPU here (a 4 px div animating opacity or transform, everything else hidden: 9.9-10.7 %; nothing animating: 0.4-1.7 %). Stars + fires + lantern together add roughly another 8 points on top (77 per-star layers measured the same as 3 class layers, so 3 were kept). So the < 10 % budget needs the scene composite itself to get cheaper (texture, tiles, pins: tasks 2.2, 2.5, 2.8), or fewer frames. Layer count at night: 30 `.fx` layers (3 star class layers, 12 fire parts, 6 logs, wash 1, lantern 1, march 1, plus the hidden-defs and pulse), 26 elements with will-change.

## 2026-11-23 nofx-stars-fires

commit 3ed440b (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"night","zoom":0.340909,"loadMs":204,"bytes":{"total":4290300,"texture":1470374,"tiles":2408366,"js":213611},"gpuPct":21.7,"fps":60,"paints":1805,"paintAreaMpx":169448351024.84,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":146,"layout":42,"script":28,"paint":146,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":200,"bytes":{"total":4290303,"texture":1470374,"tiles":2408366,"js":213611},"gpuPct":20.4,"fps":60.1,"paints":1803,"paintAreaMpx":169166876080.39,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":154,"layout":40,"script":26,"paint":156,"decode":0}}
```

## 2026-11-23 nofx-stars-fires

commit 3ed440b (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"night","zoom":0.340909,"loadMs":209,"bytes":{"total":4290302,"texture":1470374,"tiles":2408366,"js":213611},"gpuPct":21.3,"fps":60.1,"paints":1803,"paintAreaMpx":169166876080.39,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":151,"layout":38,"script":29,"paint":143,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":205,"bytes":{"total":4290300,"texture":1470374,"tiles":2408366,"js":213611},"gpuPct":20.4,"fps":60,"paints":1800,"paintAreaMpx":168885400413.03,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":150,"layout":39,"script":25,"paint":155,"decode":0}}
```

### Star twinkle and campfires removed (decision by the owner)

Stars are now static circles inside the `Live` SVG, campfires are gone, `night-still` baseline re-shot on purpose. Night-still idle GPU 18.9-22.5 % before (2.1 block, plus a stale-build rerun at 22.5) -> 20.4 % twice after: no measurable change. Hiding every `.fx` in the scene (one-off) gives 15.6 %, so the lantern, march and pulse layers carry the rest of the compositor-animation floor.

## 2026-11-23 2.2

commit 0812a94 (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":203,"bytes":{"total":3460821,"texture":364433,"tiles":2683774,"js":213627},"gpuPct":18,"fps":60,"paints":1800,"paintAreaMpx":168885400413.03,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":84,"layout":34,"script":23,"paint":159,"decode":0}}
{"scenario":"night","zoom":0.340909,"loadMs":242,"bytes":{"total":3155707,"texture":276409,"tiles":2466718,"js":213627},"gpuPct":21.2,"fps":60,"paints":1803,"paintAreaMpx":169166876080.39,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":131,"layout":34,"script":23,"paint":142,"decode":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":203,"bytes":{"total":3460821,"texture":364433,"tiles":2683774,"js":213627},"gpuPct":19.9,"fps":60,"paints":1803,"paintAreaMpx":169166876080.39,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":102,"layout":43,"script":25,"paint":144,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":199,"bytes":{"total":3155707,"texture":276409,"tiles":2466718,"js":213627},"gpuPct":21.9,"fps":60.1,"paints":1803,"paintAreaMpx":169166876080.39,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":152,"layout":40,"script":26,"paint":154,"decode":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":205,"bytes":{"total":3460821,"texture":364433,"tiles":2683774,"js":213627},"gpuPct":20.4,"fps":59.5,"paints":865,"paintAreaMpx":56013787316.42,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":21,"layout":6,"script":208,"paint":20,"decode":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":206,"bytes":{"total":3460821,"texture":364433,"tiles":2683774,"js":213627},"gpuPct":19.3,"fps":59.8,"paints":1972,"paintAreaMpx":309059591418.54,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":55,"layout":42,"script":72,"paint":26,"decode":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":205,"bytes":{"total":3460821,"texture":364433,"tiles":2683774,"js":213627},"gpuPct":12.8,"fps":59.5,"paints":866,"paintAreaMpx":56295262259.55,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":59,"layout":19,"script":509,"paint":54,"decode":0}}
```

## 2026-11-23 2.2

commit 0812a94 (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":209,"bytes":{"total":3539746,"texture":537502,"tiles":2589958,"js":213627},"gpuPct":19.1,"fps":60,"paints":1807,"paintAreaMpx":170011300188.56,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":98,"layout":41,"script":31,"paint":142,"decode":0}}
{"scenario":"night","zoom":0.340909,"loadMs":208,"bytes":{"total":3216545,"texture":402537,"tiles":2402094,"js":213627},"gpuPct":22.4,"fps":60.1,"paints":1803,"paintAreaMpx":169166876080.39,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":140,"layout":36,"script":24,"paint":147,"decode":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":197,"bytes":{"total":3539746,"texture":537502,"tiles":2589958,"js":213627},"gpuPct":19.6,"fps":60,"paints":1800,"paintAreaMpx":168885400413.03,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":98,"layout":44,"script":25,"paint":150,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":200,"bytes":{"total":3216545,"texture":402537,"tiles":2402094,"js":213627},"gpuPct":21.2,"fps":60.1,"paints":1803,"paintAreaMpx":169166876080.39,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":149,"layout":38,"script":25,"paint":148,"decode":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":197,"bytes":{"total":3539746,"texture":537502,"tiles":2589958,"js":213627},"gpuPct":21.7,"fps":60,"paints":870,"paintAreaMpx":55732314545.94,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":21,"layout":6,"script":202,"paint":20,"decode":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":207,"bytes":{"total":3539746,"texture":537502,"tiles":2589958,"js":213627},"gpuPct":18.6,"fps":59.2,"paints":2027,"paintAreaMpx":322007441879.58,"maxPaintMpx":281474943.16,"longTasks":1,"longTaskMs":61,"maxLongTask":61,"ms":{"style":54,"layout":40,"script":71,"paint":25,"decode":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":201,"bytes":{"total":3539746,"texture":537502,"tiles":2589958,"js":213627},"gpuPct":12.9,"fps":59.7,"paints":863,"paintAreaMpx":56013786592.19,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":57,"layout":12,"script":515,"paint":52,"decode":0}}
```

## 2026-11-23 2.2-dpr2

commit 0812a94 (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 2 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":210,"bytes":{"total":11152287,"texture":1656961,"tiles":9083040,"js":213627},"gpuPct":18.9,"fps":59.9,"paints":1803,"paintAreaMpx":169167965725.57,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":100,"layout":40,"script":24,"paint":166,"decode":0}}
{"scenario":"night","zoom":0.340909,"loadMs":204,"bytes":{"total":10002967,"texture":1143788,"tiles":8447265,"js":213627},"gpuPct":22,"fps":59.9,"paints":1805,"paintAreaMpx":169449440670.03,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":153,"layout":35,"script":27,"paint":165,"decode":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":202,"bytes":{"total":11152287,"texture":1656961,"tiles":9083040,"js":213627},"gpuPct":18.2,"fps":60.1,"paints":1803,"paintAreaMpx":169167965725.57,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":86,"layout":35,"script":21,"paint":197,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":203,"bytes":{"total":10008715,"texture":1143788,"tiles":8447265,"js":213627},"gpuPct":22.9,"fps":60,"paints":1803,"paintAreaMpx":169167965725.57,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":160,"layout":36,"script":24,"paint":172,"decode":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":206,"bytes":{"total":11152287,"texture":1656961,"tiles":9083040,"js":213627},"gpuPct":23.2,"fps":59.5,"paints":955,"paintAreaMpx":56014700884.88,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":23,"layout":6,"script":224,"paint":21,"decode":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":219,"bytes":{"total":11152287,"texture":1656961,"tiles":9083040,"js":213627},"gpuPct":17.6,"fps":58.1,"paints":2747,"paintAreaMpx":540995510896.67,"maxPaintMpx":281474943.16,"longTasks":2,"longTaskMs":126,"maxLongTask":74,"ms":{"style":80,"layout":49,"script":82,"paint":27,"decode":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":202,"bytes":{"total":11152288,"texture":1656961,"tiles":9083040,"js":213627},"gpuPct":14.7,"fps":59.7,"paints":951,"paintAreaMpx":55451748461.27,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":79,"layout":20,"script":578,"paint":58,"decode":0}}
```

### 2.2 note (paper texture viewport-sized and WebP; blocks "2.2" and "2.2-dpr2")

Texture bytes in `load`, dpr 1: light 1 659 778 -> 537 502 (-68 %), night 1 470 374 -> 402 537 (-73 %); dpr 2 light 5 546 414 -> 1 656 961, night 4 871 717 -> 1 143 788. Files on disk at level 3: light 4.1 MB -> 1.23 MB, night 3.6 MB -> 0.83 MB (WebP quality 97; quality 90 failed the screenshot diff, mean 0.545 % over the 0.5 % threshold). The texture is the tiles' base, so all tiles were re-rendered; screenshot diff now light-still 0.448 %, night-still 0.391 % mean (passes; the difference is lossy paper grain). Idle/pan GPU unchanged within noise (light-still 17-19 %, pan 20-22 %), as H3 predicted: the paper was never a GPU cost. The `.world` layer is 4608x3584 (16.5 Mpx) instead of a nominal 204 800^2.

Caution for measurements: a `git stash` while `tsx watch` runs the API makes it serve a release with missing tiles, and a map without content idled at 4.6 % GPU. A number that low is a broken run, not a win.

### Composite note (night-still, before 2.2 commit unless stated; one-off CSS injections, single 8 s runs, +-1.5 points noise)

Layer tree (CDP LayerTree, dpr 1, night-still): before 52 layers, 42 003 Mpx total, of which one 204 800 x 204 800 `.world` layer (WillChangeTransform, nominal, lazily tiled), 3 star layers and 2 world-sized SVG layers of 3200x3264 (10.4 Mpx each, reasons Overlap / ActiveOpacityAnimation). After 2.2 and the star/fire removal (night-still 18 layers, 45.3 Mpx; light-still): 15 layers, 45.3 Mpx (`.world` 4608x3584 = 16.5 Mpx, 2 world-sized SVG layers 10.4 Mpx each, 4 viewport-sized scroll/overlap layers 1.3 Mpx, the rest tiny). dpr 2: 50 layers before, same shape. Tile `<img>`s and the preview are NOT own layers.

Ranking of what the per-frame composite costs, night-still idle GPU:
1. Any running animation: everything animating off and an invisible 4 px compositor animation instead = 10.3 %; nothing animating = 1.8 %. The scene floor is about 10 % before any content matters (blank page with the same animation: 4.3 %).
2. Main-thread painted animations (the down pulse, `r` and opacity of a circle in each diamond pin; the marching dashes): with all `.fx` hidden and the pulse still running 16.5 %; hiding only the pins' pulse as well 1.8 %. So these two cost about 14 points on their own and are the budget problem, not the layer tree.
3. The world-sized SVG layers (`Live`, `Labels`): about 3 points (floor test with them hidden 10.0 vs 10.3-8.7 depending on what else is hidden; noisy).
4. Tiles and stacked levels: 1-3 points (hiding every tile 17.3 vs 17.5-18.1).
5. Paper (any form), preview, `will-change` on `.world`, `contain` on the SVGs or on tiles: no effect beyond noise (all within 1.5 points).
Stars twinkle (3 layers), campfires: about 0-2 points each, removed by decision.

Conclusion: no layer-structure change reduces idle GPU measurably, so none was made. The remaining lever is the painted animations: the pulse and the march run on the main thread (60 paints/s each, 1800 per 10 s) and force a full main frame, raster and composite each time. Making the pulse compositor-only would change its look (a scaled ring has a growing stroke), which was ruled out; needs an owner decision (task 2.8 territory).

## 2026-11-23 pulse

commit bef9b5e (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":209,"bytes":{"total":3539793,"texture":537502,"tiles":2589958,"js":213642},"gpuPct":19.9,"fps":59.9,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":143,"layout":0,"script":28,"paint":124,"decode":0}}
{"scenario":"night","zoom":0.340909,"loadMs":203,"bytes":{"total":3216592,"texture":402537,"tiles":2402094,"js":213642},"gpuPct":19.3,"fps":60,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":171,"layout":0,"script":28,"paint":125,"decode":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":199,"bytes":{"total":3539793,"texture":537502,"tiles":2589958,"js":213642},"gpuPct":19.7,"fps":60,"paints":1200,"paintAreaMpx":434519.3,"maxPaintMpx":722.9,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":140,"layout":0,"script":28,"paint":130,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":207,"bytes":{"total":3216594,"texture":402537,"tiles":2402094,"js":213642},"gpuPct":21.3,"fps":60,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":195,"layout":0,"script":30,"paint":121,"decode":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":197,"bytes":{"total":3540520,"texture":537502,"tiles":2589958,"js":213642},"gpuPct":19.7,"fps":60.1,"paints":666,"paintAreaMpx":1689121114.7,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":22,"layout":2,"script":204,"paint":16,"decode":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":203,"bytes":{"total":3539795,"texture":537502,"tiles":2589958,"js":213642},"gpuPct":19.3,"fps":58.9,"paints":1841,"paintAreaMpx":270779002112.21,"maxPaintMpx":281474943.16,"longTasks":1,"longTaskMs":60,"maxLongTask":60,"ms":{"style":55,"layout":36,"script":71,"paint":23,"decode":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":201,"bytes":{"total":3539793,"texture":537502,"tiles":2589958,"js":213642},"gpuPct":11.8,"fps":59.7,"paints":668,"paintAreaMpx":1689121838.87,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":63,"layout":4,"script":525,"paint":55,"decode":0}}
```

## 2026-11-23 pulse-dpr2

commit bef9b5e (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 2 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":206,"bytes":{"total":11152334,"texture":1656961,"tiles":9083040,"js":213642},"gpuPct":15.9,"fps":60,"paints":1203,"paintAreaMpx":1524889.98,"maxPaintMpx":2535.96,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":109,"layout":0,"script":25,"paint":127,"decode":0}}
{"scenario":"night","zoom":0.340909,"loadMs":211,"bytes":{"total":10003014,"texture":1143788,"tiles":8447265,"js":213642},"gpuPct":18.7,"fps":60,"paints":1202,"paintAreaMpx":1524888.69,"maxPaintMpx":2535.96,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":168,"layout":0,"script":25,"paint":122,"decode":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":212,"bytes":{"total":11152336,"texture":1656961,"tiles":9083040,"js":213642},"gpuPct":16.4,"fps":60.1,"paints":1202,"paintAreaMpx":1524888.69,"maxPaintMpx":2535.96,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":121,"layout":0,"script":23,"paint":133,"decode":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":214,"bytes":{"total":10003016,"texture":1143788,"tiles":8447265,"js":213642},"gpuPct":16.7,"fps":60.1,"paints":1202,"paintAreaMpx":1524888.69,"maxPaintMpx":2535.96,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":163,"layout":0,"script":23,"paint":115,"decode":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":212,"bytes":{"total":11152336,"texture":1656961,"tiles":9083040,"js":213642},"gpuPct":16.4,"fps":60.1,"paints":758,"paintAreaMpx":1690031781.33,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":21,"layout":2,"script":198,"paint":17,"decode":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":216,"bytes":{"total":11152334,"texture":1656961,"tiles":9083040,"js":213642},"gpuPct":18.1,"fps":58.2,"paints":2575,"paintAreaMpx":491455925191.67,"maxPaintMpx":281474943.16,"longTasks":1,"longTaskMs":76,"maxLongTask":76,"ms":{"style":77,"layout":47,"script":74,"paint":27,"decode":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":206,"bytes":{"total":11152334,"texture":1656961,"tiles":9083040,"js":213642},"gpuPct":11.8,"fps":59.7,"paints":758,"paintAreaMpx":1690031781.23,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"ms":{"style":66,"layout":4,"script":606,"paint":53,"decode":0}}
```

### pulse note (down pulse as compositor-only scale animation; blocks "pulse" and "pulse-dpr2")

Ring drawn once at r 38 in a wrapper, wrapper animated with `transform: scale(17/38 -> 1)` and opacity (look checked frame by frame against HEAD at dpr 2: same position, size and colour; the stroke now grows from 1.1 to 2 px). Idle GPU dpr 1: light-still 19.6 -> 19.7 %, night-still 21.2 -> 21.3 %; dpr 2: light-still 18.2 -> 16.4 %, night-still 22.9 -> 16.7 %. Paints per 10 s: 1800 -> 1200 (the pulse no longer paints; the remaining 1200 are the other main-thread animations, the dash march). Screenshot diff passes (light-still 0.488 %, night-still 0.425 %). So the pulse alone is not what holds idle GPU up while the march still runs; the march is the next lever.

## 2026-11-23 fly-baseline

commit 2280a17 · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":201,"bytes":{"total":3539793,"texture":537502,"tiles":2589958,"js":213642},"gpuPct":22.2,"fps":58.2,"paints":1652,"paintAreaMpx":316659394395.08,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":41,"ms":{"style":38,"layout":33,"script":43,"paint":17,"decode":0,"decodeAllThreads":350}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":204,"bytes":{"total":3539793,"texture":537502,"tiles":2589958,"js":213642},"gpuPct":20.8,"fps":59.7,"paints":688,"paintAreaMpx":22379.43,"maxPaintMpx":63.28,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":4,"ms":{"style":32,"layout":40,"script":75,"paint":33,"decode":0,"decodeAllThreads":10}}
```

## 2026-11-23 fly-async

commit de52cde (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":209,"bytes":{"total":3539803,"texture":537502,"tiles":2589958,"js":213652},"gpuPct":22.2,"fps":58.5,"paints":1648,"paintAreaMpx":316659393454.28,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":41,"ms":{"style":35,"layout":33,"script":42,"paint":14,"decode":0,"decodeAllThreads":311}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":204,"bytes":{"total":3539803,"texture":537502,"tiles":2589958,"js":213652},"gpuPct":20.8,"fps":59.8,"paints":683,"paintAreaMpx":22261.68,"maxPaintMpx":63.32,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":4,"ms":{"style":33,"layout":48,"script":73,"paint":32,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 fly-async

commit de52cde (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":209,"bytes":{"total":3539803,"texture":537502,"tiles":2589958,"js":213652},"gpuPct":22.1,"fps":58.4,"paints":1648,"paintAreaMpx":316659393394.36,"maxPaintMpx":281474943.16,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":41,"ms":{"style":37,"layout":33,"script":42,"paint":17,"decode":0,"decodeAllThreads":307}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":195,"bytes":{"total":3539803,"texture":537502,"tiles":2589958,"js":213652},"gpuPct":20.1,"fps":59.9,"paints":687,"paintAreaMpx":22347.72,"maxPaintMpx":63.31,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":4,"ms":{"style":32,"layout":48,"script":72,"paint":32,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 2.3-before

commit a6589cc · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":203,"bytes":{"total":3539805,"texture":537502,"tiles":2589958,"js":213652},"gpuPct":20,"fps":60.1,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":139,"layout":0,"script":33,"paint":120,"decode":0,"decodeAllThreads":0}}
{"scenario":"night","zoom":0.340909,"loadMs":208,"bytes":{"total":3216602,"texture":402537,"tiles":2402094,"js":213652},"gpuPct":20,"fps":60,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":182,"layout":0,"script":32,"paint":120,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":201,"bytes":{"total":3539803,"texture":537502,"tiles":2589958,"js":213652},"gpuPct":19.3,"fps":60,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":152,"layout":0,"script":32,"paint":130,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":202,"bytes":{"total":3216605,"texture":402537,"tiles":2402094,"js":213652},"gpuPct":20.6,"fps":60,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":199,"layout":0,"script":33,"paint":128,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":201,"bytes":{"total":3539805,"texture":537502,"tiles":2589958,"js":213652},"gpuPct":18.8,"fps":59.9,"paints":664,"paintAreaMpx":1689120390.47,"maxPaintMpx":281474943.16,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":23,"layout":2,"script":200,"paint":17,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":203,"bytes":{"total":3539805,"texture":537502,"tiles":2589958,"js":213652},"gpuPct":18.7,"fps":59.1,"paints":1800,"paintAreaMpx":257831154690.6,"maxPaintMpx":281474943.16,"maxFrameMs":50,"slowFrames":2,"longTasks":1,"longTaskMs":60,"maxLongTask":60,"tileReqs":39,"ms":{"style":51,"layout":34,"script":63,"paint":22,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":204,"bytes":{"total":3539804,"texture":537502,"tiles":2589958,"js":213652},"gpuPct":11.8,"fps":59.6,"paints":666,"paintAreaMpx":1689121114.7,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":2,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":65,"layout":4,"script":520,"paint":42,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 2.3-before-dpr2

commit a6589cc · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 2 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":220,"bytes":{"total":11152345,"texture":1656961,"tiles":9083040,"js":213652},"gpuPct":16.8,"fps":60,"paints":1202,"paintAreaMpx":1524888.69,"maxPaintMpx":2535.96,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":125,"layout":0,"script":25,"paint":158,"decode":0,"decodeAllThreads":0}}
{"scenario":"night","zoom":0.340909,"loadMs":206,"bytes":{"total":10003024,"texture":1143788,"tiles":8447265,"js":213652},"gpuPct":21.5,"fps":60,"paints":1200,"paintAreaMpx":1522351.43,"maxPaintMpx":2535.96,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":209,"layout":0,"script":31,"paint":140,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":209,"bytes":{"total":11152344,"texture":1656961,"tiles":9083040,"js":213652},"gpuPct":16.8,"fps":60,"paints":1202,"paintAreaMpx":1524888.69,"maxPaintMpx":2535.96,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":129,"layout":0,"script":25,"paint":150,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":210,"bytes":{"total":10003026,"texture":1143788,"tiles":8447265,"js":213652},"gpuPct":20.6,"fps":60,"paints":1200,"paintAreaMpx":1522351.43,"maxPaintMpx":2535.96,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":188,"layout":0,"script":29,"paint":134,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":205,"bytes":{"total":11152346,"texture":1656961,"tiles":9083040,"js":213652},"gpuPct":17,"fps":60,"paints":758,"paintAreaMpx":1690031781.33,"maxPaintMpx":281474943.16,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":23,"layout":2,"script":207,"paint":18,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":215,"bytes":{"total":11152344,"texture":1656961,"tiles":9083040,"js":213652},"gpuPct":18.1,"fps":58.6,"paints":2570,"paintAreaMpx":491455921302.08,"maxPaintMpx":281474943.16,"maxFrameMs":67,"slowFrames":2,"longTasks":1,"longTaskMs":69,"maxLongTask":69,"tileReqs":23,"ms":{"style":71,"layout":43,"script":71,"paint":25,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":209,"bytes":{"total":11152344,"texture":1656961,"tiles":9083040,"js":213652},"gpuPct":11.7,"fps":60,"paints":758,"paintAreaMpx":1690031781.23,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":1,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":64,"layout":4,"script":589,"paint":48,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 2.3

commit a6589cc (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":220,"bytes":{"total":3540189,"texture":537502,"tiles":2589958,"js":214036},"gpuPct":15.2,"fps":60,"paints":1200,"paintAreaMpx":434519.3,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":116,"layout":0,"script":26,"paint":93,"decode":0,"decodeAllThreads":0}}
{"scenario":"night","zoom":0.340909,"loadMs":214,"bytes":{"total":3216989,"texture":402537,"tiles":2402094,"js":214036},"gpuPct":16.2,"fps":60,"paints":1201,"paintAreaMpx":434520.59,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":163,"layout":0,"script":29,"paint":101,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":213,"bytes":{"total":3540187,"texture":537502,"tiles":2589958,"js":214036},"gpuPct":16,"fps":60,"paints":1200,"paintAreaMpx":434519.3,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":132,"layout":0,"script":28,"paint":111,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":209,"bytes":{"total":3216986,"texture":402537,"tiles":2402094,"js":214036},"gpuPct":19.4,"fps":60,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":184,"layout":0,"script":33,"paint":109,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":210,"bytes":{"total":3540187,"texture":537502,"tiles":2589958,"js":214036},"gpuPct":18.8,"fps":59.6,"paints":605,"paintAreaMpx":1689076295.99,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":1,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":24,"layout":1,"script":63,"paint":18,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":197,"bytes":{"total":3540187,"texture":537502,"tiles":2589958,"js":214036},"gpuPct":18.7,"fps":59.1,"paints":1840,"paintAreaMpx":270779001772.71,"maxPaintMpx":281474943.16,"maxFrameMs":50,"slowFrames":2,"longTasks":1,"longTaskMs":61,"maxLongTask":61,"tileReqs":39,"ms":{"style":51,"layout":32,"script":59,"paint":22,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":209,"bytes":{"total":3540187,"texture":537502,"tiles":2589958,"js":214036},"gpuPct":11.8,"fps":59.9,"paints":605,"paintAreaMpx":1689076295.96,"maxPaintMpx":281474943.16,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":60,"layout":2,"script":153,"paint":51,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 2.3-dpr2

commit a6589cc (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 2 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":207,"bytes":{"total":11152728,"texture":1656961,"tiles":9083040,"js":214036},"gpuPct":16.7,"fps":60,"paints":1200,"paintAreaMpx":1522351.43,"maxPaintMpx":2535.96,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":147,"layout":0,"script":33,"paint":143,"decode":0,"decodeAllThreads":0}}
{"scenario":"night","zoom":0.340909,"loadMs":210,"bytes":{"total":10003408,"texture":1143788,"tiles":8447265,"js":214036},"gpuPct":19.7,"fps":60,"paints":1200,"paintAreaMpx":1522351.43,"maxPaintMpx":2535.96,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":207,"layout":0,"script":34,"paint":141,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":201,"bytes":{"total":11152728,"texture":1656961,"tiles":9083040,"js":214036},"gpuPct":16.2,"fps":60,"paints":1202,"paintAreaMpx":1524888.69,"maxPaintMpx":2535.96,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":167,"layout":0,"script":34,"paint":145,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":219,"bytes":{"total":10003408,"texture":1143788,"tiles":8447265,"js":214036},"gpuPct":17.9,"fps":60.1,"paints":1202,"paintAreaMpx":1524888.69,"maxPaintMpx":2535.96,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":189,"layout":0,"script":33,"paint":119,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":211,"bytes":{"total":11152728,"texture":1656961,"tiles":9083040,"js":214036},"gpuPct":14.3,"fps":59.6,"paints":648,"paintAreaMpx":1689755360.69,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":1,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":21,"layout":2,"script":57,"paint":17,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":214,"bytes":{"total":11152728,"texture":1656961,"tiles":9083040,"js":214036},"gpuPct":17.9,"fps":58.7,"paints":2568,"paintAreaMpx":491455918358.11,"maxPaintMpx":281474943.16,"maxFrameMs":67,"slowFrames":2,"longTasks":1,"longTaskMs":72,"maxLongTask":72,"tileReqs":23,"ms":{"style":70,"layout":38,"script":61,"paint":24,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":212,"bytes":{"total":11152728,"texture":1656961,"tiles":9083040,"js":214036},"gpuPct":10.1,"fps":59.6,"paints":630,"paintAreaMpx":1689709713.47,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":1,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"ms":{"style":63,"layout":4,"script":164,"paint":55,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 2.3-fly

commit a6589cc (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":202,"bytes":{"total":3540187,"texture":537502,"tiles":2589958,"js":214036},"gpuPct":22.9,"fps":58.7,"paints":1726,"paintAreaMpx":329607247960.54,"maxPaintMpx":281474943.16,"maxFrameMs":50,"slowFrames":1,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":41,"ms":{"style":36,"layout":32,"script":41,"paint":15,"decode":0,"decodeAllThreads":318}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":213,"bytes":{"total":3540187,"texture":537502,"tiles":2589958,"js":214036},"gpuPct":19.1,"fps":60,"paints":688,"paintAreaMpx":22378.78,"maxPaintMpx":63.28,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":4,"ms":{"style":34,"layout":41,"script":69,"paint":30,"decode":0,"decodeAllThreads":0}}
```

### 2.3 note (imperative viewport transform; blocks "2.3-before", "2.3-before-dpr2" = HEAD a6589cc, "2.3", "2.3-dpr2", "2.3-fly" = after)

`.world`, the `.paper` background and the `Anchored` popover are written to the DOM from the React Flow viewport store; `WorldLayer` is memoised and re-renders only when the tile level or visible tile range changes (render counter: 1 render over a 60-move pan, 0 per frame). `MapView` and `Labels` read only the zoom, so a pan renders neither. Zoom frames still render those two (LOD variables and labels are task 2.4).

| scenario | scripting ms | long tasks | maxFrameMs | slowFrames | GPU % |
|---|---|---|---|---|---|
| pan dpr1 | 200 -> 63 | 0 -> 0 | 17 -> 33 | 0 -> 1 | 18.8 -> 18.8 |
| pan-4x dpr1 | 520 -> 153 | 0 -> 0 | 33 -> 17 | 2 -> 0 | 11.8 -> 11.8 |
| zoom dpr1 | 63 -> 59 | 1 (60 ms) -> 1 (61 ms) | 50 -> 50 | 2 -> 2 | 18.7 -> 18.7 |
| pan dpr2 | 207 -> 57 | 0 -> 0 | 17 -> 33 | 0 -> 1 | 17.0 -> 14.3 |
| pan-4x dpr2 | 589 -> 164 | 0 -> 0 | 33 -> 33 | 1 -> 1 | 11.7 -> 10.1 |
| zoom dpr2 | 71 -> 61 | 1 (69 ms) -> 1 (72 ms) | 67 -> 67 | 2 -> 2 | 18.1 -> 17.9 |
| fly dpr1 (vs fly-async) | 42 -> 41 | 0 -> 0 | n/a -> 50 | n/a -> 1 | 22.1 -> 22.9 |
| fly-warm dpr1 | 72 -> 69 | 0 -> 0 | n/a -> 17 | n/a -> 0 | 20.1 -> 19.1 |

Screenshot diff passes (light-still 0.488 %, night-still 0.425 %, unchanged). After a button zoom and after a pan, tiles, pins, labels and the `?select=copperleaf-site` popover (card and arrow) stay aligned and the paper has no seam (screenshots read by eye). The single slowFrame in pan is one 33 ms frame, within the noise of the 3 s run.

## 2026-11-23 2.4-decision

2.4 (commits 2fdfaa2, b513d56) reverted: no measurable gain. A/B on the same machine, dpr 1, headless, 3 runs each, `zoom` and `zoom-4x` (CPU throttled 4x), alternating builds: "with 2.4" = 5e04f82+zoom-4x scenario build (HEAD before the revert), "without" = 5e04f82 (the commit before 2.4). Per-run values, median in brackets.

| scenario | build | style ms | layout ms | scripting ms | style+layout+script | long tasks | maxFrameMs | slowFrames |
|---|---|---|---|---|---|---|---|---|
| zoom | without 2.4 | 56 53 54 (54) | 32 33 32 (32) | 63 61 58 (61) | 151 147 144 (147) | 1 1 1 | 50 50 50 | 1 1 1 |
| zoom | with 2.4 | 39 40 42 (40) | 37 35 37 (37) | 61 60 64 (61) | 137 135 143 (137) | 0 1 1 | 67 50 50 | 1 1 2 |
| zoom-4x | without 2.4 | 177 161 172 (172) | 109 111 109 (109) | 190 178 176 (178) | 476 450 457 (457) | 0 1 0 | 50 67 50 | 5 3 4 |
| zoom-4x | with 2.4 | 120 116 143 (120) | 115 114 128 (115) | 174 180 201 (180) | 409 410 472 (410) | 0 0 1 | 50 50 67 | 4 3 5 |

At 4x the sum drops 10 % (457 -> 410 ms), below the 15 % bar and inside the run spread (with: 409 to 472, without: 450 to 476). Style recalc drops by about a third, but layout and scripting grow by the same amount, and long tasks, maxFrameMs and slowFrames do not move. Not worth the extra code (`lod.ts`, stepped timers), so 2.4 is reverted and left unticked; the zoom long task is tile mounting, handled by 2.5.

## 2026-11-23 2.5-before-dpr1

commit f731a6d · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":208,"bytes":{"total":3540187,"texture":537502,"tiles":2589958,"js":214036},"gpuPct":22.8,"fps":58.6,"paints":1695,"paintAreaMpx":329607241313.56,"maxPaintMpx":281474943.16,"maxFrameMs":50,"slowFrames":1,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":41,"tileReqsOff":10,"ms":{"style":39,"layout":33,"script":41,"paint":16,"decode":0,"decodeAllThreads":325}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":204,"bytes":{"total":3540187,"texture":537502,"tiles":2589958,"js":214036},"gpuPct":19.8,"fps":59.9,"paints":682,"paintAreaMpx":22256.95,"maxPaintMpx":63.31,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":4,"tileReqsOff":0,"ms":{"style":37,"layout":47,"script":67,"paint":32,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 2.5-before-dpr2

commit f731a6d · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 2 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":221,"bytes":{"total":11152728,"texture":1656961,"tiles":9083040,"js":214036},"gpuPct":15.7,"fps":55.8,"paints":1390,"paintAreaMpx":277815981067.14,"maxPaintMpx":281474943.16,"maxFrameMs":67,"slowFrames":3,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":26,"tileReqsOff":4,"ms":{"style":40,"layout":30,"script":37,"paint":17,"decode":0,"decodeAllThreads":363}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":211,"bytes":{"total":11152729,"texture":1656961,"tiles":9083040,"js":214036},"gpuPct":19.8,"fps":59.8,"paints":686,"paintAreaMpx":77452.86,"maxPaintMpx":221.97,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":1,"tileReqsOff":0,"ms":{"style":37,"layout":38,"script":72,"paint":32,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 2.5a

commit f731a6d (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":207,"bytes":{"total":3540580,"texture":537502,"tiles":2589958,"js":214429},"gpuPct":18.8,"fps":58.4,"paints":1505,"paintAreaMpx":329607203375.07,"maxPaintMpx":281474943.16,"maxFrameMs":50,"slowFrames":1,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":15,"tileReqsOff":0,"ms":{"style":37,"layout":34,"script":38,"paint":15,"decode":0,"decodeAllThreads":220}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":203,"bytes":{"total":3540580,"texture":537502,"tiles":2589958,"js":214429},"gpuPct":20.3,"fps":60,"paints":669,"paintAreaMpx":21025.56,"maxPaintMpx":63.31,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":4,"tileReqsOff":0,"ms":{"style":42,"layout":49,"script":67,"paint":34,"decode":0,"decodeAllThreads":45}}
```

## 2026-11-23 2.5a-dpr1

commit f731a6d (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":212,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":19,"fps":60,"paints":1510,"paintAreaMpx":329607204200.17,"maxPaintMpx":281474943.16,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":15,"tileReqsOff":0,"ms":{"style":40,"layout":34,"script":38,"paint":17,"decode":0,"decodeAllThreads":215}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":207,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":19.4,"fps":59.9,"paints":670,"paintAreaMpx":21076.67,"maxPaintMpx":63.28,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":4,"tileReqsOff":0,"ms":{"style":35,"layout":39,"script":68,"paint":30,"decode":0,"decodeAllThreads":41}}
```

## 2026-11-23 2.5a-dpr2

commit f731a6d (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 2 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":209,"bytes":{"total":11153143,"texture":1656961,"tiles":9083040,"js":214451},"gpuPct":16.2,"fps":59.2,"paints":1457,"paintAreaMpx":316659460877.24,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":1,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":13,"tileReqsOff":0,"ms":{"style":44,"layout":34,"script":39,"paint":17,"decode":0,"decodeAllThreads":238}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":212,"bytes":{"total":11153143,"texture":1656961,"tiles":9083040,"js":214451},"gpuPct":20.1,"fps":59.8,"paints":668,"paintAreaMpx":72877.72,"maxPaintMpx":222.15,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":1,"tileReqsOff":0,"ms":{"style":36,"layout":49,"script":68,"paint":32,"decode":0,"decodeAllThreads":37}}
```

## 2026-11-23 2.5b-fly

commit 7a1a541 · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":216,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":18.5,"fps":59.4,"paints":1466,"paintAreaMpx":316659356667.16,"maxPaintMpx":281474943.16,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":15,"tileReqsOff":0,"ms":{"style":39,"layout":35,"script":39,"paint":16,"decode":0,"decodeAllThreads":215}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":208,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":20.6,"fps":60,"paints":672,"paintAreaMpx":21127.24,"maxPaintMpx":63.28,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":4,"tileReqsOff":0,"ms":{"style":38,"layout":40,"script":72,"paint":33,"decode":0,"decodeAllThreads":52}}
```

## 2026-11-23 2.5b-fly

commit 7a1a541 · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":205,"bytes":{"total":3540603,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":18.7,"fps":59.9,"paints":1508,"paintAreaMpx":329607203596.51,"maxPaintMpx":281474943.16,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":15,"tileReqsOff":0,"ms":{"style":40,"layout":34,"script":40,"paint":16,"decode":0,"decodeAllThreads":215}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":201,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":20.6,"fps":59.8,"paints":672,"paintAreaMpx":21126.15,"maxPaintMpx":63.28,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":4,"tileReqsOff":0,"ms":{"style":41,"layout":36,"script":70,"paint":35,"decode":0,"decodeAllThreads":46}}
```

## 2026-11-23 2.5b

commit 7a1a541 · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":208,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":20,"fps":60,"paints":1201,"paintAreaMpx":434520.59,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":157,"layout":1,"script":36,"paint":131,"decode":0,"decodeAllThreads":0}}
{"scenario":"night","zoom":0.340909,"loadMs":198,"bytes":{"total":3217401,"texture":402537,"tiles":2402094,"js":214451},"gpuPct":20.3,"fps":59.9,"paints":1203,"paintAreaMpx":435244.79,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":214,"layout":1,"script":39,"paint":132,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":203,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":20.1,"fps":60,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":152,"layout":0,"script":33,"paint":126,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":209,"bytes":{"total":3217401,"texture":402537,"tiles":2402094,"js":214451},"gpuPct":20.4,"fps":60,"paints":1200,"paintAreaMpx":434519.3,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":221,"layout":0,"script":40,"paint":126,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":199,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":22.1,"fps":59.6,"paints":609,"paintAreaMpx":1689077744.47,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":1,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":29,"layout":2,"script":71,"paint":21,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":205,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":19.7,"fps":59,"paints":1846,"paintAreaMpx":270779002385.68,"maxPaintMpx":281474943.16,"maxFrameMs":50,"slowFrames":2,"longTasks":1,"longTaskMs":60,"maxLongTask":60,"tileReqs":39,"tileReqsOff":39,"ms":{"style":58,"layout":33,"script":67,"paint":23,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":200,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":12,"fps":60,"paints":605,"paintAreaMpx":1689076295.96,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":1,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":56,"layout":3,"script":156,"paint":52,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom-4x","zoom":0.340909,"loadMs":205,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":15.5,"fps":58.3,"paints":2032,"paintAreaMpx":309622581974.38,"maxPaintMpx":281474943.16,"maxFrameMs":50,"slowFrames":4,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":39,"tileReqsOff":39,"ms":{"style":158,"layout":106,"script":179,"paint":78,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 2.5b-dpr2

commit 7a1a541 · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 2 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"fly","zoom":0.340909,"loadMs":211,"bytes":{"total":11153143,"texture":1656961,"tiles":9083040,"js":214451},"gpuPct":16.5,"fps":59.7,"paints":1512,"paintAreaMpx":329607319413.63,"maxPaintMpx":281474943.16,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":13,"tileReqsOff":0,"ms":{"style":44,"layout":35,"script":40,"paint":17,"decode":0,"decodeAllThreads":242}}
{"scenario":"fly-warm","zoom":0.340909,"loadMs":211,"bytes":{"total":11153143,"texture":1656961,"tiles":9083040,"js":214451},"gpuPct":20.3,"fps":59.8,"paints":672,"paintAreaMpx":73229.26,"maxPaintMpx":222.1,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":1,"tileReqsOff":0,"ms":{"style":40,"layout":44,"script":71,"paint":34,"decode":0,"decodeAllThreads":53}}
```

### 2.5 note (destination-only fly-to; blocks "2.5-before-dpr1/2" = before (HEAD f731a6d), "2.5a*", "2.5b*" = after)

`flyTo` computes the target viewport, preloads (`new Image()` + `decode()`, deduped and held in a 96-entry map) the target view's tiles (level 1 plus the target level) and the paper texture of that level, then starts the flight. `WorldLayer` ignores view changes while `flight.active`, so no in-between tile is mounted, requested or decoded; landing (`onMoveEnd`, or a 850 ms timer for a zero-length move) mounts the already decoded tiles. A user drag or wheel (`onMoveStart` with an event) ends the freeze at once. Hovering or focusing a sidebar row calls the same preload. The texture preload was needed: without it the level's larger paper texture decoded on landing and cost one 50 ms frame (a 74 ms `ImageDecodeTask` right at landing).

| scenario | fps | long tasks | maxFrameMs | slowFrames | decode (all threads) ms | tile reqs | travel tile reqs (`tileReqsOff`) |
|---|---|---|---|---|---|---|---|
| fly dpr1 before | 58.6 | 0 | 50 | 1 | 325 | 41 | 10 |
| fly dpr1 after (2 runs) | 59.4, 59.9 | 0, 0 | 17, 17 | 0, 0 | 215, ~215 | 15 | 0 |
| fly-warm dpr1 before | 59.9 | 0 | 17 | 0 | 0 | 4 | 0 |
| fly-warm dpr1 after (2 runs) | 60, 59.8 | 0, 0 | 17, 17 | 0, 0 | 41 to 52 | 4 | 0 |
| fly dpr2 before | 55.8 | 0 | 67 | 3 | 363 | 26 | 4 |
| fly dpr2 after | 59.7 | 0 | 17 | 0 | 238 | 13 | 0 |
| fly-warm dpr2 before | 59.8 | 0 | 17 | 0 | 0 | 1 | 0 |
| fly-warm dpr2 after | 59.8 | 0 | 17 | 0 | 53 | 1 | 0 |

Main-thread `Decode*` is 0 before and after; the decode that remains runs on raster workers, now during the flight and off the main thread. An earlier dpr 2 run (2.5a-dpr2) showed one 33 ms frame at flight start (13 tile images and a texture decoding on workers at once); the final run had none, so it is within noise. Landing screenshot (flight to the last plot, 1.8 s after the click) compared with the previous build: mean diff 0.031 % at dpr 1 and 0.000 % at dpr 2, 0 % of values off by over 16; all 48 mounted tiles shown (opacity 1, complete). Interruption: a wheel 250 ms into a flight mounted tiles for the new position at once (requests at ~370 ms, not at 700 ms). After hovering a row for 1 s, 15 tile requests had been made; the click and flight afterwards made 0. Screenshot diff passes (light-still 0.488 %, night-still 0.425 %).

## 2026-11-23 2.6

commit b18e6ef · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":208,"bytes":{"total":3541534,"texture":537502,"tiles":2589958,"js":215383},"gpuPct":20.8,"fps":60.1,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":168,"layout":0,"script":36,"paint":129,"decode":0,"decodeAllThreads":0}}
{"scenario":"night","zoom":0.340909,"loadMs":205,"bytes":{"total":3218333,"texture":402537,"tiles":2402094,"js":215383},"gpuPct":20.8,"fps":59.9,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":211,"layout":0,"script":34,"paint":125,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":199,"bytes":{"total":3541534,"texture":537502,"tiles":2589958,"js":215383},"gpuPct":20.3,"fps":60,"paints":1200,"paintAreaMpx":434519.3,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":189,"layout":0,"script":38,"paint":145,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":202,"bytes":{"total":3218333,"texture":402537,"tiles":2402094,"js":215383},"gpuPct":20.4,"fps":60,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":209,"layout":0,"script":36,"paint":126,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":208,"bytes":{"total":3541534,"texture":537502,"tiles":2589958,"js":215383},"gpuPct":20.2,"fps":59.9,"paints":609,"paintAreaMpx":1689077744.47,"maxPaintMpx":281474943.16,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":26,"layout":2,"script":66,"paint":20,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":207,"bytes":{"total":3541535,"texture":537502,"tiles":2589958,"js":215383},"gpuPct":20.2,"fps":59.1,"paints":1791,"paintAreaMpx":257831151956.16,"maxPaintMpx":281474943.16,"maxFrameMs":50,"slowFrames":2,"longTasks":1,"longTaskMs":62,"maxLongTask":62,"tileReqs":39,"tileReqsOff":39,"ms":{"style":56,"layout":36,"script":66,"paint":23,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":206,"bytes":{"total":3541534,"texture":537502,"tiles":2589958,"js":215383},"gpuPct":11.4,"fps":59.8,"paints":609,"paintAreaMpx":1689077744.39,"maxPaintMpx":281474943.16,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":55,"layout":3,"script":149,"paint":37,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom-4x","zoom":0.340909,"loadMs":200,"bytes":{"total":3541534,"texture":537502,"tiles":2589958,"js":215383},"gpuPct":16.5,"fps":58.3,"paints":2089,"paintAreaMpx":322570435649.83,"maxPaintMpx":281474943.16,"maxFrameMs":50,"slowFrames":4,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":39,"tileReqsOff":39,"ms":{"style":165,"layout":108,"script":177,"paint":69,"decode":0,"decodeAllThreads":0}}
```

### 2.6 note (lazy chunks; block "2.6")

`Boring`, `Panel` and `Popover` are `React.lazy` chunks (Suspense fallback renders nothing; Boring's shows an empty `.app`); the Panel and Popover chunks are fetched with `requestIdleCallback` after the map mounts, so the first click does not wait. rough.js stays in the main chunk.

| | main chunk raw | main chunk gzip | lazy chunks raw (gzip) |
|---|---|---|---|
| before | 568,979 B | 180,513 B (gzip -c) | none |
| after | 559,065 B | 178,203 B (gzip -c) | Boring 7.1 kB (2.8), Popover 3.8 kB (1.8), Panels 1.6 kB (0.7) |

The three components are small, so the main chunk only drops about 10 kB raw and 2.3 kB gzip. What is left is first-paint code: react-dom ~625 KB source, @xyflow/react + @xyflow/system ~290 KB, rough.js 28 KB, d3 (selection, transition, zoom, color, interpolate) ~100 KB, `gen/defs.ts` 21 KB, `gen/render.ts` 14 KB. Nothing there is small and clearly off the first-paint path, so no more splitting. Load (light-still) loadMs 203 to 199 (noise, 198 to 209 across scenarios, as before); tiles-visible unchanged (all tiles mounted); js bytes 214,451 to 215,383 (the idle preload lands inside the window). Pan 59.9 fps / GPU 20.2%, pan-4x 59.8 fps, no regressions. Screenshot diff passes (light-still 0.488 %, night-still 0.425 %, same as 2.5). `?style=boring`, `?panel=links`, `?panel=inventory`, `?select=copperleaf-site` checked by headless screenshot, no page errors.

## 2026-11-23 2.7-before

commit f2cc8cc · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"hidden","zoom":0.340909,"loadMs":199,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":19.5,"fps":60,"frames":331,"timers":0,"hidden":true,"running":2,"paints":662,"paintAreaMpx":239709.81,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":90,"layout":0,"script":19,"paint":70,"decode":0,"decodeAllThreads":0}}
{"scenario":"reduced","zoom":0.340909,"loadMs":204,"bytes":{"total":3540602,"texture":537502,"tiles":2589958,"js":214451},"gpuPct":2.1,"fps":60,"frames":300,"timers":0,"running":0,"paints":0,"paintAreaMpx":0,"maxPaintMpx":0,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":0,"layout":0,"script":16,"paint":0,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 2.7

commit f2cc8cc (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light-still","zoom":0.340909,"loadMs":208,"bytes":{"total":3540715,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":20.4,"fps":60,"frames":601,"timers":0,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":159,"layout":0,"script":33,"paint":130,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":206,"bytes":{"total":3217514,"texture":402537,"tiles":2402094,"js":214529},"gpuPct":19.6,"fps":60,"frames":600,"timers":0,"paints":1200,"paintAreaMpx":434519.3,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":198,"layout":0,"script":34,"paint":117,"decode":0,"decodeAllThreads":0}}
{"scenario":"hidden","zoom":0.340909,"loadMs":206,"bytes":{"total":3540715,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":2.1,"fps":59.8,"frames":330,"timers":0,"hidden":true,"running":0,"paints":4,"paintAreaMpx":1448.4,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":3,"layout":0,"script":19,"paint":0,"decode":0,"decodeAllThreads":0}}
{"scenario":"reduced","zoom":0.340909,"loadMs":204,"bytes":{"total":3540715,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":1.9,"fps":59.9,"frames":300,"timers":0,"running":0,"paints":0,"paintAreaMpx":0,"maxPaintMpx":0,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":0,"layout":0,"script":16,"paint":0,"decode":0,"decodeAllThreads":0}}
```

### 2.7 note

Hidden tab (5 s, hidden signal faked in headless, see README): before, 2 CSS animations still running (march, pulse; the lantern was already paused), GPU 19.5 %, 0 timers. After (`html.tab-hidden` pauses all CSS animations, `useNow` skips re-renders while hidden and catches up on return): 0 running, GPU 2.1 %, 0 timers fired. rAF frames in headless are unchanged (headless never throttles; real tabs get none). Reduced motion (`?still=1`, emulated): 0 running animations, GPU 1.9 %; the selector list already covers march, pulse, ink, hero-tab, wash-fade, chipbox, tiles. Screenshot diff passes (light 0.488 %, night 0.425 %).

## 2026-11-23 2.8

commit ebf6927 (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":219,"bytes":{"total":3540720,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":10.9,"fps":30,"frames":300,"timers":0,"paints":600,"paintAreaMpx":217259.65,"maxPaintMpx":722.9,"maxFrameMs":34,"slowFrames":302,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":94,"layout":0,"script":20,"paint":70,"decode":0,"decodeAllThreads":0}}
{"scenario":"night","zoom":0.340909,"loadMs":197,"bytes":{"total":3217520,"texture":402537,"tiles":2402094,"js":214529},"gpuPct":11.8,"fps":30,"frames":300,"timers":0,"paints":602,"paintAreaMpx":217983.85,"maxPaintMpx":722.9,"maxFrameMs":34,"slowFrames":302,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":119,"layout":0,"script":21,"paint":79,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":207,"bytes":{"total":3540720,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":11.3,"fps":30,"frames":300,"timers":0,"paints":600,"paintAreaMpx":217259.65,"maxPaintMpx":722.9,"maxFrameMs":34,"slowFrames":302,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":93,"layout":0,"script":20,"paint":76,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":207,"bytes":{"total":3217519,"texture":402537,"tiles":2402094,"js":214529},"gpuPct":12.1,"fps":30,"frames":300,"timers":0,"paints":600,"paintAreaMpx":217259.65,"maxPaintMpx":722.9,"maxFrameMs":34,"slowFrames":302,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":122,"layout":0,"script":21,"paint":73,"decode":0,"decodeAllThreads":0}}
{"scenario":"hidden","zoom":0.340909,"loadMs":201,"bytes":{"total":3540720,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":1.8,"fps":30.1,"frames":166,"timers":0,"hidden":true,"running":0,"paints":2,"paintAreaMpx":724.2,"maxPaintMpx":722.9,"maxFrameMs":33,"slowFrames":167,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":3,"layout":0,"script":10,"paint":0,"decode":0,"decodeAllThreads":0}}
{"scenario":"reduced","zoom":0.340909,"loadMs":208,"bytes":{"total":3540723,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":1.6,"fps":30.1,"frames":151,"timers":0,"running":0,"paints":0,"paintAreaMpx":0,"maxPaintMpx":0,"maxFrameMs":34,"slowFrames":152,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":0,"layout":0,"script":10,"paint":0,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":203,"bytes":{"total":3540723,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":15.6,"fps":30.1,"frames":92,"timers":11,"paints":325,"paintAreaMpx":127422.89,"maxPaintMpx":722.9,"maxFrameMs":33,"slowFrames":94,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":29,"layout":2,"script":81,"paint":20,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":203,"bytes":{"total":3540721,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":12.5,"fps":29.8,"frames":90,"timers":0,"paints":1098,"paintAreaMpx":154811277705.23,"maxPaintMpx":281474943.16,"maxFrameMs":34,"slowFrames":92,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":39,"tileReqsOff":13,"ms":{"style":41,"layout":40,"script":65,"paint":21,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":200,"bytes":{"total":3540723,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":5.6,"fps":30.2,"frames":92,"timers":12,"paints":329,"paintAreaMpx":563079476.56,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":93,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":29,"layout":3,"script":109,"paint":29,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom-4x","zoom":0.340909,"loadMs":210,"bytes":{"total":3540720,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":8.8,"fps":30.1,"frames":92,"timers":0,"paints":1193,"paintAreaMpx":161003735000.21,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":94,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":39,"tileReqsOff":24,"ms":{"style":93,"layout":92,"script":121,"paint":45,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 2.8-dpr2

commit ebf6927 (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 2 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":216,"bytes":{"total":11153261,"texture":1656961,"tiles":9083040,"js":214529},"gpuPct":10.6,"fps":30,"frames":300,"timers":0,"paints":600,"paintAreaMpx":761175.72,"maxPaintMpx":2535.96,"maxFrameMs":34,"slowFrames":302,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":95,"layout":0,"script":19,"paint":89,"decode":0,"decodeAllThreads":0}}
{"scenario":"night","zoom":0.340909,"loadMs":209,"bytes":{"total":10003941,"texture":1143788,"tiles":8447265,"js":214529},"gpuPct":12.5,"fps":30,"frames":300,"timers":2,"paints":601,"paintAreaMpx":761177.01,"maxPaintMpx":2535.96,"maxFrameMs":33,"slowFrames":302,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":140,"layout":1,"script":25,"paint":83,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":211,"bytes":{"total":11153261,"texture":1656961,"tiles":9083040,"js":214529},"gpuPct":11.3,"fps":30,"frames":300,"timers":0,"paints":600,"paintAreaMpx":761175.72,"maxPaintMpx":2535.96,"maxFrameMs":34,"slowFrames":302,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":99,"layout":0,"script":22,"paint":90,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":205,"bytes":{"total":10003941,"texture":1143788,"tiles":8447265,"js":214529},"gpuPct":12.2,"fps":30,"frames":300,"timers":0,"paints":600,"paintAreaMpx":761175.72,"maxPaintMpx":2535.96,"maxFrameMs":34,"slowFrames":302,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":137,"layout":0,"script":20,"paint":84,"decode":0,"decodeAllThreads":0}}
{"scenario":"hidden","zoom":0.340909,"loadMs":206,"bytes":{"total":11153261,"texture":1656961,"tiles":9083040,"js":214529},"gpuPct":2,"fps":29.9,"frames":165,"timers":0,"hidden":true,"running":0,"paints":4,"paintAreaMpx":5074.5,"maxPaintMpx":2535.96,"maxFrameMs":34,"slowFrames":167,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":5,"layout":0,"script":11,"paint":0,"decode":0,"decodeAllThreads":0}}
{"scenario":"reduced","zoom":0.340909,"loadMs":198,"bytes":{"total":11153261,"texture":1656961,"tiles":9083040,"js":214529},"gpuPct":1.6,"fps":30.1,"frames":151,"timers":0,"running":0,"paints":0,"paintAreaMpx":0,"maxPaintMpx":0,"maxFrameMs":34,"slowFrames":152,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":0,"layout":0,"script":9,"paint":0,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":206,"bytes":{"total":11153261,"texture":1656961,"tiles":9083040,"js":214529},"gpuPct":12.1,"fps":30.1,"frames":91,"timers":11,"paints":346,"paintAreaMpx":507378.45,"maxPaintMpx":2535.96,"maxFrameMs":33,"slowFrames":93,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":27,"layout":2,"script":74,"paint":22,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":205,"bytes":{"total":11153261,"texture":1656961,"tiles":9083040,"js":214529},"gpuPct":12.7,"fps":29.7,"frames":92,"timers":24,"paints":1457,"paintAreaMpx":310185627143.58,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":95,"longTasks":1,"longTaskMs":62,"maxLongTask":62,"tileReqs":58,"tileReqsOff":43,"ms":{"style":54,"layout":41,"script":72,"paint":19,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":205,"bytes":{"total":11153261,"texture":1656961,"tiles":9083040,"js":214529},"gpuPct":4.7,"fps":30.2,"frames":93,"timers":12,"paints":358,"paintAreaMpx":563475020.24,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":94,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":32,"layout":5,"script":107,"paint":28,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom-4x","zoom":0.340909,"loadMs":205,"bytes":{"total":11153261,"texture":1656961,"tiles":9083040,"js":214529},"gpuPct":7,"fps":29.7,"frames":93,"timers":4,"paints":1523,"paintAreaMpx":323133498433.36,"maxPaintMpx":281474943.16,"maxFrameMs":67,"slowFrames":95,"longTasks":1,"longTaskMs":64,"maxLongTask":64,"tileReqs":58,"tileReqsOff":43,"ms":{"style":114,"layout":96,"script":104,"paint":39,"decode":0,"decodeAllThreads":0}}
```

### 2.8 diagnose and fix (blocks "2.8", "2.8-dpr2")

Method: one-off CSS injected into the production build, `pan` / `pan-4x`, GPU % (3 runs where it mattered). The machine drifted between sessions (paints per pan 605 then 325, rAF 60 then 30 fps, same code), so only runs from the same session and interleaved are compared. Pan GPU %, dpr 1 (session A, high mode): base 22.2/22.0/22.8; hide whole pin layer 16.0 (-6); hide pin SVGs 17.5/18/16.8 (-4.5); `will-change: transform` on `.react-flow__viewport` 20.2/21.1/20.4 (-1.8). Noise in one session is about 0.5 (single runs up to 1.5 apart across sessions). dpr 2: base 20, nopins 15.5, viewport will-change 15.2 (-4.8), pin SVGs hidden 18.8 (-1.2).

Single runs, within noise (+-1.5): hide chip box-shadow (-1.0 / +0.4), hide chips (+0.8 / +0.9), remove `--pin-k` scale (-1.1 / +1.8), `contain: layout paint` on nodes (-0.4 / +6.3, paints 605 to 705: worse). Hiding `.pulse-wrap` made pan worse (+4.6 / +8): the 18 pulse rings are small composited layers (LayerTree: 35 layers, 20 of them under 20 kpx, versus 11 without the rings) and cost nothing per pan frame. Per-node, per-svg or `.react-flow__nodes` will-change on top of the viewport one added nothing measurable.

Ranking of what pins cost in pan: pin layer as a whole about 6 points (dpr 1) / 4.5 (dpr 2); of that the pin SVGs (scaled, rastered inside the moving viewport) are the biggest part; chips, shadows, scale and pulse are in the noise. Fix: `.react-flow__viewport { will-change: transform }` so the viewport is one layer that moves by transform and is not re-rastered with the pan (layers 35 to 39, same big layers, total 31.8 Mpx).

Before / after, interleaved, 3 runs each (old build served from a worktree of the previous commit), pan GPU % : dpr 1 before 16.4/16.5/16.2, after 14.8/14.7/15.2 (-1.5); dpr 2 before 14.4/14.2/14.7, after 12.6/11.3/11.1 (-3.0). pan-4x: dpr 1 before 5.7/7.0/6.9, after 5.4/5.3/5.6 (-1.1); dpr 2 before 6.2/6.0/6.1, after 4.8/4.7/4.6 (-1.4). Paints unchanged (~325 / ~350 per window): the pins were not repainting; the saving is GPU raster/composite. fps 30 in both (the machine's display state this session, identical before and after). Screenshots: light-still 0.487 %, night-still 0.426 % (pass, same as before); after four zoom-in clicks at rest vs the previous build, mean diff 0.032 % at dpr 1, 0.004 % at dpr 2 (pins and chips crisp, checked by eye).

## 2026-11-23 final-3.1

commit 485aa8d · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":211,"bytes":{"total":3540720,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":14.7,"fps":60,"frames":600,"timers":2,"paints":1201,"paintAreaMpx":434520.59,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":117,"layout":0,"script":27,"paint":95,"decode":0,"decodeAllThreads":0}}
{"scenario":"night","zoom":0.340909,"loadMs":216,"bytes":{"total":3217519,"texture":402537,"tiles":2402094,"js":214529},"gpuPct":14.4,"fps":60,"frames":600,"timers":0,"paints":1200,"paintAreaMpx":434519.3,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":128,"layout":0,"script":25,"paint":83,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":213,"bytes":{"total":3540720,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":14.3,"fps":60,"frames":600,"timers":0,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":117,"layout":0,"script":26,"paint":98,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":213,"bytes":{"total":3217519,"texture":402537,"tiles":2402094,"js":214529},"gpuPct":15.9,"fps":60.1,"frames":601,"timers":0,"paints":1202,"paintAreaMpx":435243.5,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":147,"layout":0,"script":27,"paint":90,"decode":0,"decodeAllThreads":0}}
{"scenario":"hidden","zoom":0.340909,"loadMs":206,"bytes":{"total":3540723,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":1.9,"fps":60,"frames":331,"timers":0,"hidden":true,"running":0,"paints":2,"paintAreaMpx":724.2,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":3,"layout":0,"script":20,"paint":0,"decode":0,"decodeAllThreads":0}}
{"scenario":"reduced","zoom":0.340909,"loadMs":207,"bytes":{"total":3541447,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":1.7,"fps":60.1,"frames":301,"timers":0,"running":0,"paints":0,"paintAreaMpx":0,"maxPaintMpx":0,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":0,"layout":0,"script":14,"paint":0,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan","zoom":0.340909,"loadMs":213,"bytes":{"total":3540720,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":15.6,"fps":60.1,"frames":181,"timers":12,"paints":605,"paintAreaMpx":563179414.92,"maxPaintMpx":281474943.16,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":23,"layout":1,"script":58,"paint":17,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom","zoom":0.340909,"loadMs":213,"bytes":{"total":3540720,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":15.9,"fps":59.5,"frames":181,"timers":0,"paints":1787,"paintAreaMpx":257831151844.29,"maxPaintMpx":281474943.16,"maxFrameMs":50,"slowFrames":1,"longTasks":1,"longTaskMs":58,"maxLongTask":58,"tileReqs":39,"tileReqsOff":39,"ms":{"style":52,"layout":33,"script":58,"paint":22,"decode":0,"decodeAllThreads":0}}
{"scenario":"pan-4x","zoom":0.340909,"loadMs":220,"bytes":{"total":3540720,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":9.9,"fps":59.6,"frames":181,"timers":12,"paints":603,"paintAreaMpx":563178690.7,"maxPaintMpx":281474943.16,"maxFrameMs":33,"slowFrames":1,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":62,"layout":3,"script":152,"paint":54,"decode":0,"decodeAllThreads":0}}
{"scenario":"zoom-4x","zoom":0.340909,"loadMs":218,"bytes":{"total":3540720,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":13.7,"fps":58.7,"frames":180,"timers":0,"paints":2086,"paintAreaMpx":322570432500.54,"maxPaintMpx":281474943.16,"maxFrameMs":50,"slowFrames":3,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":39,"tileReqsOff":39,"ms":{"style":168,"layout":109,"script":187,"paint":77,"decode":0,"decodeAllThreads":0}}
```

### 3.1 verdict (final-3.1, AC power, dpr 1)

| Budget | Result | |
|---|---|---|
| Idle, nothing active: GPU < 10 %, no recurring paints | 1.7 % GPU, 0 paints (`reduced`: nothing animates) | pass |
| Idle, design scene (one down, one deploy): GPU < 10 % | light 14.3 %, night 15.9 %, 120 paints/s | **miss** |
| Hidden tab: no animation frames | 0 running, 2 paints, 1.9 % GPU | pass |
| Reduced motion: no animation | 0 running, 0 paints | pass |
| Pan ≥ 55 fps, no long task > 50 ms | 60.1 fps, 0 long tasks | pass |
| Pan 4x throttle ≥ 50 fps | 59.6 fps | pass |
| Look unchanged (screenshot diff) | light 0.49 % / night 0.43 % mean | pass |

Why the design scene misses: the two marching deploy paths animate `stroke-dashoffset`, which cannot run on the compositor, so each frame repaints both road boxes (2 paints per frame). On top of that, any running animation keeps the compositor producing frames, which costs about 4 % GPU even on an empty page (see 2.1 notes). Options: march at 15 updates/s, or move the 10 % budget to the nothing-active case only. Owner decision.

Not budgeted: `zoom` has one 58 ms long task and loads 39 tiles from intermediate levels (`tileReqsOff`), while fps stays at 59.5.

### 3.2 look check

The `?still=1` screenshots compared by eye with `design/v42-*.preview.html`: same palette, plots, roads, pins, labels and panels. The differences come from the scene: the mock has 6 estates against the boards' 2, so it opens at a lower zoom and the pin chips are hidden. Night has no campfires and the stars do not twinkle (owner decision). Star brightness is unchanged from the original baseline (bright pixels 7125 then, 7276 now). `pnpm test` passes and `pnpm lint` gives 0 errors (3 old warnings in `ui/Dots.tsx`).

## 2026-11-23 march-15

commit 2006f67 (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"light","zoom":0.340909,"loadMs":209,"bytes":{"total":3540733,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":10,"fps":60,"frames":600,"timers":2,"paints":302,"paintAreaMpx":108632.42,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":91,"layout":0,"script":27,"paint":26,"decode":0,"decodeAllThreads":0}}
{"scenario":"night","zoom":0.340909,"loadMs":218,"bytes":{"total":3223280,"texture":402537,"tiles":2402094,"js":214529},"gpuPct":9.5,"fps":60,"frames":601,"timers":2,"paints":302,"paintAreaMpx":108632.42,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":98,"layout":0,"script":24,"paint":21,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":208,"bytes":{"total":3540733,"texture":537502,"tiles":2589958,"js":214529},"gpuPct":12.7,"fps":59.9,"frames":600,"timers":0,"paints":300,"paintAreaMpx":108629.82,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":110,"layout":0,"script":30,"paint":30,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":211,"bytes":{"total":3217532,"texture":402537,"tiles":2402094,"js":214529},"gpuPct":13.5,"fps":60.1,"frames":601,"timers":0,"paints":300,"paintAreaMpx":108629.82,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":142,"layout":0,"script":29,"paint":27,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 step-all-1

commit 8e8c49e (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"night","zoom":0.340909,"loadMs":212,"bytes":{"total":3217536,"texture":402537,"tiles":2402094,"js":214536},"gpuPct":7.9,"fps":60,"frames":600,"timers":2,"paints":304,"paintAreaMpx":109356.62,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":94,"layout":1,"script":32,"paint":35,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":202,"bytes":{"total":3540737,"texture":537502,"tiles":2589958,"js":214536},"gpuPct":7.7,"fps":60,"frames":601,"timers":0,"paints":300,"paintAreaMpx":108629.82,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":81,"layout":0,"script":28,"paint":36,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":210,"bytes":{"total":3217536,"texture":402537,"tiles":2402094,"js":214536},"gpuPct":8,"fps":60,"frames":600,"timers":0,"paints":300,"paintAreaMpx":108629.82,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":94,"layout":0,"script":28,"paint":36,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 step-all-2

commit 8e8c49e (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"night","zoom":0.340909,"loadMs":214,"bytes":{"total":3217536,"texture":402537,"tiles":2402094,"js":214536},"gpuPct":7.5,"fps":60,"frames":600,"timers":0,"paints":302,"paintAreaMpx":109354.02,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":93,"layout":0,"script":27,"paint":36,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":203,"bytes":{"total":3540737,"texture":537502,"tiles":2589958,"js":214536},"gpuPct":7.8,"fps":60.1,"frames":601,"timers":0,"paints":300,"paintAreaMpx":108629.82,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":79,"layout":0,"script":26,"paint":35,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":204,"bytes":{"total":3217536,"texture":402537,"tiles":2402094,"js":214536},"gpuPct":9.8,"fps":60,"frames":601,"timers":0,"paints":300,"paintAreaMpx":108629.82,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":91,"layout":0,"script":27,"paint":35,"decode":0,"decodeAllThreads":0}}
```

## 2026-11-23 step-all-3

commit 8e8c49e (dirty) · 159.0.8154.13 · Apple M1 Pro · 1440x900 dpr 1 · headless · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74)) / ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 15.5 (Build 24F74))

```json
{"scenario":"night","zoom":0.340909,"loadMs":211,"bytes":{"total":3217536,"texture":402537,"tiles":2402094,"js":214536},"gpuPct":10,"fps":60.1,"frames":601,"timers":2,"paints":304,"paintAreaMpx":109356.62,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":91,"layout":1,"script":29,"paint":37,"decode":0,"decodeAllThreads":0}}
{"scenario":"light-still","zoom":0.340909,"loadMs":201,"bytes":{"total":3540737,"texture":537502,"tiles":2589958,"js":214536},"gpuPct":7.9,"fps":60,"frames":600,"timers":0,"paints":300,"paintAreaMpx":108629.82,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":81,"layout":0,"script":27,"paint":37,"decode":0,"decodeAllThreads":0}}
{"scenario":"night-still","zoom":0.340909,"loadMs":207,"bytes":{"total":3223284,"texture":402537,"tiles":2402094,"js":214536},"gpuPct":9.6,"fps":60,"frames":600,"timers":0,"paints":298,"paintAreaMpx":107905.63,"maxPaintMpx":722.9,"maxFrameMs":17,"slowFrames":0,"longTasks":0,"longTaskMs":0,"maxLongTask":0,"tileReqs":0,"tileReqsOff":0,"ms":{"style":89,"layout":0,"script":27,"paint":36,"decode":0,"decodeAllThreads":0}}
```

### 2.1 close-out: stepped animations (step-all-1..3)

The owner OK'd a lower animation rate (a hand-animated, old-map feel): march 15/s, down pulse 12/s, lantern 15/s. A trace shows the compositor draws only when a value changes, so each step rate sets the frame count. Over 3 runs: light-still 7.7–7.9 %, night-still 8.0–9.8 % (mean 9.1), night 7.5–10.0 %, all with 30 paints/s. The idle budget now passes, with little headroom at night. Screenshot diffs pass.

Layer audit (`?still=1`, 39 layers, 47.5 Mpx): the largest are the whole-map preview `img` (16.5 Mpx, `will-change: transform`) and two world-sized `svg.live` layers (stars/lights and labels, about 10.4 Mpx each, composited for overlap). The compositor draws only the visible part of each, and none of them repaints while idle. Not changed.
