# Tasks

## 1. Secrets

- [x] 1.1 `server/core/secrets.ts` (D1): env, `_FILE` with trim, lazy cache, `missing`, `redact` incl. base64 forms. Verify: `secrets.test.ts` covers env, file with trailing newline, missing, unreadable file, redaction of plain and base64 values.
- [x] 1.2 Core schema `secrets:`, undeclared `${secret:NAME}` as a line-numbered config error, missing-value warnings in `/api/plan`, `sg plan` and the server log (D2). Verify: graph tests for the undeclared reference line; app test for the plan warning; `sg plan` prints it.

## 2. Outbound guard

- [x] 2.1 Add `undici`; `server/core/http.ts` guard (D3): BlockList ranges incl. IPv4-mapped, metadata name, IP literals, checked-lookup Agent, `allowPrivate` Agent. Verify: `http.test.ts` with an injected lookup: private/loopback/link-local/CGNAT/ULA/mapped answers refused, mixed answer refused, public answer allowed and the socket connects to the checked address, literal `169.254.169.254` refused, `allowPrivate` allows `192.168.1.20` (use a local test server bound to 127.0.0.1 with `allowPrivate` for the positive path).
- [ ] 2.2 Host allowlist, secret substitution with permission check, manual redirects (5 max, re-checked, secret headers dropped on host change), timeout, body cap, redacted errors (D3). Verify: tests for each spec scenario in `outbound-guard` and `secrets` using local servers.

## 3. Wiring

- [ ] 3.1 `ctx.http` in `PluginContext`, permissions enforced, `SDK_VERSION` 1.1.0 (D4). Verify: plugin-host test with a fixture plugin calling a local server through `ctx.http`; a plugin without the network permission is refused.
- [ ] 3.2 Redaction at every D5 point via `server/core/log.ts`. Verify: tests that an event, a check detail and an apply error containing a secret value come out as `[secret:NAME]`; `rg "console\.(log|warn|error)" server/` only matches `log.ts` and the CLI output in `sg.ts`.

## 4. Close-out

- [ ] 4.1 README secrets section (env, `_FILE`, compose `secrets:` example, `permissions` in plugin manifests); CHANGELOG 0.4.0; `package.json` 0.4.0. Verify: `pnpm test`, `pnpm build`, `npx oxlint` (no new errors) pass; version check script passes against main.
