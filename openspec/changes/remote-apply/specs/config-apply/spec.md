# Spec Delta

## Purpose

Makes the server's applied config the single state of a garden, changed only through a validated plan-and-apply flow from the CLI or the GUI, with a revision number that stops one change from silently overwriting another.

## ADDED Requirements

### Requirement: Applied config is stored as revisions
The server SHALL store every accepted config as a revision with an increasing number, the time, the source (`cli`, `gui`, `bootstrap`) and the full YAML text. The running graph SHALL be the latest revision. The server SHALL NOT change its config from a file on disk after the first start.

#### Scenario: First start
- **WHEN** the server starts with an empty store and `SITEGARDEN_CONFIG` points to a valid file
- **THEN** that file is stored as rev 1 with source `bootstrap` and the map renders from it

#### Scenario: Editing the file on the server does nothing
- **WHEN** someone edits the config file on the server's disk after rev 1
- **THEN** the running graph and the map do not change

### Requirement: Plan shows validated changes without applying
`sg plan` SHALL send the local config to the server and print either every validation error with its line, or the differences from the latest revision (added, changed, removed groups, nodes, edges and extensions) and the number of tiles to render with a time estimate. It SHALL NOT change the server.

#### Scenario: Valid change
- **WHEN** the owner adds one node and runs `sg plan`
- **THEN** the output lists `+ node <id>` and the tiles to render, and the server's rev is unchanged

#### Scenario: Invalid change
- **WHEN** the local config has an edge to a missing node
- **THEN** `sg plan` prints the error with its line and exits non-zero

### Requirement: Apply stores and renders after confirmation
`sg apply` SHALL show the same plan, ask for confirmation unless `--yes` is given, then have the server validate again, store the config as the next revision and render it. The CLI SHALL wait until the new release is published, showing progress, unless `--no-wait` is given. A config identical to the latest revision SHALL be reported as "no changes" and not stored.

#### Scenario: Apply a new node
- **WHEN** the owner confirms `sg apply` with one new node
- **THEN** the server is at the next rev, the new release includes the node, and open browsers update

### Requirement: Drift guard on plan and apply
The CLI SHALL remember the revision it last pulled or applied. `sg plan` and `sg apply` SHALL refuse when the server's latest revision is newer, naming both revisions and telling the owner to run `sg pull`. The server SHALL reject an apply whose base revision is not its latest.

#### Scenario: GUI edit since the last pull
- **WHEN** the CLI is based on rev 8 and a GUI edit made rev 9
- **THEN** `sg plan` and `sg apply` say "server is at rev 9, you are based on rev 8: run sg pull" and change nothing

#### Scenario: Two applies race
- **WHEN** two CLIs based on rev 8 apply at the same time
- **THEN** one becomes rev 9 and the other is rejected with the drift message

### Requirement: Pull brings the server's config home
`sg pull` SHALL write the latest revision's YAML to the local config file and record that revision. It SHALL refuse to overwrite local changes that were never applied, unless `--force` is given.

#### Scenario: Pull after a GUI edit
- **WHEN** the owner runs `sg pull` with no local changes
- **THEN** the local file equals rev 9 and the next `sg plan` shows no changes

### Requirement: Rendering on the server or locally
By default the server SHALL render the missing tiles after an apply. With `--local-render` the CLI SHALL render the missing tiles on the local machine, upload them, and then apply, so the server renders nothing. The CLI SHALL refuse local rendering when its renderer version differs from the server's.

#### Scenario: Local render
- **WHEN** the owner runs `sg apply --local-render` with one changed estate
- **THEN** the server receives the missing tiles before the new revision is published and renders no tile itself

#### Scenario: Renderer mismatch
- **WHEN** the local renderer version differs from the server's
- **THEN** `--local-render` stops with both versions named and nothing is uploaded

### Requirement: GUI edits use the same path and permissions
Config changes from the GUI SHALL be validated and stored as revisions with source `gui`, exactly like a CLI apply. When auth is enabled in the project config, config changes from the GUI and the CLI SHALL require an authorized user; when it is not enabled, they are allowed.

#### Scenario: Plant an estate in the GUI
- **WHEN** the owner plants an estate in the GUI with auth disabled
- **THEN** a new revision with source `gui` exists and the map renders it

#### Scenario: Auth enabled, no permission
- **WHEN** auth is enabled and a request without an authorized user tries to change the config
- **THEN** it is refused and no revision is created
