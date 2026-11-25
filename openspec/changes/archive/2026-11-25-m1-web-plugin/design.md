# Design

## Context

`src/ext/tree.ts` has `createRegistry()` (add, override, resolve with per-extension error boundary); `src/ext/registry.ts` holds the one registry and fetches `/api/config` (`extensions:` from YAML) into `extConfig`; `src/ext/garden.tsx` registers the first-party layers and the two side-panel tabs (`tab:essentials:inventory|links`, rendered by `src/ui/Panels.tsx`). `src/App.tsx` opens a panel via `registry.resolve('sidepanel','tabs',…).find(t => t.id === 'tab:essentials:' + panel)`; `src/ui/Hero.tsx` has two hard-coded buttons. Statuses live in `src/live/store.ts` (`useEngine(select)`); node config in `src/mock/data.ts` (`nodes`, `groups`); the `/api/status` snapshot includes `checks: [{id,status,detail,at,ms}]` per node and the store spreads it into node state. Server plugin manifests are `plugins/*/package.json` → `sitegarden`; `server/core/plugins.ts` has `host.plugins()` with `{id, status}`. Preact via `preact/compat` aliases (`@preact/preset-vite`).

## Goals / Non-Goals

**Goals:** one real first-party web plugin through the same path a third-party one would use; HMR in dev; the API surface written down and frozen for v1. **Non-Goals:** npm-installed plugins, runtime loading, conformance kit.

## Decisions

### D1. Build-time loading
`vite/sitegarden-plugins.ts` exports a Vite plugin: `resolveId('virtual:sitegarden-web-plugins')` → `\0…`; `load` reads the config file (path from `SITEGARDEN_CONFIG`, default `<root>/sitegarden.yaml`), parses `plugins:` (YAML, `yaml` package already installed), resolves each entry relative to the config's directory, reads its `package.json` `sitegarden` manifest, and for each with `web` emits `import p0 from '<abs path to web entry>'` and `export default [p0, …]`. Missing `web` → skipped. Unreadable manifest → build error naming the plugin (the build must not silently drop a plugin). `SITEGARDEN_DEMO` is not considered (mock has no web part). The config file and every manifest are added with `this.addWatchFile` so dev picks up changes. Registered in `vite.config.ts`. A plugin's web entry is plain TS/TSX compiled by the host build, so `react` imports resolve to the host's `preact/compat`.

### D2. Web SDK (`src/ext/sdk.ts`)
```ts
export interface WebPluginContext { id: string; add(ext: Extension): void; override(id: string, wrap: (o: Render) => Render): void }
export interface WebPlugin { id: string; register(ctx: WebPluginContext): void }
export const defineWebPlugin = (p: WebPlugin) => p
export const useNodes: () => { id: string; type: string; name: string; group: string }[]
export const useStatuses: () => Record<string, { status: Status; lastChecked: number; responseMs: number | null; checks: CheckState[] }>
export const WEB_SDK_VERSION = '1.0.0'
```
- `ctx.add` requires the extension id's plugin segment (`kind:<plugin>:name`) to equal the plugin id; otherwise it throws (caught by the loader, D3).
- `useStatuses` selects from the live store; `CheckState = { id, status, detail: string | null, at: number, ms: number | null }`. The live store keeps `checks` from the snapshot and updates the matching entry on `check.result` (status, detail, ms, at = now). Add `detail` to the `check.result` handling if missing.
- Extensions get optional `title: string` (`Extension` in `tree.ts`).
- Plugins import only from `src/ext/sdk.ts` (path alias `@sitegarden/web-sdk` in `vite.config.ts` and `tsconfig.app.json`), never from other `src/` files. Re-export `Extension`, `Render`, `Status` types from the SDK.

### D3. Runtime gating and isolation
- `/api/config` returns `{ extensions, plugins: host.plugins().filter(p => p.status === 'loaded').map(p => p.id) }`.
- `src/ext/registry.ts`: after `configReady`, for each module from the virtual import whose `id` is in `plugins`, call `register(ctx)` inside try/catch; a throw logs `[sitegarden] web plugin <id> failed` and that plugin's extensions are removed (track what it added). The map waits for `configReady` as today, so tabs never flash.
- Core extensions stay registered by `garden.tsx` with plugin segment `garden`/`essentials` as today; the two existing `tab:essentials:*` tabs stay in core for now (moving `Panels.tsx` into the plugin needs more SDK surface than v1 should freeze). They get titles "All services" and "All links".

### D4. Checks tab (`plugins/essentials/web.tsx`)
`defineWebPlugin({ id: 'essentials', register: (ctx) => ctx.add({ id: 'tab:essentials:checks', slot: 'sidepanel', input: 'tabs', title: 'Checks', render: ({ onClose, onPick }) => <ChecksPanel … /> }) })`. The panel reuses the existing panel CSS classes (look at `Panels.tsx` markup and copy its structure, no new design): a list grouped by group label, one row per check: node name, check id, status dot/label, detail, `ms`, relative time. Clicking a row calls `onPick(nodeId)`. Nodes with no checks are not listed; empty state "No checks configured". The manifest gets `"web": "./web.tsx"`.

### D5. Panels by id
`App.tsx` panel state becomes a tab id (string | null); `?panel=inventory|links|checks` maps to `tab:essentials:<x>`. `Hero.tsx` renders one button per `registry.resolve('sidepanel','tabs', extConfig.extensions)` with `${title} →`, in order (inventory, links, checks: set `order` 10, 20, 30). A disabled tab disappears from the menu.

### D6. Freeze
`docs/plugins.md` gets a "Plugin API v1 (frozen)" section listing exactly: server `definePlugin`, `PluginContext` members (as in `server/core/sdk.ts`), `CheckResult`, `Status`; web `defineWebPlugin`, `WebPluginContext`, `useNodes`, `useStatuses`, `Extension` fields, slots `map/layers` and `sidepanel/tabs`. Rule: additive changes bump the minor (`SDK_VERSION` / `WEB_SDK_VERSION`), removals or changed meaning need v2. Replace the "prototype one web plugin" open item with a pointer to `plugins/essentials/web.tsx`.

## Testing

Unit: the virtual module generator (fixture config + manifests: with and without `web`, missing manifest → error); SDK `ctx.add` id check; gating (plugin not in server list → not registered; throwing `register` → its extensions removed, others kept); store keeps and updates `checks` on `check.result`. E2E: open the Checks tab from the hero menu, a row for `fernhill-site` with a status appears; with `extensions: { 'tab:essentials:checks': { disabled: true } }` it is absent (or assert via `/api/config` + unit test if a second e2e config is too heavy). Manual: `pnpm dev`, edit `web.tsx`, the tab updates without a full reload (HMR).

## Risks / Trade-offs

- [Build reads the config at build time] → a plugin added at runtime has no web part until rebuild; documented.
- [Freezing too early] → v1 surface is deliberately small; everything else stays internal.

## Migration Plan

Additive. Version 0.10.0, CHANGELOG, `docs/plugins.md`.
