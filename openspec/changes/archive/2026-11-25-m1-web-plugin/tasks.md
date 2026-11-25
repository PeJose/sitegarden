# Tasks

## 1. Loading

- [x] 1.1 Vite plugin and virtual module (D1). Verify: unit test of the generator with fixture manifests (with/without `web`, missing manifest error).
- [x] 1.2 Web SDK, `title` on extensions, gating and isolation, `/api/config` plugins (D2, D3). Verify: unit tests for the id check, gating by server list, a throwing `register`; app test for `/api/config` `plugins`.

## 2. Checks tab

- [x] 2.1 Store keeps `checks` and updates them on `check.result`; `useNodes`/`useStatuses` (D2). Verify: store tests.
- [x] 2.2 `plugins/essentials/web.tsx`, manifest `web`, panels by id, hero menu from tabs (D4, D5). Verify: e2e test opens Checks from the hero menu and sees a `fernhill-site` row; existing e2e still pass; `?still=1` screenshot diff within thresholds (hero menu unchanged when only the old tabs show? it now shows a third button: record the diff numbers and confirm only the menu changed); manual HMR check in `pnpm dev` (headless is fine: edit, see the module update in the Vite log).

## 3. Close-out

- [x] 3.1 `docs/plugins.md` frozen v1 section (D6), README note, CHANGELOG 0.10.0, `package.json` 0.10.0, `docs/plan.md` item 6 done. Verify: `pnpm test`, `pnpm build`, `pnpm e2e`, lint no errors.
