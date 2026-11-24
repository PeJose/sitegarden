# sitegarden — plan

A self-hosted, open-source map of everything you run: repos, CMS studios, hosts and sites drawn as a cosy garden graph. You see what connects to what, whether it works (health checks), and what is moving right now (deploys and webhooks animated along the paths). From one place you can open any link, deploy, re-run, inspect and get alerted.

| Doc | What's in it |
|---|---|
| **plan.md** (this) | why, principles, architecture, config, roadmap, decisions |
| [features.md](features.md) | the full feature catalogue, grouped, with effort and milestone |
| [plugins.md](plugins.md) | core vs plugins, extension tree, loading, isolation tiers |
| [security-model.md](security-model.md) | VPN, auth, tokens, webhooks, SSRF guard, secrets |
| [visual.md](visual.md) | the garden look, procedural generation, rendering techniques |

## Why

There are 2 Sanity studios and 2 FTPS sites today, and more are coming. Existing tools don't fit:

- Homelab mappers (Homelable, Atlas) think in servers, racks and networks. Homelable is the closest in shape, but it has no animated flows and no deploy actions.
- Link dashboards (Homepage, Homarr, Glance) are tiles, not a graph.
- Uptime tools (Uptime Kuma, Gatus) are lists of checks with no picture of how things connect.
- Backstage is too heavy.

Nothing is built for "my websites + CMSes + repos as a graph with link lists, live status and actions." Animated traffic on paths exists only in big service-mesh tools (Kiali, Netflix Vizceral), not in anything personal.

## Principles

1. **Small core, everything else is a plugin.** Node types, integrations, checks, themes, buildings, map layers and list views are plugins. Built-in ones use the same API as third-party ones.
2. **Private by default.** The app lives behind a VPN. It holds tokens that can deploy your sites.
3. **Config in git.** `sitegarden.yaml` is the source of truth; the UI may write back to it.
4. **Instant and cached.** The UI renders cached data at once and says how old it is.
5. **Cosy but honest.** Ornaments never hide status. Every status has a colour, a shape and a label, and every map has a plain list next to it.

## Architecture

One `docker compose up`: the app, a Tailscale sidecar, and an optional screenshot worker.

| Piece | Choice |
|---|---|
| Server | Node + Hono: plugin host, scheduler, API, SSE, serves the web app |
| Storage | SQLite (WAL): cache, append-only events, status snapshots, audit log. Backup = `sqlite3 .backup` or Litestream |
| Web app | React + `@xyflow/react` (now v13.0.2, check the v12 → v13 migration notes), Vite |
| Live updates | Server-Sent Events, typed events, `Last-Event-ID` catch-up |
| Config | `sitegarden.yaml` in a private git repo + generated `schema.json` for editor autocompletion |
| Secrets | Env vars or `_FILE` secret files, referenced by name from YAML |
| Network | Tailscale sidecar; the app listens on localhost in the sidecar's network |
| Screenshots | Optional Playwright container, separate, no secrets |

There is no GitHub scheduled Action: the server does all scheduling.

### Map rendering: three layers

React Flow handles what it is good at (HTML nodes, selection, drag, keyboard); canvases handle terrain and motion.

1. **World tiles (bottom):** paper, neighbourhood, plots and buildings, rendered **on the server** by the render pipeline below and served as immutable image tiles. The browser only draws images, never filters.
2. **React Flow (middle):** buildings, pins, labels, selection; transparent background.
3. **Flow canvas (top):** one rAF loop draws lanterns, pulses and pings from pre-sampled path points. Hundreds of particles cost almost nothing; the loop stops when nothing moves.

Flow events are `flow.started {id, kind, edgeId, t0}` and `flow.finished {id, t1, result}`. The browser computes position from `now − t0`, so a replay (time scrubber) is the same code fed from stored events. Details in [visual.md](visual.md#rendering-techniques).

Alternatives considered: PixiJS (would mean rebuilding cards, keyboard access and hit-testing; keep as a later upgrade for full-screen shaders), Leaflet (stale, poor for rich nodes), Konva / deck.gl (no gain).

### Render pipeline: plan and apply (priority, decided 2026-11-20)

The map is infrastructure-as-code output, like Terraform: the config is the input, the server renders, the browser only downloads finished files.

1. **`plan`:** parse `sitegarden.yaml`, generate the world, hash every layer of every tile, and diff against the current release. Output: "+1 estate, 14 tiles to render (~8 s), 0 removed".
2. **`apply`:** render only the missing hashes, then write a new release manifest and swap it in atomically. The old release keeps being served until the new one is complete, so nobody sees half-drawn tiles.
3. **Triggers:** the CLI, a file watch on the config, or a push webhook from the config repo. The GUI never renders; "plant a project" there produces a YAML change (later a commit/PR), and that change is applied like any other.

Storage, content-addressed:

- Every artifact's file name is the hash of its inputs: layer geometry for that tile + theme + zoom + renderer version. Same config means the same hashes, so a revisit or a restart renders nothing.
- Layers are stored separately and only changed ones are re-rendered: **texture** (paper grain, specks, fibres: position-independent, rendered once and repeated), **terrain** (neighbourhood + land, changes when estates move nearby), **estate** (one plot's land, buildings, paths; changes only when that estate changes), **night lights**.
- Per release, layers are flattened server-side into one image per tile, so the phone downloads one WebP/AVIF per visible tile, not a layer stack.
- Artifacts live in a data directory on the server (a Docker volume), not in git. They are reproducible from the config, and committing binaries would bloat the repo. The release manifest (hash list) can be kept for traceability.

Client (fast on a phone):

- Load order: tiny manifest → one small blurred preview image of the whole map (instant "loading" state) → visible tiles at the screen's density → neighbours.
- Tiles are immutable (`Cache-Control: immutable`, hash in the URL) and kept by a service worker, so a revisit shows the map with zero network.
- Only cheap live parts stay on the client: pins, chips and labels (HTML: crisp text, tap targets, accessibility), status washes, and the flow animation canvas, all driven by SSE. A status change never triggers a re-render.
- The only on-the-spot rendering ever needed is previews (theme editor, dragging a plot): show a flat placeholder shape until the server's apply finishes.

Speed work, measured first (profile which filter dominates):

1. Texture layer rendered once and composited instead of re-running noise filters per tile.
2. Terrain/estate layer split, so a change re-renders only its layer's tiles.
3. Use every CPU core (a worker pool), visible tiles first.
4. Watercolour filters rendered at reduced resolution and upscaled (soft by nature), and the first wave limited to the tiles on screen (done 2026-11-20: cold first view 2.6 s, full apply 67 s).
5. Later: draw the watercolour with a GPU shader, see milestone M8 below. That is the "faster language" step that matters; a Rust or Go rewrite of the same filters would not change much, and resvg (Rust) currently crashes on the design's `feDisplacementMap`.

### Plugins in one paragraph

The core holds the graph model, plugin host, extension tree, scheduler, store, secrets broker, event bus, status vocabulary, auth and the web shell. Everything else is an extension with an ID like `layer:garden:terrain`. A plugin replaces it by registering the same ID, and YAML can disable it. Web plugins load at runtime through an import map that shares one React. Themes and building packs are pure data. See [plugins.md](plugins.md).

### Security in one paragraph

Tailscale Serve exposes the app to your tailnet only; auth trusts the `Tailscale-User-Login` header and fails closed (password mode for tagged devices). Two fine-grained GitHub tokens: read, and deploy with only Actions: write. Deploys use `workflow_dispatch` with workflow and ref pinned server-side. Webhooks come in only through `/hooks/*`, HMAC-verified. Health checks go through a resolved-IP SSRF guard. See [security-model.md](security-model.md).

### Hosting

| Option | Cost | Notes |
|---|---|---|
| Oracle Cloud Always Free (A1) | free | 2 OCPU / 12 GB. **Reclaimed when idle**: over 7 days, p95 CPU < 20% and network < 20% and memory < 20%. Sitegarden fits all three. Upgrade to pay-as-you-go to avoid it |
| Small paid ARM VPS | a few €/month | No surprises. Check current price |
| Home box / Raspberry Pi | power only | Fine behind Tailscale. Checks come from your home IP |

## Config shape (draft)

```yaml
# yaml-language-server: $schema=./schema.json
plugins:
  - "@sitegarden/essentials"
  - "@sitegarden/theme-garden"
  - ./plugins/my-buildings            # local folder

secrets:                              # names only; values from env or *_FILE
  GITHUB_READ: { expires: 2027-11-01 }   # fallback if the API expiry header is absent
  GITHUB_DEPLOY: { expires: 2027-11-01 }
  SANITY_READ: {}

groups:
  - { id: fernhill, label: Fernhill }

nodes:
  - id: fernhill-repo
    group: fernhill
    type: repo
    repo: acme/fernhill              # adds Actions, Settings, Secrets, PRs, Issues links
    deploy:
      kind: workflow_dispatch         # needs only Actions: write
      workflow: deploy.yml            # pinned here, never sent by the browser
      ref: main

  - id: fernhill-cms
    group: fernhill
    type: cms
    sanity: <projectId>               # adds manage, API, webhooks links
    studio: fernhill                   # → https://fernhill.sanity.studio (not derivable from the id)

  - id: fernhill-site
    group: fernhill
    type: site
    url: https://fernhill.example
    host: host.example (FTPS)
    checks:
      - type: http
        every: 5m
        expect_status: 200
        expect_text: "Fernhill"       # catches "200 but broken"
        timeout: 10s
        alert_after: 2
      - { type: ssl, warn_days: 14 }
      - { type: domain, warn_days: 30 }   # RDAP; add `expires:` if the TLD has no RDAP expiry
    links:
      - { label: host.example panel, url: https://... }
    notes: ./notes/fernhill.md         # runbook shown in the side panel

  - id: fernhill-backup
    group: fernhill
    type: job
    checks:
      - { type: heartbeat, every: 1d, grace: 2h }   # the backup script pings /ping/<token>

edges:
  - { from: fernhill-cms, to: fernhill-repo, type: webhook }
  - { from: fernhill-repo, to: fernhill-site, type: deploy, label: FTPS }

extensions:                           # replace / disable any visual piece
  view:essentials:health: { config: { columns: [name, status, uptime_7d] } }
```

Short fields (`repo:`, `sanity:`) fill in the standard links automatically. That's the main selling point: one field instead of ten URLs.

## Roadmap

Budget: about **8–10 hobby days a month** (two evenings a week plus a weekend day). Each milestone ends with something you can see and use. Months are a guide, not deadlines; full feature list with estimates in [features.md](features.md).

| # | Name | Month | You get |
|---|---|---|---|
| M1 | Seed | Dec 2026 | A working map of your 2 projects behind Tailscale, with links and HTTP checks |
| M2 | Roots and lanterns | Jan 2027 | GitHub status and deploy button; lanterns travel the paths |
| M3 | Watercolour | Feb 2027 | The garden look: paper, painted plots, buildings, night |
| M4 | Weather station | Mar 2027 | Expiries, heartbeats, richer checks, alerts on your phone |
| M5 | Visitors | Apr 2027 | Instant webhooks, Sanity webhook inspector, logs, Lighthouse |
| M6 | Toolshed | May 2027 | Plugin gallery, scaffolder, hot reload, CLI, MCP server |
| M7 | Seasons | Jun 2027 | Time scrubber, growing garden, seasons, postcards |
| M8 | Glasshouse | Jul 2027 | GPU-rendered watercolour (in the browser), instant re-renders, live seasons and weather |

### M1 — Seed (~11.5 days)

1. Core: graph model, YAML loader + schema merge, plugin host (tiers A/B), extension tree, store, scheduler, SSE (4 d)
2. Secrets broker with `_FILE`, SSRF guard (1 d)
3. `essentials`: node types, `repo:` / `sanity:` shorthands, HTTP + keyword checks (1.5 d)
4. Map v0 (plain theme), side panel, Inventory + Links lists, Refresh (2 d)
5. Dockerfile, compose with Tailscale sidecar, `tailscale` + `password` auth, README (1.5 d)
6. One web plugin end to end via import map, to prove the SDK before it freezes (0.5 d)
7. Client performance pass, before more UI lands (1.5 d). Observed 2026-11-20: the browser's GPU process sits at ~300% while the POC map is open, even when idle and fully loaded, and pan/zoom animations feel slow. Profile first (Chrome Performance + Layers panels, dev vs production build), then fix what the data shows. Suspects: React Flow re-rendering every pin/chip/label per frame, `backdrop-filter` blur on panels over a moving map, many rough.js SVG pins, CSS opacity transitions, idle animations (deploy path, red wash) that never stop. Target: near-zero GPU when idle, 60 fps pan on a mid phone

### M2 — Roots and lanterns (~9 days)

1. GitHub source: CI status, runs, commits, open PRs (1.5 d)
2. Deploy (`workflow_dispatch`, tracked run id), re-run, cancel (1.5 d)
3. Flow canvas: lantern, webhook pulse, check pings, watchtower node (3 d)
4. Edge health, heartbeat breathing, focus mode, ⌘K palette, keyboard nav (2 d)
5. Deploys + Activity lists, audit log, read-only mode, self-monitoring (1.5 d)

### M3 — Watercolour (~10 days)

1. World canvas synced to the viewport; tile bake worker + IndexedDB cache (2 d)
2. Procedural paper and specks; Hobbs-style plot watercolour; rough.js hedges (3 d)
3. Seeded layout + first building pack (SVG variants per node type) (2.5 d)
4. Night theme, day/night by clock, lit windows, red bloom (2 d)
5. Garden and plain as two theme plugins; reduced-motion and calm mode (0.5 d)

### M4 — Weather station (~10 days)

1. SSL, domain (RDAP) and token expiry; Expiries list (2.5 d)
2. Heartbeat check; Gatus-style conditions; TCP, DNS, FTPS login; flap damping (4 d)
3. Health + Incidents lists; maintenance pause (1.5 d)
4. Notifiers (ntfy, Telegram, Discord, email), rules, expiry reminders (2 d)

### M5 — Visitors (~9 days)

1. Hooks ingress recipe (Funnel on 8443 or Caddy) (1 d)
2. GitHub webhooks: instant flows, delivery log, redeliver (2.5 d)
3. Sanity webhooks: inspector (failing → red edge) and receiver (2.25 d)
4. Workflow log viewer (1.5 d)
5. Lighthouse / PageSpeed history per site (2 d)

### M6 — Toolshed (~11 days)

1. Plugin gallery with permissions and enable / disable (2 d)
2. `create-sitegarden-plugin` scaffolder + `sitegarden dev` hot reload (3 d)
3. Extension inspector + layer toggles; settings forms from schema (4 d)
4. CLI and MCP server (2 d, overlapping: the MCP server wraps the same API)

### M7 — Seasons (~11 days)

1. Time scrubber replay (4 d)
2. Garden grows with uptime streaks (3 d)
3. Seasons from the calendar (2 d)
4. Weekly postcard PNG (2 d)

### M8 — Glasshouse: GPU rendering (~9 days, decided 2026-11-20)

Why: on the CPU, the design's watercolour filters (`aq`, `aqS`, `aqT`, `wash`, all `feDisplacementMap`-based) cost ~5.5 s per 512-unit tile (58 ms without filters). Baking hides that for revisits, but every config change pays it, and live effects (seasons, weather, growth) are impossible.

1. Re-implement the watercolour look as fragment shaders: domain-warped fbm for pigment, SDF edge darkening, granulation, paper grain, desaturate/fade for the grey neighbourhood (2 d)
2. Tune the shaders side by side against the v4.2 Light and Night boards in the design artifact (the private design artifact) until the look matches (2 d; this is the risk)
3. Render target, in this order of preference:
   - **In the browser (WebGL2):** every phone and laptop has a GPU, so the client renders terrain and plots from the World JSON in milliseconds, and the server only sends geometry. Bitmap tiles stay as the fallback for old devices and for postcards
   - **Server, no GPU:** the same shaders through headless GL / SwiftShader on the CPU, still much faster than SVG filters because there's no full-bbox filter pass per tile
   - **Bake elsewhere:** artifacts are content-addressed, so `sg apply` can run on any machine with a GPU (the owner's Mac) and sync `.data/` to the VPS
4. Where rendering runs is a choice in code and in `sitegarden.yaml`, not hard-wired. Preferred default: **local GPU render** on the owner's machine, synced to the server (1 d):

   ```yaml
   render:
     mode: local-gpu      # local-gpu | server | ci | client
     sync: rsync://sitegarden/data   # where local/ci renders push .data/ (local-gpu, ci)
     fallback: server     # what the server does if a release is missing: server | wait
     workers: auto        # CPU renders: auto = cores - 2
   ```

   | Mode | Who renders | Server role |
   |---|---|---|
   | `local-gpu` | `sg apply` on the owner's Mac (GPU shaders), then syncs `.data/` | serve only |
   | `server` | the server's CPU (current behaviour) | render + serve |
   | `ci` | the CI runner with `.data/` restored from cache, pushes over Tailscale | serve only |
   | `client` | the viewer's browser (WebGL2) from World JSON; tiles only as fallback | serve geometry |

   The server needs a "serve only" mode for `local-gpu` and `ci`: it never renders unless `fallback: server` and a release is missing.
5. Live effects on top: seasons, weather, day/night blend, garden growth (2 d)
6. Keep the SVG/sharp pipeline as the reference renderer and fallback (1 d of cleanup)

A GPU VPS is not worth it for this: small always-on GPU servers cost around €200/month (Hetzner L4 at about €0.44/h, per third-party listings), versus a few € for a CPU VPS, and the client GPU is free.

### After M7

Pick from the `later` items in [features.md](features.md): external status sources (Gatus / Kuma), importers queue, theme and building-pack editors, automations, weather, villagers, public status page, GitHub App, and more.

## First real data

| Project | Repo | CMS | Site / host |
|---|---|---|---|
| fernhill | acme/fernhill | fernhill-cms (Sanity) | FTPS on host.example |
| copperleaf | copperleaf | copperleaf-cms (Sanity) | FTPS |

## Open decisions

1. ~~Name~~ — sitegarden (free on npm and GitHub as of 2026-11-19).
2. ~~Hono vs Fastify~~ — Hono.
3. ~~Paper texture: SVG filter or own code~~ — the design's SVG filters, rendered server-side by sharp (librsvg) into cached WebP tiles (POC, 2026-11-20). resvg-js crashes on `feDisplacementMap`; client-side rasterising was too slow.
4. ~~Module Federation vs import maps~~ — import maps with shared React.
5. License (MIT suggested).
6. Hosting: Oracle on pay-as-you-go vs small paid VPS vs home box.
7. Webhooks in: Tailscale Funnel (rules out Headscale) vs Caddy proxy vs polling forever.
8. Config editing: YAML only, or the in-UI editor that writes back?

## Still to verify (before the code that depends on them)

| Fact | Needed in |
|---|---|
| `GitHub-Authentication-Token-Expiration` header on fine-grained PATs (one `curl -i`) | M4 |
| Whether a Sanity Viewer token can list webhooks | M5 |
| Sanity Manage deep-link paths (`/manage/project/<id>/...`) | M1 |
| undici `connect.lookup` option for the SSRF guard | M1 |
| React Flow v12 → v13 migration notes | M1 |
| Headscale release with Serve HTTPS (if using Headscale) | M1 |

## Next step

Turn M1 into an OpenSpec proposal (`/opsx:propose`), with the core and plugin SDK as its own design section. Review it, then build it with Sonnet subagents.
