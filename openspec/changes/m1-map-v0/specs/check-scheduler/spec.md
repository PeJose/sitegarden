# Spec Delta

## MODIFIED Requirements

### Requirement: Checks run on their interval with jitter
Each check SHALL run every `every` (e.g. `5m`), with each run offset by a random jitter of up to 10 % of the interval. The first run SHALL be spread over the first interval after start, except for a check with no stored result, whose first run SHALL be spread over the first 5 seconds (or its interval, if shorter).

#### Scenario: Many checks at startup
- **WHEN** the server starts with 20 checks every 5 minutes that all have stored results
- **THEN** they do not all run in the same second

#### Scenario: Fresh install
- **WHEN** the server starts with an empty database and checks every minute
- **THEN** every node has a status within 5 seconds instead of staying unknown for up to a minute
