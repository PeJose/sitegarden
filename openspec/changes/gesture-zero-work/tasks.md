# Tasks

## 1. Labels in tiles

- [ ] 1.1 Fonts on the server renderer (D2). Verify: one tile with text renders identically on the dev box and in Docker.
- [ ] 1.2 `labelsSvg` per level and theme, composited into tiles and the preview; `RENDERER = 'r9'`; client `Labels` removed (D1, D3). Verify: unit tests for per-level sizes and visibility; screenshots light/night at three zooms.

## 2. Zero work during gestures

- [ ] 2.1 Engine computes visible/wanted/missing cells and the settled level; `/api/want` from the engine (D4). Verify: unit tests; existing e2e.
- [ ] 2.2 Pins/chips layer scales with the map during a gesture and settles after 200 ms; no Preact render during pan or pinch (D4, D5). Verify: e2e render-count test; headless phone harness numbers.

## 3. Close-out

- [ ] 3.1 `docs/rendering.md`, CHANGELOG 0.12.0 (note the one-time full re-render), `package.json` 0.12.0. Verify: `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e`.
