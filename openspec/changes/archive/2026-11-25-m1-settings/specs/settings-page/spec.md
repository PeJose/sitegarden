# Spec Delta

## ADDED Requirements

### Requirement: Settings page
The app SHALL serve a settings page at `/settings` showing app, plugin API, web SDK and renderer versions, the config revision with time and source, demo mode, and every plugin with its version and either "loaded" or "failed to load", and SHALL NOT send a plugin's failure reason to the browser.

#### Scenario: Failed plugin
- **WHEN** a plugin fails to load
- **THEN** the page shows "failed to load" for it and the reason appears only in the server log

### Requirement: Generated API tokens
A signed-in user or the env API token SHALL be able to generate, list and revoke named API tokens; the token value SHALL be returned only once and stored only as a hash; a generated token SHALL authenticate API requests until revoked and SHALL NOT be able to manage tokens.

#### Scenario: Generate and revoke
- **WHEN** the owner generates a token "ci" and a script calls `/api/status` with `Authorization: Bearer <token>`
- **THEN** the call succeeds, and after the owner revokes "ci" the same call returns 401

#### Scenario: Token cannot mint tokens
- **WHEN** a request authenticated with a generated token calls `POST /api/tokens`
- **THEN** it gets 403

### Requirement: Debug controls off the map
The map SHALL NOT show debug controls; the demo controls SHALL live in the settings page's Dev tools section.

#### Scenario: Map view
- **WHEN** the owner opens `/`
- **THEN** there is no `mock` debug tab on the map
