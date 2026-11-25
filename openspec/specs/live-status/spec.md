# live-status Specification

## Purpose
TBD - created by archiving change m1-map-v0. Update Purpose after archive.

## Requirements

### Requirement: Status snapshot
The server SHALL serve `GET /api/status` with every node of the current config, its worst current check status, last check time, last response time, a response-time history of up to 48 points, its checks' latest results, and the last event ID at the time of the read.

#### Scenario: Node never checked
- **WHEN** a node has no check results yet
- **THEN** it appears with status `unknown` and an empty history

### Requirement: Map shows server statuses
The web app SHALL show the statuses from the snapshot and then apply `node.status` and `check.result` events newer than the snapshot's last event ID, without reloading the page.

#### Scenario: Site goes down
- **WHEN** a check on a site fails while the map is open
- **THEN** its pin, the status strip and the Inventory show it down within a second of the event

### Requirement: Refresh
"Check now" on a node and "Check everything" SHALL run the matching checks on the server immediately; the results arrive as events.

#### Scenario: Node without checks
- **WHEN** the owner presses "Check now" on a node that has no checks
- **THEN** a toast says there is nothing to check and no status changes
