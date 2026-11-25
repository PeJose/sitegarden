# Spec Delta

## MODIFIED Requirements

### Requirement: One typed event stream
The server SHALL send events at `/api/events` as SSE with the event's type as the SSE `event` name, its store ID as the SSE `id`, and a JSON `data` payload. Types: `release`, `config.invalid`, `config.loaded`, `check.result`, `node.status`. `check.result` SHALL carry `ms` when the check reported a response time.

#### Scenario: New release
- **WHEN** a render publishes a new release
- **THEN** every connected browser gets a `release` event, as it does today

#### Scenario: Timed check
- **WHEN** an `http` check gets a 200 in 182 ms
- **THEN** the `check.result` event has `status: ok` and `ms: 182`
