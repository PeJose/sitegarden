# Design

## Context

After `m1-core`: `server/config.ts` loads `sitegarden.yaml` from `CONFIG_FILE` through the plugin host and `parseGraph`; `server/core/holder.ts` keeps the last good graph and emits `config.loaded` / `config.invalid`; `server/index.ts` watches the file, reloads, re-plans checks and runs `apply()` (render) on every good reload; `server/sg.ts` runs `computePlan`/`apply` in-process on the same `DATA` dir. Positions (layout results) live in `<DATA>/positions.json`. GUI routes `POST /api/estates` and `DELETE /api/estates/last` edit the file through the YAML document API.

## Goals / Non-Goals

**Goals:**
- The server's store is the only config state; every change is a revision; the file on disk is only a bootstrap.
- The CLI works against a local or remote server with the same commands.
- Rendering stays the existing `plan.ts`/`apply.ts` pipeline, run either on the server or by the CLI.

**Non-Goals:**
- Auth itself (sessions, tokens, roles): M1 item 5. This change adds one `canEditConfig(c)` check point and the `auth.enabled` config flag it reads.
- Webhook trigger from the config repo, plan files saved to disk, state locking beyond the revision check.

## Decisions

### D1. Revisions in SQLite
New table `config_revs(rev INTEGER PRIMARY KEY, at, source, yaml)` in the existing db (bump `user_version`). `latestRev()`, `getRev(n)`, `storeRev(baseRev, yaml, source)`; `storeRev` runs in one transaction and fails with `DriftError(latest)` when `baseRev !== latest`, so two racing applies cannot both win. Positions keep living in `positions.json` (they are layout cache, recomputable from the config).
Alternative: files `rev-<n>.yaml` + pointer. Rejected: the db already gives atomic compare-and-set.

### D2. Server loads from the latest revision
`loadGraph(text)` takes YAML text instead of reading `CONFIG_FILE`; the holder's loader reads the latest rev. Startup: if `config_revs` is empty and `CONFIG_FILE` exists, store it as rev 1 (`bootstrap`). The `fs.watch` on the config dir is removed. The `fs.watch` on `DATA` (release pointer) stays, because `--local-render` and old-style local runs publish there.

### D3. Plan on the server
`POST /api/plan { yaml, baseRev }` → `{ rev, ok: false, issues }` or `{ rev, ok: true, diff, render: { jobs, tiles, ms }, planId }`. Validation is the same `parseGraph` with the server's plugin set; if the YAML changes `plugins:`, the server loads them in a throwaway host for the plan (no registrations kept). Diff is computed on the graph: per kind (`group`, `node`, `edge` keyed `from>to:type`, `extension`), `+`/`~`/`-` with the ids; `~` when the item's canonical JSON differs. Render estimate = `computePlan(toRenderConfig(graph), positions)` → `missing()` + `estimateMs`, with positions computed for new estates the same way apply does, not persisted. `planId` = hash of `baseRev + yaml`. A `baseRev` older than latest → 409 `{ error: 'drift', rev }`.

### D4. Apply on the server
`POST /api/apply { yaml, baseRev, planId, render: 'server' | 'client' }`: re-validate, check `planId` matches the hash (the CLI applies exactly what it showed), `storeRev` (`source: 'cli'`), swap the holder's graph, emit `config.applied { rev, source }`, re-plan checks. `render: 'server'` → run the existing `runApply()` loop (supersede logic kept). `render: 'client'` → the server only publishes once the client says so (D6). Identical YAML (byte-equal after trim) → `{ unchanged: true }`, no new rev. Comments are config content, so a comment-only edit is stored as a new rev (empty graph diff, nothing to render; the CLI says "no graph changes, text changed: stored as rev N"). `apply.ts` progress lines become `apply.progress { rev, done, total }` events (throttled to ~4/s); the CLI follows `/api/events` until a `release` whose manifest is complete for that rev, unless `--no-wait`.

### D5. CLI
`server/sg.ts`: `sg plan|apply|pull|schema [--server URL] [--yes] [--no-wait] [--local-render] [--force]`. Server URL from `--server`, else `SITEGARDEN_SERVER`, else `http://localhost:8787`. Local state `.sitegarden/state.json` next to the config: `{ server, rev, base: sha1 of the YAML text at that rev }`; `.sitegarden/` added to `.gitignore`. `plan`/`apply` send `baseRev` from state (a missing state = 0, which only matches an empty server). Drift → "server is at rev 9, you are based on rev 8: run sg pull", exit 3. `pull`: `GET /api/state` → `{ rev, yaml }`; refuse when the local file's hash differs from `base` (unapplied local edits) unless `--force`; write file, update state. Confirmation prompt via `node:readline`. Output format follows the current `sg plan` lines plus the diff list. `sg schema` keeps working locally.

### D6. Local render
`--local-render`: `GET /api/state` also returns `{ renderer: RENDERER, positions }`; refuse when `RENDERER` differs. The CLI computes the plan locally with the server's positions, asks the server which artifact names it lacks (`POST /api/artifacts/missing { names }` → `{ missing }`), renders those with the existing `apply.ts` render functions into a temp `DATA`, uploads each with `PUT /a/:name` (name validated with the existing `^[\w.-]+$` rule, size cap 20 MB, written with `writeAtomic`), uploads positions for new estates, then calls `/api/apply` with `render: 'client'`; the server then runs `runApply()`, which finds every artifact present and only publishes. Artifact names are input hashes, so the server cannot verify content; uploads are trusted to authorized clients only (D7).

### D7. Who may change the config
`canEditConfig(c)`: returns true when the latest graph has no `auth.enabled: true`; otherwise false until M1 item 5 replaces it with a real session/token check (so enabling auth before item 5 locks config changes rather than leaving them open). Applied to `/api/apply`, `PUT /a/:name`, `/api/artifacts/missing`, `/api/estates*`. `/api/plan` and `/api/state` stay readable like the rest of the API. Core schema gets `auth: { enabled: boolean }` (optional, default false).

### D8. GUI edits
`/api/estates` routes build the new YAML from the latest rev with the YAML document API (comments kept), then go through the same validate + `storeRev(latest, yaml, 'gui')` + render path. They emit `config.applied { source: 'gui' }`.

## Risks / Trade-offs

- [Plugin code runs during plan for a config that adds plugins] → plugins are local folders/installed packages on the server only (tier B = code you installed), same trust as today; throwaway host disposes them.
- [Uploaded artifacts could be garbage] → only through `canEditConfig`; `collect()` drops unreferenced ones; renderer version check.
- [Server and CLI on different plugin sets] → plan always validates on the server; local render refuses on renderer mismatch; schema mismatch shows up as plan errors.
- [Lost bootstrap file edits] → after rev 1 the file is ignored; the server logs once at start "config file ignored, server is at rev N: use sg apply".

## Migration Plan

Existing dev setups: first start imports `sitegarden.yaml` as rev 1; afterwards use `pnpm sg apply`. README dev section updated. Version 0.3.0, CHANGELOG entry with **BREAKING** (server ignores file edits after bootstrap).
