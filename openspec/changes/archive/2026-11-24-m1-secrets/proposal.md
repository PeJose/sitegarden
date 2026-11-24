# Proposal

## Why

M1 item 3 adds real checks and M2 adds GitHub calls, so plugins are about to make outbound requests with tokens. Before that, the core needs one place that holds secret values and one HTTP client that refuses internal addresses (docs/security-model.md §3 Storage and §4 Outbound requests).

## What Changes

- `secrets:` in the config declares secret names (optional `expires` date). Values come from env `NAME` or the file named by `NAME_FILE` (trimmed). The config only ever holds `${secret:NAME}` references.
- Referencing an undeclared secret is a config error with its line. A declared secret with no value is allowed; `sg plan` and the server log warn about it.
- Plugins get `ctx.http(url, init)`: the only outbound client. It substitutes `${secret:NAME}` in the URL and headers at send time, and only for names listed in the plugin's manifest `permissions.secrets`. Plugins never receive secret values.
- `ctx.http` enforces the manifest's `permissions.network` host allowlist (`"*"` allows any host).
- SSRF guard on every `ctx.http` request: resolve first and check every resolved IP against a deny list (loopback, private, link-local, CGNAT/tailnet, ULA, multicast, metadata, IPv4-mapped forms), then connect to that checked IP. IP-literal URLs are checked too. Redirects are followed manually, at most 5, re-checking each hop. Per-request `allowPrivate: true` opt-in for checks of internal services. Timeout and response size cap.
- Secret values are redacted from logs, stored events, check details and error messages.

## Capabilities

### New Capabilities
- `secrets`: declaring secrets, where values come from, how they reach outbound requests, and redaction.
- `outbound-guard`: the plugin HTTP client, host allowlist, SSRF rules, redirects, limits.

### Modified Capabilities

## Impact

- Server: new `server/core/secrets.ts`, `server/core/http.ts`; `graph.ts` (core schema `secrets`, reference check), `plugins.ts`/`sdk.ts` (`ctx.http`, permissions enforced), `events.ts`/`db.ts` and logging (redaction), `sg.ts`/`app.ts` (missing-value warning in plan).
- Dependency: `undici` (Agent with `connect.lookup`).
- Version 0.4.0.
- Out of scope: secret expiry warnings in the UI, SOPS, webhook HMAC (inbound), auth.
