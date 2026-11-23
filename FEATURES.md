# sitegarden — feature catalogue

Everything we might build, grouped. **Days** = hobby days for one person (an evening ≈ 0.3, a weekend ≈ 1.5). **When** = milestone from the roadmap in [PLAN.md](PLAN.md#roadmap) (M1–M7), or `later`. ★ = top pick.

Estimates come from the research agents and are rough. Sources for ideas are in the last column where there is one.

## 1. Map and navigation

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| Map v0 | Nodes and edges from YAML, plain theme, pan/zoom, fit-to-project | 1 | M1 | |
| Side panel | Links, notes/runbook, status, copy buttons; tabs from plugins | 1 | M1 | |
| Seeded layout | Plots placed on a spiral, stable positions, drag saves a position | 2.5 | M3 | VISUAL.md |
| Focus mode | Click a node, everything unrelated fades | 0.5 | M2 | |
| Command palette (⌘K) | Jump to a node, open a link, run an action | 1.5 | M2 | |
| Watchtower node | sitegarden itself on the map; check pings start there | 0.5 | M2 | |
| Old-map minimap | Downscaled world bitmap, sepia, viewport rectangle, click to pan | 2 | later | |
| Per-project views | Zoom into one plot as its own page | 1.5 | later | Homelable multi-canvas |
| Zoom-dependent detail (LOD) | Labels and annexes appear as you zoom in | 3.5 | later | |

## 2. Motion and live status

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| ★ Deploy lantern | A lantern travels the road while the GitHub run is `in_progress`; glows green or red at the end | 2 | M2 | Kiali, Vizceral |
| Webhook pulse | Short flash along the edge when a hook fires | 0.5 | M2 | Kiali |
| Check pings | Tiny dot from the watchtower to the node and back on each check | 0.5 | M2 | |
| Edge health | Path turns dashed red when a webhook or deploy failed | 1 | M2 | Kiali edge colours |
| Heartbeat | Healthy nodes breathe slowly; down nodes go still and dark | 0.5 | M2 | |
| Red bloom | Watercolour bloom around anything down; windows go dark | 1 | M3 | |
| ★ Time scrubber | Drag back through 24 h / 7 d and replay outages and deploys on the map | 4 | M7 | Gource |
| "What changed" walk | On open, the camera visits what changed since your last visit | 2 | later | |
| Visitors on paths | Tiny villagers walking roads; density follows traffic | 3.5 | later | Vizceral |
| Birds on success | A small flock lifts off when a deploy finishes green | 1.5 | later | |

## 3. Lists and insight

Every list: filters, grouping, sorting, column picker, CSV export; clicking a row highlights the node on the map.

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| Inventory | Every node: type, project, host, status, last check | 1 | M1 | |
| Links | All links by project, searchable: the bookmarks page | 0.5 | M1 | |
| Activity | Events and audit log as one feed | 0.5 | M2 | |
| Deploys | Timeline across repos: commit, duration, result, who | 1 | M2 | |
| Health | Uptime 24 h / 7 d / 30 d, p50/p95, sparkline, last failure | 1 | M4 | Gatus |
| ★ Expiries | Certificates, domains, tokens, renewals, sorted by days left | 1 | M4 | |
| Incidents | Auto-created from status changes, with notes | 1 | M4 | Kener |
| Open PRs and commits | "Waiting to ship" per repo | 0.5 | M2 | |
| Hosts and costs | Provider, plan, renewal, monthly cost (manual fields), total | 1 | later | |

## 4. Actions from one place

All actions: confirm, audit log, disabled in read-only mode.

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| Refresh | Per node and global; re-run a check now | 0.5 | M1 | |
| ★ Deploy | `workflow_dispatch` with pinned workflow and ref; tracks the exact run id | 1 | M2 | |
| Re-run / cancel | Re-run failed jobs or cancel a run from the panel | 0.5 | M2 | |
| Workflow log viewer | Why did it fail, without leaving the map; secrets redacted | 1.5 | M5 | |
| Maintenance pause | Node shows `paused`, no alerts, optional end time | 0.5 | M4 | Gatus |
| ★ Lighthouse history | Run PageSpeed Insights per site, keep scores over time | 2 | M5 | Lighthouse CI |
| Rollback | Re-run the last green deploy run | 2 | later | |
| Purge cache | Cloudflare / Netlify / Vercel cache purge | 1.5 | later | |
| Incident → GitHub issue | Prefilled issue from an incident (needs Issues: write) | 1 | later | |
| Broken links and SEO crawl | Weekly crawl per site, list of broken links and missing titles | 4 | later | |
| Sanity shortcuts | Open studio, last edited documents, re-trigger publish webhook | 2 | later | |
| Token doctor | Probe each token: what can it do, is it broader than needed | 1.5 | later | |

## 5. Health and checks

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| HTTP + keyword | Status, timeout, expected text ("200 but broken") | 1 | M1 | |
| SSRF guard | Resolved-IP check, no auto-redirects, `allow_private` opt-in | 1 | M1 | OWASP |
| SSL expiry | `tls.getPeerCertificate().valid_to` | 0.5 | M4 | |
| Domain expiry | RDAP via the IANA bootstrap; manual `expires:` fallback | 1 | M4 | |
| Token expiry | GitHub expiry header, Sanity `expiresAt`, manual dates | 1 | M4 | |
| ★ Heartbeat check | A push URL that cron jobs, backups and deploys ping; late → down | 1.5 | M4 | Healthchecks.io |
| Conditions | Gatus-style: `[STATUS] == 200`, `[BODY].status == ok`, `[RESPONSE_TIME] < 500` | 1.5 | M4 | Gatus |
| TCP, DNS, FTPS login | The two FTPS sites need the FTPS one | 2 | M4 | |
| Flap damping | `alert_after`, `recover_after`, a "late" state before "down" | 0.5 | M4 | Healthchecks.io |
| Content changed | Alert if a page's content hash changes unexpectedly | 1 | later | |
| ★ External status source | Read Gatus JSON or Uptime Kuma `/metrics` instead of re-checking | 2 | later | |

## 6. Integrations

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| GitHub (polling) | CI status, runs, commits, PRs | 1.5 | M2 | |
| Sanity basics | `sanity: <projectId>` + `studio:` links, datasets | 0.5 | M1 | |
| Hooks ingress recipe | Generated `serve.json` (Funnel on 8443 for `/hooks`) or Caddy recipe | 1 | M5 | |
| GitHub webhooks | Instant flows from push / workflow_run; delivery log and redeliver | 2.5 | M5 | |
| Sanity webhooks | Inspector (attempts, failing → red edge) and receiver (publish pulse) | 2.25 | M5 | |
| Analytics glance | Plausible / Umami visits sparkline | 2 | later | |
| Hosting adapters | Vercel, Netlify, Cloudflare Pages deploy history | 4 | later | |
| Importers queue | "Found 3 repos with deploy workflows": accept or ignore | 3 | later | Homelable |
| Host metrics | Beszel as an optional source for host nodes | 2 | later | Beszel |
| GitHub App | Replace PATs: 1-hour tokens, setup wizard via manifest flow | 3 | later | |

## 7. Alerts and digests

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| Notifiers | ntfy, Telegram, Discord, email, generic webhook | 2 | M4 | Gatus |
| Rules | Per node or group, quiet hours, reminder if still down, resolved message | 1 | M4 | |
| Expiry reminders | 30 / 14 / 3 days before a cert, domain or token expires | 0.5 | M4 | |
| Weekly digest | "All green for 6 days, 3 deploys" | 1.5 | later | |
| Automations | YAML rules: "when X goes down, do Y" (notify, re-run, pause) | 3 | later | |

## 8. Make it yours (extensibility)

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| Plugin host | Manifest, extension tree, replace / disable by ID, tiers A and B | (in core) | M1 | Backstage, VS Code |
| End-to-end plugin prototype | One web plugin via import map, to de-risk the SDK | 0.5 | M1 | Grafana |
| Theme plugins | Garden and plain as two theme plugins | (in M3) | M3 | |
| ★ Plugin gallery | Installed plugins, contributions, permissions, enable / disable | 2 | M6 | |
| Plugin scaffolder | `create-sitegarden-plugin` templates: theme, pack, node type, source | 1 | M6 | |
| Dev mode with hot reload | `sitegarden dev ./my-plugin` | 2 | M6 | |
| Extension inspector + layer toggles | What replaced what; show / hide map layers | 2 | M6 | Backstage |
| Settings forms | Plugin settings UI generated from its schema | 2 | M6 | |
| Theme editor | Edit DTCG tokens with live preview, export as a theme plugin | 4 | later | |
| Building-pack editor | Drop SVGs, mark anchors and footprint, export `pack.json` | 3 | later | |
| Install from git URL | `plugins: - git:...` with a lockfile hash prompt, no registry | 2 | later | |
| Conformance kit | `sitegarden check --plugins` | 2 | later | |
| User scripts | Small JS checks in a worker (tier C) | 3 | later | |

## 9. Cosy touches

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| Watercolour garden theme | Paper, plots, hedges, buildings (VISUAL.md) | 7 | M3 | Felt, Tyler Hobbs |
| Night theme | Ink-blue paper, stars, lit windows, campfire, lamps | 1.5 | M3 | |
| Day / night by clock | The map follows local time, with a manual override | 1 | M3 | |
| ★ Garden grows | Flowers bloom after green streaks, wilt after outages | 3 | M7 | TamaGROTchi |
| Seasons | Blossom, summer, autumn leaves, snow, from the real calendar | 2 | M7 | |
| Weather mood | Sun when all is well, fog when data is stale, rain during incidents | 2.5 | later | |
| Building upgrades | Buildings grow with project age or commit count | 2 | later | |
| Achievements | "100 deploys", "30 green days" | 2 | later | |
| Night sounds | CC0 crickets via Web Audio, off by default | 1 | later | |
| Paper-cut theme switch | Circular reveal when switching themes | 1 | later | |

## 10. Sharing

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| ★ Postcard | PNG of the map with the week's numbers, drawn on canvas | 2 | M7 | |
| Read-only share link | A live view for a friend or client | 1.5 | later | Homelable |
| Public status page + badges | SVG uptime badges for READMEs | 3 | later | Gatus, OpenStatus |

## 11. Developer and AI

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| `sitegarden` CLI | `check`, `status`, `deploy` | 1.5 | M6 | |
| ★ MCP server | "What's red?", "deploy widok23" from Claude Code | 2 | M6 | Homelable ships one |
| Dashboard widget endpoint | JSON for Homepage / Glance widgets | 0.5 | later | Homelable |
| In-UI config editor | Writes YAML back with comments kept, optional git commit | 3 | later | |

## 12. Accessibility and operations

| Feature | What | Days | When | Inspired by |
|---|---|---|---|---|
| Status = colour + shape + text | Colour-blind safe from day one | (in M1) | M1 | |
| Reduced motion and calm mode | Static flows, fps caps, pause when tab hidden | 0.5 | M3 | |
| Keyboard navigation | Move between nodes, open panels, run actions | 1 | M2 | |
| Self-monitoring | Scheduler lag, failed sources, storage size on the watchtower | 0.5 | M2 | |
| Backups | SQLite snapshot download; Litestream recipe | 0.5 | M4 | |

## Top 10

1. Deploy lantern on the path (the reason the app exists)
2. Deploy with tracked run id
3. Heartbeat check (backups and cron become visible)
4. Expiries list (prevents real silent breakage)
5. Time scrubber replay
6. Garden grows with uptime streaks
7. Lighthouse history
8. MCP server
9. Postcard
10. Plugin gallery

## Sources for ideas

- [Gatus](https://github.com/TwiN/gatus), [Uptime Kuma Prometheus](https://github.com/louislam/uptime-kuma/wiki/Prometheus-Integration), [Healthchecks](https://github.com/healthchecks/healthchecks), [Beszel](https://github.com/henrygd/beszel), [Kener comparison](https://kener.ing/docs/v4/guides/comparison)
- [Homelable](https://github.com/Pouzor/homelable) (closest competitor: drag-drop infra canvas, MCP server, accept / ignore queue; no animated paths)
- [Kiali health](https://kiali.io/docs/features/health), [Netflix Vizceral](https://github.com/Netflix/vizceral), [Gource](https://sourceforge.net/projects/gource.mirror/), [TamaGROTchi](https://grafana.com/events/grafanacon/2026/agenda/meet-tamagrotchi-the-first-fully-observable-digital-pet)
- [Homarr issues](https://github.com/ajnart/homarr/issues), ["Why I never bought into the homelab dashboard trend"](https://www.virtualizationhowto.com/2026/06/why-i-never-bought-into-the-home-lab-dashboard-trend/)
- Gap: no direct r/selfhosted quotes (Reddit could not be opened). Worth a manual search for "dashboard wishlist" before M5.
