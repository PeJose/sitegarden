# Spec Delta

## ADDED Requirements

### Requirement: E2E suite pins the stable flows
A Playwright suite SHALL run against the production build served by the server and cover: the map loads, a node shows a server status, Check now runs a check, and login with fail-closed API access.

#### Scenario: Pull request
- **WHEN** a pull request is opened or updated
- **THEN** CI runs the e2e suite and a Docker build, and a failure blocks the checks
