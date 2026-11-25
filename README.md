# sitegarden

A self-hosted map of everything you run: repositories, CMS studios, hosts and sites, drawn as a hand-painted garden. Each project is a plot; each repo, studio or site is a building on it. You see what connects to what, whether it is up, and what is moving right now, and every link and action is one click away.

> **Status: early development.** The map shows real check results from the server (the sample config runs a `mock` plugin so it looks alive). Integrations and deployment come next (see [Roadmap](#roadmap)). There are no releases yet, and the config format may change.

## Why

Homelab mappers think in servers and racks, link dashboards are tiles, and uptime tools are lists of checks with no picture of how things connect. sitegarden is for the small-but-growing set of websites, CMSes and repos one person or a small team looks after: a graph with links, live status and actions, that is pleasant to leave open.

## Features

- **Garden map.** Projects are laid out as plots with streets, buildings and paths, generated from a seed so the layout is stable. Light and night themes, plus a plain list view ("Boring") with the same data.
- **Status at a glance.** Every status has a colour, a shape and a label; nothing relies on colour alone.
- **Rendered on the server.** The map is rendered once into content-addressed image tiles; the browser only downloads them. Unchanged config renders nothing.
- **Config in git.** One `sitegarden.yaml` describes your projects. `plan` shows what would change on the server, `apply` stores it as the next revision and renders it.

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

Projects live in `sitegarden.yaml` (override with `SITEGARDEN_CONFIG`). The file is a graph: groups (one per project), nodes (one per repo, studio or site) and edges between nodes of the same group. Plugins add node types and fields; `essentials` ships the five basic types and a Checks tab in the hero menu. A plugin can also ship a web part (manifest `web`), compiled into the web build at build time from the config's `plugins:` and shown only while the server has the plugin loaded (see [docs/plugins.md](docs/plugins.md)).

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
    repo: acme/fernhill   # shorthand: Actions, Settings, Secrets, Pull requests and Issues links
edges: []
extensions: {}            # e.g. layer:garden:labels: { disabled: true }
```

A mistake (unknown field, missing node, bad type) is reported with its line number, and the server keeps its last good config. The old `estates:` shape is no longer read, see the [changelog](CHANGELOG.md).

The server's applied config is the state, stored as numbered revisions. The file is only imported once, as rev 1, when the server starts with an empty store; after that the server ignores it. Change the config through the CLI (or the GUI, which makes revisions too):

```sh
pnpm sg pull    # first time: record the server's rev (and write its config to the file)
pnpm sg plan    # validate the local file on the server: errors with lines, or what changes and what renders
pnpm sg apply   # the same plan, asks for confirmation (--yes skips), stores the next rev and waits for the release
pnpm sg pull    # bring server-side (GUI) edits home
pnpm sg schema  # write schema.json (git-ignored) for editor completion and validation
```

`--server URL` (or `SITEGARDEN_SERVER`, default `http://localhost:8787`) picks the server. `plan` and `apply` refuse when the server has a newer rev than the one you last pulled or applied (exit code 3); `pull` refuses to overwrite local edits that were never applied unless `--force`. `apply --local-render` renders the missing tiles on your machine and uploads them, so the server renders nothing (both need the same renderer version). `--no-wait` returns once the rev is stored. The last pulled or applied rev is kept in `.sitegarden/state.json` next to the config (git-ignored). `auth.enabled: true` is rejected until real auth exists, so the config cannot lock itself.

### Shorthands and checks

A plugin can register a short field on a node type that expands into links when the config loads. `essentials` has `repo: owner/name` on `repo` nodes (GitHub: Actions, Settings, Secrets, Pull requests, Issues), `sanity: <projectId>` and optional `studio: <name>` on `cms` nodes (Sanity manage, API, Webhooks, Studio) and `url:` on `site` nodes (a link labelled with the host). Generated links come first; an explicit `links:` entry with the same label replaces the generated one. The stored YAML is untouched.

Nodes can have `checks:`, run on their own `every` (default `5m`). `essentials` provides the `http` check:

```yaml
  - id: fernhill-site
    type: site
    group: fernhill
    url: https://fernhill.example
    checks:
      - type: http              # url defaults to the node's url
        every: 5m
        expect_status: 200      # a number or a list; default any 2xx
        expect_text: Fernhill   # case-sensitive; catches "200 but broken"
        timeout: 10s
        alert_after: 2          # degraded until it failed twice in a row, then down
        allow_private: false    # true to reach a private or loopback address
```

A failing check is `degraded` until it has failed `alert_after` times in a row (default 1), then `down`; one success is `ok` again. The detail says what happened: `200 in 182 ms`, `expected 200, got 503 (95 ms)`, `text "Fernhill" not found (200, 182 ms)`, or the request error, and the result carries the time as `ms` (a plugin's check returns `{ status, detail?, ms? }`). Requests go through `ctx.http`, so the address rules in the next section apply.

The map, popover, status strip, Inventory and Links show the server's statuses: `GET /api/status` once, then `node.status` and `check.result` events over SSE. "Check now" and "Check everything" run the checks immediately (`POST /api/refresh`). A node without checks shows as not checked.

### Mock plugin and demo mode

`plugins/mock` provides a `mock` check type that makes up statuses and response times from a node's `mock:` block (`initialStatus` for the first run, `baseMs` for the timing), with the occasional slow or broken site that recovers by itself. The sample config lists it and gives each mocked node `checks: [{ type: mock, every: 15s }]`. While it is loaded, the map also plays demo deploy and webhook flows; without it, deploy buttons are disabled until the GitHub plugin (M2). `SITEGARDEN_DEMO=1` loads it even when the config does not list it.

### Secrets

Secrets are declared by name in the config; the values never are. The server reads each value from the environment variable `NAME`, or else from the file named by `NAME_FILE` (surrounding whitespace is trimmed), so Docker secrets work as they are. A declared secret with no value does not stop the server: `sg plan` and the log warn, and a request that needs it fails with "secret NAME is not set".

```yaml
secrets:
  GITHUB_READ: { expires: 2027-03-01 }
nodes:
  - { id: fernhill-repo, type: repo, group: fernhill, notes: "token ${secret:GITHUB_READ}" }   # an undeclared name is a config error with its line
```

```yaml
# docker-compose.yml
services:
  sitegarden:
    environment:
      GITHUB_READ_FILE: /run/secrets/github_read
    secrets: [github_read]
secrets:
  github_read:
    file: ./github_read.txt
```

Plugins never see a value. A plugin makes requests only through `ctx.http(url, init)`, which replaces `${secret:NAME}` in the URL and header values at send time, and only for names in the plugin's manifest `permissions.secrets`. `permissions.network` lists the hosts it may call (`api.github.com`, `*.example.org`, or `*`). Requests to loopback, private, link-local, CGNAT and metadata addresses are refused after DNS resolution (every answer is checked, and the connection uses the checked address); `allowPrivate: true` on a request opts in for an internal service (cloud metadata addresses stay blocked). Redirects are followed at most 5 times, each hop re-checked, and `authorization` and secret headers are dropped when the origin (scheme, host or port) changes. Requests time out after 10 s and responses are capped at 5 MB. Secret values (and their base64 form) are replaced with `[secret:NAME]` in logs, events and check details.

```json
{ "sitegarden": { "id": "github", "apiVersion": "^1.2", "server": "./server.ts", "permissions": { "network": ["api.github.com"], "secrets": ["GITHUB_READ"] } } }
```

| Variable | Default | Purpose |
|---|---|---|
| `SITEGARDEN_CONFIG` | `sitegarden.yaml` | config file |
| `SITEGARDEN_DATA` | `.data` | rendered artifacts and releases |
| `PORT` | `8787` | API port |
| `HOST` | `127.0.0.1` | listen address |
| `SITEGARDEN_INSECURE` | unset | `1` allows a non-loopback `HOST` with auth off or in tailscale mode |
| `SITEGARDEN_WEB` | `dist` | built web app the server serves |
| `SITEGARDEN_DEMO` | unset | `1` loads the `mock` plugin (demo statuses and flows) |
| `SG_RENDER_WORKERS` | CPU cores − 2 | parallel render workers |

## Run it on a server

One `docker compose up`: the app and a Tailscale sidecar. Nothing is published on the host; the map is reachable at `https://sitegarden.<your-tailnet>.ts.net` from your tailnet devices only (`tailscale serve` with a MagicDNS certificate, `deploy/serve.json`).

```sh
export TS_AUTHKEY=tskey-auth-...   # a Tailscale auth key
docker compose up -d --build
```

Turn auth on in `sitegarden.yaml` (it is on even inside the VPN):

```yaml
auth:
  enabled: true
  mode: tailscale                  # trust the Tailscale-User-Login header from tailscale serve
  users: [owner@example.com]       # tailnet logins allowed in
```

- `mode: tailscale` (default): a request without the header gets 401, a login not in `users` gets 403. The header is only trustworthy on loopback behind `tailscale serve`, so the server refuses to start in this mode on another address.
- `mode: password`: a login page, a 30-day session cookie (HttpOnly, Secure, SameSite=Strict) and 5 tries per 15 minutes. Make the hash with `pnpm sg hash-password` and pass it as the secret `SITEGARDEN_PASSWORD_HASH` (or `SITEGARDEN_PASSWORD_HASH_FILE`). Setting it in tailscale mode also gives tagged devices, which have no Tailscale login, a way in.
- API token, both modes: requests with `Authorization: Bearer <token>` matching the secret `SITEGARDEN_API_TOKEN` are let in. The CLI sends `SITEGARDEN_TOKEN`, so `SITEGARDEN_TOKEN=... pnpm sg apply --server https://sitegarden.<tailnet>.ts.net` works against a locked server.

The server listens on `HOST` (default `127.0.0.1`) and refuses a non-loopback address while auth is off, unless `SITEGARDEN_INSECURE=1`. `GET /api/health` is open, for health checks.

## Development

```sh
pnpm test       # unit tests
pnpm e2e        # Playwright end-to-end tests against the production build (pnpm build first)
pnpm lint       # oxlint
pnpm build      # type-check and production build
pnpm sg schema  # regenerate schema.json after adding a plugin
pnpm perf       # performance measurements, see perf/README.md
```

How rendering works is described in [docs/rendering.md](docs/rendering.md).

Releases: every PR bumps the version in `package.json` and adds a matching entry to [CHANGELOG.md](CHANGELOG.md); merging to `main` tags `v<version>` and publishes a GitHub release with that entry as notes.

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
