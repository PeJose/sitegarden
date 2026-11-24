# live-events Specification

## Purpose
Pushes typed server events to every open browser over one SSE stream, and lets a browser that reconnects catch up on what it missed.

## Requirements

### Requirement: One typed event stream
The server SHALL send events at `/api/events` as SSE with the event's type as the SSE `event` name, its store ID as the SSE `id`, and a JSON `data` payload. Types in this change: `release`, `config.invalid`, `config.loaded`, `check.result`, `node.status`.

#### Scenario: New release
- **WHEN** a render publishes a new release
- **THEN** every connected browser gets a `release` event, as it does today

### Requirement: Catch-up after reconnect
A client that connects with `Last-Event-ID` SHALL first receive every stored event after that ID, in order, then live events, with no gaps or duplicates.

#### Scenario: Laptop wakes from sleep
- **WHEN** a browser reconnects with `Last-Event-ID: 120` while events 121 to 125 exist
- **THEN** it receives 121 to 125, then new events

### Requirement: Idle streams stay open
The server SHALL send a keep-alive at least every 30 s on an idle stream.

#### Scenario: Quiet night
- **WHEN** no event happens for 10 minutes
- **THEN** the stream is still open and a proxy has not closed it
