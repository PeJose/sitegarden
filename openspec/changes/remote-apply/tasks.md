# Tasks

## 1. Revisions on the server

- [x] 1.1 `config_revs` table and `latestRev`/`getRev`/`storeRev` with `DriftError` (D1). Verify: db tests for increasing revs, compare-and-set rejecting a stale base, two racing stores where exactly one wins.
- [x] 1.2 Server loads from the latest revision, bootstrap import as rev 1, config file watcher removed, startup log line (D2). Verify: test that an empty store imports the file once; editing the file after start changes nothing; `pnpm sg plan` still renders the same map (nothing to do against the existing release).

## 2. Plan and apply API

- [x] 2.1 `POST /api/plan` with validation issues, graph diff, render estimate, `planId`, drift 409 (D3). Verify: Hono in-process tests for valid change (`+ node`), invalid (line-numbered issue), drift, and a plan that leaves rev unchanged.
- [x] 2.2 `POST /api/apply`, `GET /api/state`, `config.applied` and `apply.progress` events, unchanged detection (D4). Verify: tests for apply → rev+1 and event, planId mismatch rejected, identical YAML → unchanged, racing applies → one 409.
- [x] 2.3 `canEditConfig` and `auth.enabled` in the core schema (D7); GUI `/api/estates` routes through revisions with source `gui` (D8). Verify: tests: auth disabled → GUI edit makes a `gui` rev; auth enabled → apply and GUI edit refused, no rev.

## 3. CLI

- [x] 3.1 `sg plan` / `sg apply` / `sg pull` as HTTP client with `.sitegarden/state.json`, confirmation, `--yes`, `--no-wait`, `--force`, drift exit code 3 (D5). Verify: test running the CLI against an in-process server on a random port: plan prints diff; apply bumps rev and waits for the release; GUI edit then `sg plan` refuses with the drift message; `sg pull` fixes it; `pull` refuses over unapplied local edits.

## 4. Local render

- [x] 4.1 `--local-render`: renderer check, `/api/artifacts/missing`, `PUT /a/:name` with name and size checks, positions upload, apply with `render: 'client'` (D6). Verify: against a local server on another `SITEGARDEN_DATA` dir, `sg apply --local-render` with one changed estate uploads the missing tiles and the server log shows no tile rendering; renderer mismatch stops before upload.

## 5. Close-out

- [ ] 5.1 Rewrite docs/plan.md "Render pipeline" triggers paragraph and the README dev section for the new flow; CHANGELOG 0.3.0 (**BREAKING**: server ignores config file edits after bootstrap); `package.json` 0.3.0. Verify: `pnpm test`, `pnpm lint`, `pnpm build` pass; README commands run as written against `pnpm dev`.
