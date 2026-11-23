# sitegarden web (visual POC)

The map is rendered on the server once and only downloaded by the browser. `pnpm install && pnpm dev` (http://localhost:5173, API on 8787), `pnpm build`, `pnpm preview` (production build with the service worker), `pnpm test`.

## Render pipeline

`sitegarden.yaml` is the input (estates, nodes, edges). Layout positions live apart in `.data/positions.json`.

- `pnpm sg plan`: estates added/changed/removed, artifacts still to render, estimated time.
- `pnpm sg apply`: renders the missing artifacts, publishes `release-<id>.json` and atomically points `current` at it. It renders tile by tile, the light preview and the tiles of the initial view first (`order` in `plan.ts`), then their neighbours, then night and the other levels, and republishes as tiles appear (`rev` in the release). The client reports visible tiles that are still missing (`POST /api/want`); those jump the queue.
- `pnpm dev` runs apply on start and whenever `sitegarden.yaml` changes; "plant an estate" and `POST/DELETE /api/estates` only edit that file. The browser learns about new releases over SSE (`/api/events`).
- Env: `SITEGARDEN_DATA` (data dir, default `web/.data`), `SITEGARDEN_CONFIG` (default `web/sitegarden.yaml`), `SG_RENDER_WORKERS` (default cpus - 2; renders run at nice 10).

Artifacts are files in `.data/a/` named by the hash of their exact inputs (SVG, theme, zoom, renderer version), so the same config renders nothing twice:

| file | what | granularity |
|---|---|---|
| `layer-soft-*` | the costly watercolour filters (land edge, washes, trees), rendered at `WC` px/unit (half or less of the level's) and shared by levels 2 and 3 | per estate / per tile |
| `layer-texture-*` | paper grain, specks, fibres (seamless, repeated every 1024 units) | per theme and zoom |
| `layer-terrain-*` | soft layer enlarged, plus full-resolution streets, houses and lamps (wobbled as geometry, no filter) | per tile |
| `layer-estate-*` | one plot: soft land enlarged x paper grain at full resolution, plus roads, trees, buildings, paths, lamps at full resolution | per estate (sliced into tiles when flattened) |
| `tile-*.webp` | the flattened tile the client downloads | per tile, theme, zoom |
| `preview-*.webp` | whole map in one small image | per theme |
| `world-*.json`, `config-*.json` | geometry and the node config | per release |

Zoom levels are 0.125 / 0.5 / 1 / 2 px per world unit (level 0 only feeds the preview). Files not referenced by the current release are deleted after a complete apply. The browser loads `/api/release` (tiny), the preview, then visible tiles; `/a/*` is `immutable`, and `public/sw.js` (production only) keeps it all for offline revisits.

## Code

- `src/gen`: seeded isomorphic generator (`world`, `estate`, `hood`) and the SVG layer functions in `render.ts`.
- `server/`: `plan.ts` (hash everything), `apply.ts` (render, flatten, publish), `store.ts` (data dir, releases, GC), `config.ts` (YAML), `index.ts` (Hono, watcher, SSE), `sg.ts` (CLI).
- `src/map`: React Flow is the pan/zoom viewport and the pin layer; server tiles follow its transform. Chips and path labels fade out by on-screen size (see `MapView`).
- `src/mock`: data and the fake live engine. `src/Boring.tsx`: Boring.dc.html.
- URL helpers: `?theme=night`, `?style=boring`, `?select=goldcrisp-site`, `?panel=inventory|links`, `?still=1` (freeze the mock scene).
