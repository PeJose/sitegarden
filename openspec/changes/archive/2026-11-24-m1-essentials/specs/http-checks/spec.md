# Spec Delta

## Purpose

Checks that a site answers with the expected status and content on a schedule, so "200 but broken" and real outages show up as a node status instead of being noticed by a visitor.

## ADDED Requirements

### Requirement: Checks are configured per node
A node's `checks:` list SHALL accept entries whose `type` a loaded plugin registered, each validated against that plugin's schema with errors on their line. Each entry SHALL run on its own `every`.

#### Scenario: Unknown check type
- **WHEN** a node has `checks: [{ type: ping }]` and no plugin registered `ping`
- **THEN** plan fails naming the line and the known check types

### Requirement: HTTP check passes on expected status and text
The `http` check SHALL request its `url` (default: the node's `url`) through the plugin HTTP client and SHALL report `ok` when the final status matches `expect_status` (default: any 2xx) and, if set, the body contains `expect_text`. The result detail SHALL include the status and the response time.

#### Scenario: 200 but broken
- **WHEN** the site answers 200 and the body lacks `expect_text: "Fernhill"`
- **THEN** the check fails with the detail `text "Fernhill" not found (200, 182 ms)`

#### Scenario: Healthy site
- **WHEN** the site answers 200 with the expected text
- **THEN** the check reports `ok` with `200 in <n> ms`

### Requirement: Failures become down after alert_after
A failing `http` check SHALL report `degraded` until it has failed `alert_after` times in a row (default 1), then `down`. Timeouts, connection errors, blocked addresses, an unexpected status and missing text all count as failures. One success SHALL report `ok` and reset the count.

#### Scenario: One blip
- **WHEN** `alert_after: 2` and one run times out
- **THEN** the status is `degraded`; if the next run passes it is `ok`

### Requirement: Internal targets need an explicit opt-in
An `http` check SHALL reach private or loopback addresses only with `allow_private: true`; without it the check fails with the blocked-address reason.

#### Scenario: Router admin page
- **WHEN** a check targets `http://192.168.1.1/` without `allow_private`
- **THEN** it fails with `blocked address 192.168.1.1`
