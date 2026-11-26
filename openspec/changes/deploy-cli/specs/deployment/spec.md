# Spec Delta

## ADDED Requirements

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
