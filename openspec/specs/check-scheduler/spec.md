# check-scheduler Specification

## Purpose
Runs every configured check on its interval without bursts or pile-ups, backs off from failing targets, and lets the owner refresh on demand.

## Requirements

### Requirement: Checks run on their interval with jitter
Each check SHALL run every `every` (e.g. `5m`), with each run offset by a random jitter of up to 10 % of the interval. The first run SHALL be spread over the first interval after start, except for a check with no stored result, whose first run SHALL be spread over the first 5 seconds (or its interval, if shorter).

#### Scenario: Many checks at startup
- **WHEN** the server starts with 20 checks every 5 minutes that all have stored results
- **THEN** they do not all run in the same second

#### Scenario: Fresh install
- **WHEN** the server starts with an empty database and checks every minute
- **THEN** every node has a status within 5 seconds instead of staying unknown for up to a minute

### Requirement: Concurrency is limited
No more than a fixed number of checks (default 4) SHALL run at the same time; the rest SHALL wait their turn.

#### Scenario: Slow targets
- **WHEN** 10 checks are due and each takes 5 s
- **THEN** at most 4 run at once

### Requirement: Failing checks back off
After consecutive failures a check's next run SHALL be delayed exponentially, capped at 4x its interval, and SHALL return to its normal interval after one success.

#### Scenario: Target down for an hour
- **WHEN** a 5-minute check fails repeatedly
- **THEN** its gaps grow up to 20 minutes, and after it passes again it runs every 5 minutes

### Requirement: Results map onto the status vocabulary
Every check result SHALL be one of `ok`, `degraded`, `down`, `working`, `paused`, `unknown`, be stored as a snapshot, and emit a `check.result` event; a change of status SHALL also emit `node.status`.

#### Scenario: Site goes down
- **WHEN** a check that was `ok` returns `down`
- **THEN** a snapshot is stored and both `check.result` and `node.status` events are emitted

### Requirement: Manual refresh
A refresh request for a node, or for everything, SHALL run the matching checks now, ignoring backoff, still within the concurrency limit.

#### Scenario: Refresh one node
- **WHEN** the owner refreshes node `fernhill-site`
- **THEN** its checks run within a second and the result events follow
