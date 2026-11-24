# core-store Specification

## Purpose
Keeps the server's state in one SQLite file in the data directory, so events, statuses and cached fetches survive restarts and can be backed up with one copy.

## Requirements

### Requirement: State lives in one SQLite file
The server SHALL keep events, status snapshots, the fetch cache and plugin key-values in `<data dir>/sitegarden.db`, in WAL mode.

#### Scenario: Restart
- **WHEN** the server restarts
- **THEN** the latest status of every check and all events are still there

### Requirement: Events are append-only with growing IDs
Every event SHALL get a strictly increasing integer ID and a timestamp, and stored events SHALL NOT be changed.

#### Scenario: Read after an ID
- **WHEN** a reader asks for events after ID 41
- **THEN** it gets events 42 and up, in order

### Requirement: Cache entries carry fetch time
Every cache entry SHALL store when it was fetched, so the UI can show how old data is.

#### Scenario: Cached result
- **WHEN** a plugin reads a cached value
- **THEN** it gets the value and its `fetched_at`

### Requirement: Plugin key-values are namespaced
Each plugin SHALL read and write only its own key-value namespace.

#### Scenario: Same key, two plugins
- **WHEN** plugins A and B both write key `cursor`
- **THEN** each reads back its own value
