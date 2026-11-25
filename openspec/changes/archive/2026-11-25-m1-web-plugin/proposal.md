# Proposal

## Why

M1 item 6: prove the web plugin path end to end before the plugin API freezes for v1. Today every extension (`layer:garden:*`, `tab:essentials:*`) is registered by core code in `src/ext/garden.tsx`; no plugin ships web code, and the manifest's `web` entry is unused. The riskiest assumption in `docs/plugins.md` is a build-time web plugin that shares the host's Preact and hot-reloads in dev.

## What Changes

- Build-time loading: a small Vite plugin reads the `plugins:` list of the config (`SITEGARDEN_CONFIG`, default `sitegarden.yaml`), finds each manifest's `web` entry and generates `virtual:sitegarden-web-plugins`, which imports them. No runtime loading.
- Web SDK `src/ext/sdk.ts`: `defineWebPlugin({ id, register(ctx) })` with `ctx.add(extension)`, `ctx.override(id, wrap)` and read-only hooks `useNodes()` and `useNodeStatus(id)` / `useStatuses()`. Extensions may have a `title`.
- At runtime a web plugin registers only when the server reports that plugin as loaded (`/api/config` gains `plugins: string[]`), so removing a plugin from the config disables its web part without a rebuild.
- `essentials` ships `web.tsx`: a `tab:essentials:checks` side-panel tab listing every node's checks (status, detail, response time, when) from `/api/status`. The hero menu lists every resolved side-panel tab by its `title` instead of two hard-coded buttons.
- Plugin API v1 is declared frozen: `docs/plugins.md` lists the stable server and web surface; additions stay minor versions, removals need v2.
- Version 0.10.0.

## Capabilities

### New Capabilities
- `web-plugins`: build-time web plugin loading, the web SDK, runtime gating by the server's loaded plugins.

### Modified Capabilities
- None.

## Impact

- `vite.config.ts` (+ a small `vite/sitegarden-plugins.ts`), `src/ext/sdk.ts` (new), `src/ext/registry.ts`, `src/App.tsx` (load plugins, panel by tab id), `src/ui/Hero.tsx` (tab buttons), `src/live/store.ts` (checks per node already in the snapshot; expose them), `server/app.ts` (`/api/config` plugins), `plugins/essentials/web.tsx` + manifest `web`, `docs/plugins.md`, e2e spec for the new tab.
- Out of scope: third-party plugins from npm, runtime loading, the conformance kit, the settings page (item 9).
