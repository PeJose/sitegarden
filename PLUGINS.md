# sitegarden — plugin system

Goal: a user can swap the theme, add their own buildings, node types, connections and integrations, and replace the main puzzles (map layers, lists, side-panel tabs) without touching the core. The core is small and untouchable.

Design copies, in order of influence: **Backstage's new frontend system** (extension tree, replace by ID, disable in config), **VS Code** (declarative `contributes`, lazy activation, API version range), **Grafana** (import map with shared React), **tldraw** (custom shape = small class with schema and migrations), **Obsidian** (every registration returns a disposer).

## The core (untouchable)

The core knows about graphs, time and permissions. It does not know about GitHub, Sanity or gardens.

| Core part | Does |
|---|---|
| Graph model | Entities (nodes), relations (edges), groups (plots). IDs, the YAML envelope, validation |
| Plugin host | Load, version check, permissions, lifecycle, disposers, error isolation |
| Extension tree | Root slots, attach, replace by ID, disable from config, "who replaced what" log |
| Scheduler | Intervals, jitter, backoff, concurrency limits, manual refresh |
| Store | SQLite: cache with `fetched_at`, append-only events, status snapshots, per-plugin key-value namespace |
| Secrets broker | Resolves `${secret:NAME}`, injects auth into outbound requests, SSRF guard |
| Event bus | Typed events, pushed to the browser over SSE with `Last-Event-ID` catch-up |
| Status vocabulary | Fixed: `ok`, `degraded`, `down`, `working`, `paused`, `unknown`. Every plugin maps onto it |
| Auth and audit | Sessions, roles, audit log |
| Web shell | Routing, root slots, command palette, theme token pipeline |

Core services (scheduler, store, secrets, auth, status vocabulary) can never be replaced. Everything visual and every integration can.

## Two kinds of contribution

| Kind | What | Runs code? | Trust tier |
|---|---|---|---|
| **Declarative** | themes (tokens), building packs (SVG + `pack.json`), shorthands, link templates, view definitions | no | A |
| **Code** | sources, checks, actions, node renderers, layers, views, notifiers | yes | B (later C/D) |

Declarative contributions are listed in the manifest, so the gallery and permission prompt can show what a plugin does before any of its code runs.

## Manifest

`package.json` → `sitegarden` key, validated with Zod:

```ts
const Manifest = z.object({
  id: z.string(),                               // "netlify"
  apiVersion: z.string(),                       // semver range, e.g. "^1" (like engines.vscode)
  dependsOn: z.record(z.string()).optional(),   // other plugin ids + ranges
  server: z.string().optional(),                // ESM entry
  web: z.string().optional(),                   // ESM entry (React)
  activation: z.array(z.string()).default(['startup']), // 'onNodeType:netlify', 'onView:deploys' …
  contributes: z.object({
    themes: z.array(z.string()).optional(),          // tokens.json paths
    buildingPacks: z.array(z.string()).optional(),   // pack.json paths
    shorthands: z.array(ShorthandDecl).optional(),
    nodeTypes: z.array(z.object({ id: z.string(), extends: z.string().optional() })).optional(),
    edgeTypes: z.array(z.string()).optional(),
    views: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
    configSchema: z.string().optional(),             // module exporting Zod fragments
  }),
  permissions: z.object({
    network: z.array(z.string()).default([]),       // hosts
    secrets: z.array(z.string()).default([]),       // secret names
    actions: z.array(z.string()).default([]),
  }),
  tier: z.enum(['trusted', 'worker']).default('trusted'),
})
```

## Extension tree (web side)

Every visual contribution is an extension with an ID `kind:plugin:name` that attaches to an input of a parent.

Root slots defined by the core:

| Slot | Input | Filled by |
|---|---|---|
| `map` | `layers` | `layer:*` extensions, ordered by `order` |
| `sidepanel` | `tabs` | `tab:*` |
| `nav` | `views` | `view:*` |
| `palette` | `commands` | `command:*` |

Default map layers (from `@sitegarden/theme-garden`):

`paper (0)` → `terrain (10)` → `plots (20)` → `edges (30)` → `nodes (50)` → `flows (60)` → `status (70)` → `labels (80)`

```ts
export default defineWebPlugin({
  id: 'garden',
  extensions: [
    LayerExtension({ name: 'terrain', order: 10, render: TerrainLayer }),
    LayerExtension({ name: 'nodes', order: 50, render: BuildingsLayer }),
    BuildingRenderer({ nodeType: 'site', pack: 'cottage' }),
  ],
})
```

### Replace, wrap, disable

- **Replace:** register the same ID. Load order comes from the `plugins:` list in YAML; the last one wins. Every override is logged and shown on the extension inspector page.
- **Wrap:** `ext.override({ render: (orig) => (props) => <Frame>{orig(props)}</Frame> })`.
- **Disable or configure** from YAML:

```yaml
extensions:
  layer:garden:terrain: { disabled: true }
  view:essentials:health: { config: { columns: [name, status, uptime_7d] } }
```

- **Plugin-to-plugin:** a plugin can define its own inputs. Example: the Netlify plugin adds `netlify:deploy-targets`, and a separate "deploy-flow" plugin consumes it.

### Custom buildings (the tldraw lesson)

A building renderer is a small object:

```ts
BuildingRenderer({
  nodeType: 'site',
  propsSchema: z.object({ floors: z.number().default(1) }),
  geometry: (props) => ({ footprint, anchor, hitbox }),  // where paths attach, what is clickable
  render: (props, status) => <Cottage {...props} lit={status === 'ok'} />,
  migrations: [],                                        // when propsSchema changes
})
```

A **building pack** is the declarative version: SVG variants per node type plus `pack.json` with anchor points and footprint. Pack SVGs are sanitised on load (no `<script>`, `foreignObject`, event handlers or external hrefs) and rendered via `<img>` or `<use>`, never `dangerouslySetInnerHTML`.

## Server side

Typed registries: `sg.nodeTypes`, `sg.shorthands`, `sg.sources`, `sg.checks`, `sg.actions`, `sg.flows`, `sg.notifiers`, `sg.importers`. Each `add` returns a disposer, and `ctx.register*` collects them so unloading and hot reload never leak.

```ts
export default definePlugin({
  id: 'netlify',
  dependsOn: { essentials: '^1' },
  register(ctx) {
    ctx.registerNodeTypeExtension('site', { shorthand: 'netlify', schema: NetlifySiteSchema })
    ctx.registerSource({ id: 'netlify-deploys', every: '5m', fetch: (c) => c.http('netlify').get('/sites/...') })
    ctx.registerAction({ id: 'deploy', label: 'Deploy', run: (c, node) => { /* ... */ } })
    return { api: { listSites } }   // exposed to other plugins
  },
})
```

- **Hooks** (via `unjs/hookable`) only for cross-cutting pipelines: `status.changed`, `action.before`, `action.after`, `config.resolved`. Each with `order: 'pre' | 'normal' | 'post'` (the Vite pattern). Registries, not hooks, are the main mechanism.
- **Dependency injection:** `ctx.use('github')` returns that plugin's exported API, typed by module augmentation:
  `declare module '@sitegarden/sdk' { interface Services { github: GithubApi } }`

## Loading web plugins without rebuilding

- **Import map with shared React, no Module Federation.** Grafana uses the same pattern (SystemJS plus an import map with externalised shared deps).
- The server builds one inline `<script type="importmap">` **per request** from the enabled plugin list. It maps `react`, `react-dom`, `@xyflow/react` and `@sitegarden/sdk` to files the host serves. (Changing the import map after load needs Chrome 135+ or Safari 18.4+ and fails on conflicts; Firefox has no support. So the map is static per page load.)
- Plugins are built with Vite library mode (`formats: ['es']`, those four externalised) and loaded with `import('/plugins/<id>/web.js')`, with the `integrity` hash from the lockfile and a CSP.
- Native import maps: Chrome 89+, Firefox 108+, Safari 16.4+. `es-module-shims` only as a fallback.
- The conformance kit fails a plugin whose bundle contains its own React (two Reacts is the classic failure).
- Dev mode: `sitegarden dev ./my-plugin` loads the plugin from its Vite dev server and swaps it live.

## Config schema merging

- Each plugin exports Zod fragments keyed by where they attach (`nodeTypes.site.fields`, `checks.http`, plugin `config`).
- The core builds one root schema: node types become `z.discriminatedUnion('type', …)`; shorthand fields are optional keys on the owning type.
- `z.toJSONSchema(root, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' })`. Avoid `transform`, `date` and `custom` in config schemas (they throw by default). Use `.meta({ description })` for editor hover docs.
- Served at `/schema.json` and written to disk by the CLI. `sitegarden.yaml` starts with `# yaml-language-server: $schema=./schema.json` so editors autocomplete every plugin's fields.
- The same schema auto-generates the plugin settings forms in the UI.

## Theming

- A theme is a tokens file in **W3C DTCG format** (`$value`, `$type`, `{alias}`), using the stable subset (color, dimension, duration, fontFamily) plus `$extensions.sitegarden` for custom data. The DTCG spec is still a draft, so keep to that subset.
- The core compiles tokens to CSS custom properties on `:root[data-theme=…]`. Light, dark and night are separate token sets.
- A theme that needs a different look, not just colours, replaces layer extensions by ID.
- React Flow `nodeTypes` / `edgeTypes` objects are rebuilt only when the plugin set changes, never per render (React Flow requirement).

## Isolation tiers

| Tier | What | Isolation | When |
|---|---|---|---|
| **A** | Declarative: themes, packs, shorthands, link templates | No code; SVG sanitised | Default for anyone's pack. MVP |
| **B** | Trusted code in-process: first-party and local folders | Host HTTP client enforces the network allowlist and injects only granted secrets; lockfile pins version + hash | MVP. "Code you chose to install", stated plainly |
| **C** | `worker_threads` with only a message API (`ctx.http`, `ctx.store`, `ctx.emit`) | Crash and timeout isolation, capability discipline. **Not** a security boundary | Later, opt-in (`tier: worker`); user scripts |
| **D** | WebAssembly via Extism; host functions are the only capability (Helm 4 does this) | Real sandbox | Only if a real untrusted-plugin ecosystem appears |

Untrusted UI in the browser: a sandboxed iframe without `allow-same-origin`, talking only through `postMessage`, as Figma's plugin UI does.

Not used as a boundary:

- Node's permission model: its docs call it a seat belt, not a sandbox.
- `isolated-vm`: in maintenance mode, and it needs `--no-node-snapshot` on Node 20+.

## Versioning and quality

- `apiVersion` is a semver range checked against the SDK major version. An incompatible plugin is refused with a clear message.
- Keep the SDK surface narrow; mark new APIs `@experimental`; rename hooks via `deprecateHook` with warnings.
- `@sitegarden/plugin-test` conformance kit: manifest, schema merge, React externalised, permissions declared, disposers called.
- **Before freezing the SDK, prototype one web plugin end to end** (import map, shared React, hot reload). This is the riskiest assumption in the design.

## Pitfalls

1. Two copies of React. Externalise, and fail loudly in the conformance kit.
2. Treating Node `--permission` or `vm` as a sandbox.
3. A wide SDK. Every export is a promise.
4. Silent overrides. Always log them and show "who replaced what".
5. Dependency conflicts between plugins (the Home Assistant / HACS failure). Plugins bundle their own deps; only the SDK set is shared.
6. SVG packs as an XSS vector.
7. A core that grows a PR queue for widgets (Homepage's situation). Writing a plugin must be easier than a core PR.
8. Registrations without disposers. Hot reload leaks.
9. Building marketplace security before there are third parties. Tiers A and B plus an honest README are enough for a long time.

## Sources

- [VS Code activation events](https://code.visualstudio.com/api/references/activation-events)
- Grafana: [plugin types](https://grafana.com/developers/plugin-tools/key-concepts/plugin-types-usage), [npm dependencies / externals](https://grafana.com/developers/plugin-tools/key-concepts/npm-dependencies), [plugin.json](https://grafana.com/developers/plugin-tools/reference/plugin-json), [Module Federation discussion](https://www.github.com/grafana/plugin-tools/discussions/202)
- Backstage: [frontend extensions](https://backstage.io/docs/frontend-system/architecture/extensions), [extension overrides](https://backstage.io/docs/frontend-system/architecture/extension-overrides), [backend extension points](https://backstage.io/docs/backend-system/architecture/extension-points)
- [tldraw shapes](https://tldraw.dev/docs/shapes), [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines), [Node-RED packaging](https://nodered.org/docs/creating-nodes/packaging), [Homepage discussions](https://github.com/gethomepage/homepage/discussions)
- [unjs/hookable](https://github.com/unjs/hookable), [Vite plugin API](https://vite.dev/guide/api-plugin), [es-module-shims](https://github.com/guybedford/es-module-shims), [Vite federation article](https://dev.to/unadlib/vite-plugin-federation-10-bringing-module-federation-into-the-production-era-for-vite-2bff)
- [Zod JSON Schema](https://zod.dev/json-schema), [DTCG format draft](https://www.designtokens.org/tr/drafts/format/), [React Flow custom nodes](https://reactflow.dev/learn/customization/custom-nodes)
- [Node permissions](https://nodejs.org/api/permissions.html), [isolated-vm](https://github.com/laverdet/isolated-vm), [Extism JS SDK](https://github.com/extism/js-sdk), [How Figma built its plugin system](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/)
