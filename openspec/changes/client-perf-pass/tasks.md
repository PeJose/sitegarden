# Tasks

## 1. Measure

- [ ] 1.1 Add `web/scripts/perf.ts` and a `pnpm perf` script (design D1): headed system Chrome via `playwright-core`, scenarios `light`, `night`, `light-still`, `night-still`, `pan`, `pan-4x`, printing JSON and appending to `web/perf/results.md`. Verify: `pnpm build && pnpm preview` then `pnpm perf` prints six JSON lines and appends one dated block.
- [ ] 1.2 Make the script also save `light-still.png` / `night-still.png` and diff them against a given baseline directory with sharp (D7). Verify: running twice with no code change reports a diff under threshold.
- [ ] 1.3 Record the baseline: run `pnpm perf` on the current code, commit `web/perf/results.md` and baseline screenshots, and add a short "Top costs" note (which layers repaint, GPU %, fps). Verify: the note names the hot spots from the trace.
- [ ] 1.4 Document the procedure in `web/perf/README.md` (prereqs, commands, what each number means). Verify: the README commands run as written.

## 2. Fix

- [ ] 2.1 Move the paper texture to a viewport-sized background outside `.world` (D5). Verify: no visible seam when panning; screenshot diff under threshold; re-run `pnpm perf` and log the numbers.
- [ ] 2.2 Split `Live` into a static world SVG plus per-element boxes for flowing roads and lanterns (D2). Verify: trace paints only those boxes in `night-still`; screenshot diff under threshold; log numbers.
- [ ] 2.3 Render star twinkle and fire flicker at a fixed phase (D3) and remove their infinite animations. Verify: `night-still` shows no paints from stars/fires; log numbers.
- [ ] 2.4 Mount the red wash only for down buildings, in its own box; rasterise it if the numbers say the live filter is costly (D4, record which and why in results.md). Verify: the down building in the design scene still shows the wash; screenshot diff under threshold; log numbers.
- [ ] 2.5 Pause remaining animations when the tab is hidden (D6) and confirm reduced motion still disables them. Verify: with the tab hidden for 5 s, a trace shows no animation frames; with DevTools "prefers-reduced-motion: reduce", nothing animates.
- [ ] 2.6 Only if the trace shows `Labels`/`TileLayer` long tasks during pan: memoise their output (D6). Verify: `pan` and `pan-4x` long-task totals drop; log numbers. Otherwise mark done with a note in results.md.

## 3. Check the budget

- [ ] 3.1 Run the full `pnpm perf` on the final code and compare with the spec budgets (idle GPU < 10%, pan ≥ 55 fps, pan-4x ≥ 50 fps). Verify: results.md has a final block that meets every budget, or lists which one misses and why.
- [ ] 3.2 Compare `?still=1` light and night by eye against `design/v42-Light`/`v42-Night` previews. Verify: no visible difference beyond animation phase; `pnpm test` and `pnpm lint` pass.

## Workflow follow-up

- Archive the change after review (`/opsx:archive client-perf-pass`).
