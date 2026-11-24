# sitegarden

A self-hosted map of everything you run: repositories, CMS studios, hosts and sites, drawn as a hand-painted garden. Each project is a plot; each repo, studio or site is a building on it. You see what connects to what, whether it is up, and what is moving right now, and every link and action is one click away.

> **Status: early development.** The map, rendering pipeline and UI run on mock data. Real health checks, integrations and deployment come next (see [Roadmap](#roadmap)). There are no releases yet, and the config format may change.

## Why

Homelab mappers think in servers and racks, link dashboards are tiles, and uptime tools are lists of checks with no picture of how things connect. sitegarden is for the small-but-growing set of websites, CMSes and repos one person or a small team looks after: a graph with links, live status and actions, that is pleasant to leave open.

## Features

- **Garden map.** Projects are laid out as plots with streets, buildings and paths, generated from a seed so the layout is stable. Light and night themes, plus a plain list view ("Boring") with the same data.
- **Status at a glance.** Every status has a colour, a shape and a label; nothing relies on colour alone.
- **Rendered on the server.** The map is rendered once into content-addressed image tiles; the browser only downloads them. Unchanged config renders nothing.
- **Config in git.** One `sitegarden.yaml` describes your projects. `plan` shows what would change, `apply` renders it.

## Quick start

Requirements: Node.js 22+ and pnpm.

```sh
git clone https://github.com/PeJose/sitegarden.git
cd sitegarden
pnpm install
pnpm dev
```

Open http://localhost:5173. The API runs on port 8787 and renders the map on first start, which takes a while on the first run and is cached afterwards.

## Configuration

Projects live in `sitegarden.yaml` (override with `SITEGARDEN_CONFIG`). The file is a graph: groups (one per project), nodes (one per repo, studio or site) and edges between nodes of the same group. Plugins add node types and fields; `essentials` ships the five basic types.

```yaml
# yaml-language-server: $schema=./schema.json
world:
  seed: garden-58
plugins:
  - ./plugins/essentials
groups:
  - id: fernhill
    label: fernhill
nodes:
  - id: fernhill-repo
    type: repo            # repo | cms | site | job | db
    group: fernhill
    name: acme/fernhill
    host: GitHub
    links:
      - label: Actions
        url: https://github.com/acme/fernhill/actions
edges: []
extensions: {}            # e.g. layer:garden:labels: { disabled: true }
```

A mistake (unknown field, missing node, bad type) is reported with its line number; on a live reload the last good config stays in use. The old `estates:` shape is no longer read, see the [changelog](CHANGELOG.md).

Render from the command line:

```sh
pnpm sg plan    # what would be added, changed or removed, and how long it takes
pnpm sg apply   # render the missing tiles and publish a new release atomically
pnpm sg schema  # write schema.json (git-ignored) for editor completion and validation
```

While `pnpm dev` runs, saving `sitegarden.yaml` triggers `apply` automatically and open browsers pick up the new map.

| Variable | Default | Purpose |
|---|---|---|
| `SITEGARDEN_CONFIG` | `sitegarden.yaml` | config file |
| `SITEGARDEN_DATA` | `.data` | rendered artifacts and releases |
| `PORT` | `8787` | API port |
| `SG_RENDER_WORKERS` | CPU cores − 2 | parallel render workers |

## Development

```sh
pnpm test       # unit tests
pnpm lint       # oxlint
pnpm build      # type-check and production build
pnpm sg schema  # regenerate schema.json after adding a plugin
pnpm perf       # performance measurements, see perf/README.md
```

How rendering works is described in [docs/rendering.md](docs/rendering.md).

## Roadmap

| Milestone | Scope |
|---|---|
| Seed | core, plugin host, HTTP checks, Docker + Tailscale, auth |
| Roots and lanterns | GitHub status and deploy button, animated flows |
| Weather station | expiries, heartbeats, alerts |
| Visitors | webhooks, logs, Lighthouse history |
| Toolshed | plugin gallery, CLI, MCP server |

The full plan is in [docs/plan.md](docs/plan.md); feature list in [docs/features.md](docs/features.md), plugins in [docs/plugins.md](docs/plugins.md), security model in [docs/security-model.md](docs/security-model.md), visual design in [docs/visual.md](docs/visual.md).

## Security

sitegarden is meant to run privately (behind Tailscale or a VPN), because it holds tokens that can deploy your sites. See the [security model](docs/security-model.md) for how it is meant to be deployed, and [SECURITY.md](SECURITY.md) for reporting a vulnerability.

## License

Not decided yet. Until a license is added, all rights are reserved.
