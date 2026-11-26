# Proposal

## Why

Building the Docker image on the server (`docker compose up --build`) took a 1 GB / 1 CPU box to load 11 for minutes: SSH barely answered and the map stalled. The owner should choose where the image is built: a published image from CI (default, nothing compiles on the server), the owner's own machine, or the server itself. The choice belongs in the CLI, so updating a server is one command. Needed before 1.0.

## What Changes

- The release workflow publishes a multi-arch image (`linux/amd64`, `linux/arm64`) to GitHub Container Registry on every release: `ghcr.io/pejose/sitegarden:<version>` and `:latest`.
- `docker-compose.yml` names that image (`image: ghcr.io/pejose/sitegarden:${SITEGARDEN_VERSION:-latest}`) and keeps `build: .`, so `pull` uses CI's image and `--build` still builds from source.
- New CLI command `sg deploy` with `--build ci | local | server` (default `ci`), `--host ssh-target` (e.g. `root@box -p 2222`, or `SITEGARDEN_DEPLOY_HOST`), `--dir` (default `/opt/sitegarden`), `--version` (default: this checkout's `package.json` version for `local`/`server`, `latest` for `ci`):
  - `ci`: on the host, `docker compose pull sitegarden && docker compose up -d sitegarden`.
  - `local`: build the image on this machine for the host's architecture (`docker buildx build --platform linux/<host arch> --load`), stream it over SSH (`docker save | ssh host docker load`), then `up -d` on the host.
  - `server`: on the host, `git fetch && git checkout <version tag or current branch> && docker compose up -d --build sitegarden`, with the build at `nice -n 10`.
  - All modes then prune dangling images, wait for `/api/health` inside the stack, and print the running version.
- README "Run it on a server": the three modes; the GHCR package must be public once (one click), or the host logs in with a token.
- Minor version bump over main (new CLI command).

## Capabilities

### Modified Capabilities
- `deployment`: published images and the deploy command.

## Impact

`.github/workflows/release.yml` (image job, `packages: write`), `docker-compose.yml`, `server/sg.ts` (`deploy`), README, CHANGELOG, tests for the command builder.
