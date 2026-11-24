# Proposal

## Why

`sg plan` / `sg apply` today only diff and render tiles on the machine they run on, and the server re-renders by itself whenever its `sitegarden.yaml` changes, so plan and apply decide nothing. The owner wants a Terraform model: keep the config in a local git repo, point the CLI at a server, see a validated plan, and apply it, with the server's applied config as the single state.

## What Changes

- The server keeps every applied config as a numbered revision (rev) in its store. The running graph is always the latest rev. **BREAKING** the server no longer watches `sitegarden.yaml`; on first start with an empty store it imports `SITEGARDEN_CONFIG` once as rev 1.
- `sg plan [--server URL]` sends the local YAML to the server, which validates it with its own plugins and returns errors with lines, or a diff (groups, nodes, edges, extensions) plus the render estimate. Nothing changes.
- `sg apply` does the same plan, asks for confirmation (`--yes` skips), and the server stores it as the next rev and renders. `--local-render` renders the missing tiles on the local machine and uploads them instead.
- `sg pull` writes the server's latest rev to the local file.
- Drift guard: the CLI remembers the rev it last pulled or applied; `plan` and `apply` refuse when the server's rev is newer, and say to run `sg pull`.
- GUI config edits (plant / remove estate today, settings forms later) go through the same validate-and-store path and bump the rev. When auth is enabled in the project config, they and the CLI need an authorized user (auth itself lands in M1 item 5; this change adds the check point).
- Apply progress and completion reach the CLI and browsers as events (`config.applied`, `apply.progress`, `release`).

## Capabilities

### New Capabilities
- `config-apply`: config revisions on the server, plan, apply, pull, drift guard, local vs server rendering, and who may change the config.

### Modified Capabilities

## Impact

- Server: config state moves from the watched file into the SQLite store; new `/api/plan`, `/api/apply`, `/api/state`, artifact upload; `/api/estates` routes go through apply; file watcher removed.
- CLI: `server/sg.ts` becomes an HTTP client for plan/apply/pull, plus the existing local renderer for `--local-render`. Local state in `.sitegarden/` next to the config (gitignored).
- docs/plan.md "Render pipeline" triggers section rewritten.
- Depends on `m1-core` (graph, holder, store, events). Version 0.3.0.
- Out of scope: auth implementation (M1 item 5), a push webhook from the config repo, multi-user locking beyond the rev check.
