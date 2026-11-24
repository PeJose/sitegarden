# Design

## Context

After own-viewport the client imports only `react` and `react-dom/client`; no dependency imports React. Audit results and exact setup: `/private/tmp/claude-502/-Users-maciej-Projects-personal-sitegarden/21f0c716-c8d1-4da2-b6a8-33259f9b9a65/scratchpad/preact-audit.md` (sections 3, 4, 6).

## Decisions

### D1. Setup
`preact@~10.29` (not 11), `@preact/preset-vite` (dev) replacing `@vitejs/plugin-react` in `vite.config.ts`. `tsconfig.app.json`: `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`, `paths` mapping `react`, `react/jsx-runtime`, `react-dom`, `react-dom/*` to `preact/compat` / `preact/jsx-runtime` (exact block in the audit). Source keeps importing from `'react'` (compat alias), so a later switch to native `preact/hooks` imports is optional, file by file.

### D2. Type fixes
The four from the audit: `App.tsx` `useRef<T | undefined>(undefined)`, `TileLayer.tsx` `JSX.TargetedEvent<HTMLImageElement>`, `CommandBar.tsx` `e.currentTarget.value`, `StatusStrip.tsx` `relatedTarget as Node | null`.

### D3. Behaviour checks
Native-event differences: `CommandBar` input (`onChange` maps to `input` in compat) and `StatusStrip` blur with `relatedTarget`; SVG `textPath` `href`. Checked in headless Chrome by script (type in the command bar, tab out of the status strip, labels visible), no console errors.

### D4. Zoom tile requests
own-viewport's zoom scenario requested 58 tiles vs 42 with React Flow. Compare the viewport sequences of both builds during the scripted wheel zoom (zoom per frame, when `levelFor` changes level, when TileLayer mounts). If the own viewport crosses levels more often or mounts tiles mid-gesture where React Flow did not, fix it in the viewport/tile code to match; if the difference is a measurement artefact, document it in results.md. Done before the Preact swap so the A/B isolates the runtime.

### D5. Measurement
Same as own-viewport D6: AC power checked with `pmset -g batt`, interleaved A/B (A = current branch head before the swap, B = Preact), 3 runs of `light,pan,pan-4x,zoom,zoom-4x`, screenshot diff, bundle sizes. Budgets: pan ≥ 55, pan-4x ≥ 50, no new long tasks, idle GPU within noise, main chunk ≤ 50 KB gzip.

## Risks / Trade-offs

- [No StrictMode double-invoke in dev] → accepted; the mock engine's StrictMode comment is removed.
- [Future plugins using React 19-only APIs] → plugins are build-time and compiled against the same compat; document the supported API in docs/plugins.md.
