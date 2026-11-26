# deployment Specification

## Purpose
TBD - created by archiving change m1-deploy-auth. Update Purpose after archive.

## Requirements

### Requirement: One process serves app and API
In production the server SHALL serve the built web app, its assets with long-lived cache headers, and fall back to the app's index page for unknown page paths, next to the API.

#### Scenario: Deep link
- **WHEN** a browser opens `/?select=copperleaf-site` on the server
- **THEN** the map loads from the server without Vite

### Requirement: Safe listening
The server SHALL listen on `HOST` (default loopback) and SHALL refuse to start on a non-loopback address while auth is off or in `tailscale` mode, unless `SITEGARDEN_INSECURE=1`.

#### Scenario: Exposed by mistake
- **WHEN** someone starts the container with `HOST=0.0.0.0` and auth off
- **THEN** it exits with an error that says how to fix it

### Requirement: Docker compose with Tailscale
The repository SHALL ship a Dockerfile and a compose file that run the app inside a Tailscale sidecar's network namespace, exposed to the tailnet over HTTPS by `tailscale serve`, with data in a volume and a health check.

#### Scenario: First start
- **WHEN** the owner sets `TS_AUTHKEY` and runs `docker compose up -d --build`
- **THEN** the map is reachable at `https://sitegarden.<tailnet>.ts.net` from their tailnet devices only

#### Scenario: Forged Tailscale header
- **WHEN** someone starts the server with `HOST=0.0.0.0` and `tailscale` auth
- **THEN** it exits with an error, because anyone on that network could send `Tailscale-User-Login`

### Requirement: Published images
Every release SHALL publish a multi-arch image to GitHub Container Registry tagged with the version and `latest`.

#### Scenario: New release
- **WHEN** a version bump merges to main
- **THEN** `ghcr.io/pejose/sitegarden:<version>` exists for amd64 and arm64

### Requirement: Deploy command
`sg deploy` SHALL update a server over SSH with the image built in CI (default), on the owner's machine, or on the server, and SHALL report the running version or fail with the server's recent logs.

#### Scenario: Small server
- **WHEN** the owner runs `sg deploy --host "root@box -p 2222"`
- **THEN** the server pulls the published image, restarts the app and prints its version without compiling anything
