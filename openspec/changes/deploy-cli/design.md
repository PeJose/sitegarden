# Design

## Context

`release.yml` tags and creates a GitHub release when `package.json`'s version is new on `main`. `Dockerfile` is two-stage (pnpm build, then prod deps + server + dist), runs as `node`, healthcheck on `/api/health`. `docker-compose.yml`: `tailscale` sidecar + `sitegarden` (`build: .`, `network_mode: service:tailscale`). `server/sg.ts` dispatches `plan | apply | pull | schema | hash-password` on `args[0]`, exits with codes via `die`. The repo is `PeJose/sitegarden` (image names must be lowercase).

## Decisions

### D1. Image publishing
A second job in `release.yml`, `image`, runs after `release` only when a new tag was created (job output from the release step). It uses `docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/login-action` (registry `ghcr.io`, `${{ github.actor }}`, `GITHUB_TOKEN`), `docker/build-push-action` with `platforms: linux/amd64,linux/arm64`, `push: true`, tags `ghcr.io/pejose/sitegarden:<version>` and `:latest`, OCI labels (`org.opencontainers.image.source` = repo URL, so the package links to the repo), GHA cache. Workflow permissions add `packages: write`. Pin actions to major versions like the existing ones.

### D2. Compose
`sitegarden` gets `image: ghcr.io/pejose/sitegarden:${SITEGARDEN_VERSION:-latest}` next to `build: .`. Nothing else changes; a server's local `docker-compose.override.yml` keeps working.

### D3. `sg deploy`
Pure builder `deployPlan(opts) → { local: string[][]; remote: string[] }` (argv arrays for local commands, shell lines for the host) in `server/deploy.ts`, unit-tested; `sg.ts` only parses flags and runs it (`spawnSync` with `stdio: 'inherit'`, the host part through one `ssh <target> 'set -e; …'`). SSH target parsing: `--host "root@box -p 2222"` → `ssh -p 2222 root@box`; `SITEGARDEN_DEPLOY_HOST` as the default. Host arch for `local` from `ssh host uname -m` (`x86_64` → `amd64`, `aarch64` → `arm64`). `local` streams `docker save ghcr.io/pejose/sitegarden:<v> | gzip -1 | ssh host 'gunzip | docker load'`. After `up -d`: `docker image prune -f`, then poll `docker compose exec -T sitegarden node -e "fetch('http://127.0.0.1:8787/api/health')…"` up to 120 s and print `{version}`; exit 5 when it never comes up (print the last 30 log lines). `--dry-run` prints the commands without running them. Never put secrets on the command line.

### D4. Docs
README "Run it on a server" → "Updating": the three modes with one example each, the one-time "make the GHCR package public" step (or `docker login ghcr.io` on the host), and that `server` mode is the slow one on small boxes.

## Testing

Unit: `deployPlan` for each mode (commands, ssh target parsing, arch mapping, version defaults, dry run). Workflow: YAML parse + `actionlint` if available. Manual: `--dry-run` for each mode against the real host string. A real `ci` deploy can only be checked after the first release publishes the image.

## Risks

- [GHCR package private by default] → documented one-time step.
- [arm64 build under QEMU is slow in CI] → only on releases; cached.
