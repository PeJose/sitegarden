# sitegarden — security

Threat model: the box holds tokens that can trigger deploys of your sites. The worst case is a leaked token pushing code or running a workflow. So: keep the app off the internet, keep every token narrow, verify everything that comes in, log every action.

Facts below were checked against official docs on 2026-11-20 (sources at the bottom). Items still marked **verify** were not confirmed.

## 1. Network: behind a VPN

### Default: Tailscale sidecar

```yaml
services:
  tailscale:
    image: tailscale/tailscale
    hostname: sitegarden
    environment:
      TS_AUTHKEY: ${TS_AUTHKEY}          # auth key or OAuth secret (+ tag via TS_EXTRA_ARGS)
      TS_STATE_DIR: /var/lib/tailscale   # must persist, or every restart is a new node
      TS_SERVE_CONFIG: /config/serve.json
      TS_AUTH_ONCE: "true"
    volumes:
      - ts-state:/var/lib/tailscale
      - ./ts-config:/config              # mount the directory, not the file
  app:
    image: sitegarden
    network_mode: service:tailscale      # shares the sidecar's network namespace
    # no `ports:` — nothing is published on the host
```

- The app listens on `127.0.0.1` inside the sidecar's namespace. `tailscale serve` exposes it on 443 with a MagicDNS HTTPS certificate, tailnet only.
- No open ports on the VPS except SSH, and SSH can go over Tailscale too.
- Get `serve.json` by running `tailscale serve status --json` once and saving it.

### Fully self-hosted: Headscale

- Same Tailscale clients, your own coordination server.
- `serve` over HTTPS was only recently supported (Headscale PR #3554, milestone v0.34). **Verify** your release includes it.
- **Funnel does not work on Headscale** (issue #3435, not planned). For inbound webhooks, use the public-ingress recipe below instead.

### Alternatives

Plain WireGuard; Cloudflare Tunnel + Access (works, but the control plane is Cloudflare's, so it is not self-hosted).

### Inbound webhooks: the one public need

GitHub and Sanity webhooks give instant updates. Until this exists, sitegarden polls.

| Option | How | Notes |
|---|---|---|
| Tailscale Funnel | UI on 443 via Serve (tailnet only); a **separate Funnel on 8443** whose only handler is `/hooks` | Funnel is per port, not per path. Allowed ports: 443, 8443, 10000. Tailscale-hosted control plane only |
| Tiny public proxy | Caddy on a public box, or a Cloudflare Tunnel, forwarding only `/hooks/*` | The Headscale option |
| Poll | No ingress at all | Default |

Every `/hooks/*` request is verified before anything else happens (see §4).

## 2. App auth: on even inside the VPN

| Mode | How | When |
|---|---|---|
| `tailscale` (default) | Trust `Tailscale-User-Login` from `tailscale serve`; allowlist of logins. Serve strips incoming copies of the header, and the app listens on localhost only, so it can't be forged | Inside a Tailscale tailnet |
| `password` | Argon2id hash, session cookie (HttpOnly, Secure, SameSite=Strict), optional TOTP or passkey | No VPN, tagged devices, or as a second factor |
| `oidc` (later) | Pocket ID, Authelia, Authentik | Already running an IdP |

- **Fail closed.** If `Tailscale-User-Login` is missing, return 401. Serve does **not** set it for traffic from **tagged devices** or via **Funnel**. So a tagged laptop or a script on a tagged node needs the password mode or an API token.
- Later: `--accept-app-caps` (Tailscale 1.92+) forwards ACL-granted capabilities, which also work for tagged nodes. That could map tailnet ACLs to sitegarden roles.
- Optional `whois` via the tailscaled socket turns an IP into a device name ("deployed from owner-laptop") for the audit log. Its API is marked not stable, so it is a later nicety.
- Roles: `viewer` (map and lists) and `operator` (actions). A single user is fine for MVP, but every action records who did it.

## 3. Tokens: least privilege

### GitHub (fine-grained PATs, selected repos only)

| Token | Repository permissions | Used for |
|---|---|---|
| `GITHUB_READ` | Metadata (implicit), Contents: read, Actions: read, Pull requests: read, Webhooks: read | CI status, runs, jobs, logs, commits, PRs, webhook delivery log |
| `GITHUB_DEPLOY` | Actions: **write** | `workflow_dispatch`, re-run, cancel |
| `GITHUB_ADMIN` (optional, short-lived) | Webhooks: write, Issues: write | One-off webhook setup, "incident → issue" |

Confirmed facts:

- `workflow_dispatch` needs **Actions: write**. `repository_dispatch` needs **Contents: write**, which can also push code. So deploys use `workflow_dispatch`.
- Actions: write cannot push code or edit `.github/workflows/*` (that needs Contents: write and the separate Workflows permission).
- But Actions: write **can dispatch any workflow on any ref** in the selected repos. So `workflow` and `ref` are pinned server-side from YAML. The browser never sends a ref or inputs unless they are on an allowlist. Protect production with GitHub environment rules.
- The dispatch call now returns **200 with `workflow_run_id`, `run_url` and `html_url`**, so sitegarden tracks the exact run it started (no guessing by timestamp).
- Workflow logs: `GET .../runs/{id}/logs` returns a 302 to a zip that expires in 1 minute. Download server-side and redact before showing.

Expiry:

- Fine-grained PATs can be set to never expire, unless an org policy caps their lifetime. The default is 30 days and the UI offers up to 366 days. Unused PATs are removed after 1 year.
- API responses carry a `GitHub-Authentication-Token-Expiration` header (GitHub changelog, not the REST reference; **verify** on a fine-grained token: `curl -i https://api.github.com/rate_limit -H "Authorization: Bearer $T"`). Read it automatically; use `expires:` in YAML as the fallback.

Later: a **GitHub App** instead of PATs.

- 1-hour installation tokens, each narrowed to specific repos and permissions; not tied to your user; webhooks built in.
- Setup via the manifest flow: sitegarden POSTs a manifest, GitHub redirects back with a code, sitegarden exchanges it for the app id, private key and webhook secret. About a day of work as a setup wizard.
- Costs more code (JWT signing, a private key to guard). PATs for MVP. Make "GitHub auth provider" an interface so the App slots in later.

### Sanity

| Need | Role |
|---|---|
| Read project info, datasets, content | Viewer |
| List webhooks and delivery attempts | a custom role with `sanity.project.webhooks/read` (**verify** whether Viewer can) |
| Manage webhooks, tokens, CORS | Developer or Administrator, only if you enable those actions |

- Robot tokens can carry `expiresAt`; `GET /projects/{id}/tokens` lists them (without values), which feeds the Expiries list.
- Webhook management API: `https://{projectId}.api.sanity.io/{apiVersion}/hooks/projects/{projectId}` (list, create, patch, delete, `/attempts`, `/messages`).
- Delivery: 30 s timeout, 2 retries 30 s apart, one concurrent request. 2xx = success, 4xx except 429 = undeliverable, 429/5xx = retried.

### Storage

- Values come from env vars, or from files via the `_FILE` convention (`GITHUB_READ_FILE=/run/secrets/github_read`). The `_FILE` convention is something the app implements itself: read the file, trim it.
- Plain `docker compose` supports top-level `secrets:` with `file:` sources, mounted at `/run/secrets/<name>`, no Swarm needed. Without Swarm they are bind mounts, so set ownership and `0400` on the host file.
- Optional SOPS + age: commit `secrets.enc.env` to the config repo, decrypt at deploy to a tmpfs file (or `sops exec-env secrets.enc.env 'docker compose up -d'`). Keep the age private key only on the box and in an offline backup.
- YAML references secrets by name: `token: ${secret:GITHUB_READ}`. The config repo never contains a value.
- Never leaked: not sent to the browser, redacted from logs, errors and workflow logs, auth headers stripped before a response is cached.

## 4. Everything that comes in or goes out

### Inbound webhooks

| Source | Header | Verify |
|---|---|---|
| GitHub | `X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of raw body>` | `crypto.timingSafeEqual` on the raw body |
| Sanity | `sanity-webhook-signature: t=<ms>,v1=<base64url HMAC>` | `@sanity/webhook` `isValidSignature`, which also checks the timestamp |

The Hono route reads `await c.req.text()` first, verifies, and only then parses JSON. Invalid signature = 401, nothing stored.

### Outbound requests (health checks, SSRF guard)

Checks hit URLs from your own config, but a guard still matters: plugins and imported configs can add URLs, and DNS can change.

- Resolve first, then check **every resolved IP**, then connect to that validated IP (keeping the hostname for SNI and the Host header). This blocks DNS rebinding. In Node: a custom `lookup` on an undici `Agent({ connect: { lookup } })` using the built-in `net.BlockList` (**verify** the undici `connect` option).
- Denied by default: loopback, `0.0.0.0/8`, RFC 1918, `169.254.0.0/16`, `100.64.0.0/10` (tailnet / CGNAT), `fe80::/10`, `fc00::/7`, multicast, IPv4-mapped forms of all of these, `fd00:ec2::254`, `metadata.google.internal`.
- Redirects are not followed automatically; each hop is re-validated.
- Opt-in per check: `allow_private: true` for internal services or tailnet nodes.
- The same guard wraps SSL-expiry checks, RDAP lookups and every plugin's `ctx.http`.

### Actions

Confirm dialog, CSRF token, rate limit, audit log (who, when, what, result). `SITEGARDEN_READ_ONLY=1` disables every action.

### Plugins

Permissions are declared in the manifest and enforced by the host. Four trust tiers; see [plugins.md](plugins.md#isolation-tiers).

## 5. Container

Non-root user, read-only root filesystem except `/data`, all capabilities dropped, healthcheck endpoint, pinned image digests. The optional Playwright screenshot worker is a separate container with no secrets.

## 6. Hosting risk

Oracle Always Free (A1): 2 OCPU / 12 GB. Oracle reclaims an instance as idle when, over 7 days, **all** of these are true: 95th-percentile CPU < 20%, network < 20%, memory < 20% (A1 only). Sitegarden meets all three, so it is at real risk. Upgrade the account to pay-as-you-go (reclamation targets Always Free tenancies), or use a small paid ARM VPS or a home box.

## Sources

- GitHub: [fine-grained PAT permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens), [workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event), [workflow runs](https://docs.github.com/en/rest/actions/workflow-runs), [managing PATs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [token expiration header](https://github.blog/changelog/2021-07-26-expiration-options-for-personal-access-tokens/), [App installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app), [App manifest flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest), [validating webhooks](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [webhook deliveries](https://docs.github.com/en/rest/repos/webhooks#list-deliveries-for-a-repository-webhook)
- Tailscale: [Serve](https://tailscale.com/kb/1312/serve), [Funnel](https://tailscale.com/kb/1223/funnel), [Docker params](https://tailscale.com/docs/features/containers/docker/docker-params), [serve config schema](https://github.com/tailscale/tailscale/blob/main/ipn/serve.go), [WhoIs](https://pkg.go.dev/tailscale.com/client/local#Client.WhoIs)
- Headscale: [features](https://headscale.net/stable/about/features/), [Serve issue #1921](https://github.com/juanfont/headscale/issues/1921), [Funnel issue #3435](https://github.com/juanfont/headscale/issues/3435)
- Sanity: [HTTP auth](https://www.sanity.io/docs/content-lake/http-auth), [roles](https://www.sanity.io/docs/roles), [projects API](https://www.sanity.io/docs/http-reference/projects), [webhooks API](https://www.sanity.io/docs/http-reference/webhooks), [webhook behaviour](https://www.sanity.io/docs/content-lake/webhooks), [webhook-toolkit](https://github.com/sanity-io/webhook-toolkit)
- [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [OWASP SSRF cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [Node net](https://nodejs.org/api/net.html), [Node tls](https://nodejs.org/api/tls.html)
- Docker: [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/), [secrets reference](https://docs.docker.com/reference/compose-file/secrets/); [SOPS with age](https://getsops.io/docs/usage/identities/age/)
