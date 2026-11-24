# Design

## Context

After m1-core and remote-apply: the core schema is in `server/core/graph.ts` (`buildSchema`, `parseGraph` with line mapping); plugin manifests already parse `permissions: { network, secrets, actions }` in `server/core/plugins.ts` (stored, not enforced); `PluginContext` in `server/core/sdk.ts` has no HTTP client; events go through `server/core/events.ts` into `db.ts`; plan/apply live in `server/app.ts` and `server/sg.ts`. Node 22, no `undici` package installed (only the bundled one behind `fetch`).

## Goals / Non-Goals

**Goals:** one choke point for secrets and outbound HTTP; testable without the internet.

**Non-Goals:** expiry warnings beyond storing `expires`; secrets in non-HTTP places (SSH, SMTP); per-check `allow_private` YAML field (M1 item 3 adds checks and wires their YAML to `allowPrivate`).

## Decisions

### D1. Secret store
`server/core/secrets.ts`: `createSecrets(env = process.env, readFile = fs.readFileSync)` → `{ value(name), missing(names), redact(text) }`. Values are read lazily on first use and cached; `_FILE` read errors count as missing with the error in the warning. `redact` replaces every known value (length ≥ 4, to avoid mangling text) with `[secret:NAME]`, longest first.

### D2. Config
Core schema gets `secrets: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.strictObject({ expires: z.string().optional() })).default({})`. After the schema pass, `parseGraph` walks every string value of the parsed document and reports each `${secret:NAME}` whose NAME is not declared, using the existing line mapping. Missing values are not config errors: `/api/plan` returns `warnings: [{ secret, message }]` and `sg plan` prints them; the server logs them once per load.

### D3. HTTP client
Add `undici` (same major as Node 22's bundled one is not required; use its own `fetch` + `Agent` so `dispatcher` and `connect.lookup` match). `server/core/http.ts`: `createHttp({ secrets, lookup = dns.lookup })` → `forPlugin(manifest) => (url, init?: { method, headers, body, allowPrivate, timeoutMs, maxBytes }) => Promise<{ status, headers, text(), json() }>`.
- Host allowlist from `permissions.network` before anything else.
- Secret substitution in URL and header values, only for names in `permissions.secrets`, else refuse.
- Guard: `net.BlockList` with the D-list ranges (IPv4 and IPv6, plus IPv4-mapped by normalising `::ffff:a.b.c.d` before the check); `metadata.google.internal` refused by name. IP literals (`net.isIP(host)`) checked directly. Names: a custom `lookup(host, opts, cb)` passed as `connect.lookup` of an `Agent` resolves with `{ all: true }`, fails if ANY address is blocked (unless `allowPrivate`), and returns the first address, so the socket connects to a checked address and TLS still uses the host name. Two Agents (guarded, allowPrivate) created once.
- `redirect: 'manual'`; loop up to 5 hops, resolving `Location` against the current URL, re-running allowlist + guard per hop (the lookup does the address check), dropping `authorization`/secret-substituted headers when the host changes.
- Timeout via `AbortSignal.timeout`; body read through the stream with a byte counter, abort over the cap.
- Errors are `HttpError` with a message that went through `redact`.

### D4. Plugin context
`PluginContext.http` = `http.forPlugin(manifest)`; `permissions` are now enforced. `SDK_VERSION` → `1.1.0` (additive). Tier-A plugins get no `http` (they run no code anyway).

### D5. Redaction points
`bus.emit` (data JSON string), the check scheduler's stored `detail`, `console.error/warn/log` wrapper used by the server (one `log` helper in `server/core/log.ts`; replace direct `console.*` calls in `server/` with it), and `ConfigError`/apply error messages returned by the API. Browser APIs never include values because values are never placed into the graph or YAML.

## Risks / Trade-offs

- [DNS answer differs between check and connect] → impossible here: the lookup used for the connection is the one that checks.
- [Happy-eyeballs / `autoSelectFamily` calls lookup with `all: true` and tries several addresses] → the lookup returns only checked addresses; the "fail if any is blocked" rule makes mixed answers fail.
- [Redaction misses encoded forms (base64 in Basic auth)] → also redact the base64 of each value; documented limit for other encodings.
- [undici version drift vs Node's fetch] → only the package's own `fetch` is used with its `Agent`.

## Migration Plan

Additive. Version 0.4.0, CHANGELOG entry. README: secrets section (env, `_FILE`, compose `secrets:` example).
