# Proposal

## Why

Second half of pre4 (owner decision 2026-11-24): with React Flow gone, React itself is about 61 KB of the 99 KB gzip main chunk. The audit (scratchpad `preact-audit.md`) found every React API the app uses is supported by `preact/compat` 10.x and the probe build came out at about 38 KB gzip.

## What Changes

- React 19 is replaced by Preact 10 (`~10.29`) through `preact/compat` and `@preact/preset-vite`; `react`, `react-dom`, their types and `@vitejs/plugin-react` are removed.
- Four type fixes the Preact types require.
- The zoom scenario's extra tile requests after own-viewport (58 vs 42) are explained and, if they come from the viewport port, fixed.
- `docs/plan.md` and `docs/plugins.md` describe the new stack: own viewport, Preact, build-time web plugins, and pre4 in the M1 list.
- Signals are not added in this change; only if a later perf A/B shows a gain.

## Capabilities

### New Capabilities
- `web-bundle`: how much JavaScript the first page load needs.

### Modified Capabilities

## Impact

- Web: `package.json`, `vite.config.ts`, `tsconfig.app.json`, `src/App.tsx`, `src/map/TileLayer.tsx`, `src/ui/CommandBar.tsx`, `src/ui/StatusStrip.tsx`; possibly `src/map/viewport.ts` / `TileLayer.tsx` for the tile requests.
- Docs: `docs/plan.md`, `docs/plugins.md`, `docs/visual.md` where they name React.
- Version: next minor after 0.6.0 (0.7.0).
