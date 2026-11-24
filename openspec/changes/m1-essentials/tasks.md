# Tasks

## 1. Shorthands

- [x] 1.1 `ctx.registerShorthand` and `expandLinks` after validation (D1). Verify: tests for generated links, explicit override by label, disposer removes the field and its links, field error on its line.
- [ ] 1.2 Essentials `repo`, `sanity`, `studio`, `url` (D2); sample config uses them where the links are identical (D6). Verify: test comparing the old explicit links with the expanded ones for every converted node; `pnpm sg plan` (or `/api/plan` against a scratch server) shows nothing to render and no graph link changes.

## 2. Checks

- [ ] 2.1 `ctx.registerCheckType`, core `checks:` field, scheduler instances per entry with key + config reuse (D3). Verify: tests for unknown type error with line, `every` from the entry, an apply that leaves a check unchanged keeps its timer and fail count.
- [ ] 2.2 Essentials `http` check (D4, D5): status and text matching, timing, `alert_after` via plugin KV, `allow_private`. Verify: tests against local servers (with `allow_private: true`) for ok, wrong status, missing text, timeout, `alert_after: 2` degraded then down then ok; a check to `192.168.1.1` without `allow_private` fails with the blocked reason without a connection (injected lookup).

## 3. Config spec and close-out

- [ ] 3.1 Make the server emit `config.invalid` when a plan, apply or GUI edit is rejected as invalid, if it does not already (spec `garden-config` modified requirement). Verify: app test asserting the event on a rejected apply.
- [ ] 3.2 README (shorthands, `checks:` example with `expect_text` and `alert_after`), CHANGELOG 0.5.0, `package.json` 0.5.0, SDK 1.2.0. Verify: `pnpm test`, `pnpm build`, `npx oxlint` (no new errors in `server/` or `plugins/`); version check passes against main.
