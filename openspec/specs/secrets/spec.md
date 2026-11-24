# secrets Specification

## Purpose
Keeps secret values out of the config, the browser and the logs: the config names secrets, the server reads their values from its environment, and only outbound requests of permitted plugins ever carry them.

## Requirements

### Requirement: Secrets are declared by name
The config SHALL declare secrets under `secrets:` by name, with an optional `expires` date. Config fields SHALL reference them only as `${secret:NAME}`. A reference to an undeclared name SHALL be a config error with its line.

#### Scenario: Undeclared reference
- **WHEN** a node field contains `${secret:GITHUB_READ}` and `secrets:` has no `GITHUB_READ`
- **THEN** plan and apply fail with an error naming the line and `GITHUB_READ`

### Requirement: Values come from the environment or a file
The server SHALL read a secret's value from the env var `NAME`, or else from the file whose path is in `NAME_FILE`, with surrounding whitespace trimmed. A declared secret with no value SHALL NOT stop the server; plan output and the server log SHALL warn about it, and a request that needs it SHALL fail with "secret NAME is not set".

#### Scenario: Docker secret file
- **WHEN** `GITHUB_READ_FILE=/run/secrets/github_read` and that file holds the token plus a newline
- **THEN** requests using `${secret:GITHUB_READ}` send the token without the newline

#### Scenario: Missing value
- **WHEN** `SANITY_READ` is declared but neither `SANITY_READ` nor `SANITY_READ_FILE` is set
- **THEN** `sg plan` shows a warning for `SANITY_READ` and the server starts

### Requirement: Only permitted plugins can use a secret
A secret reference SHALL be substituted only in the URL and headers of an outbound request made through the core HTTP client, at send time, and only when the calling plugin lists the name in its manifest `permissions.secrets`. Plugins SHALL NOT be able to read secret values.

#### Scenario: Plugin without permission
- **WHEN** a plugin that does not list `GITHUB_READ` sends a header with `${secret:GITHUB_READ}`
- **THEN** the request is refused before anything is sent, naming the plugin and the secret

### Requirement: Secret values never leave the server in clear
Secret values SHALL be replaced with `[secret:NAME]` in logs, stored events, check details and error messages, and SHALL never be sent to the browser or returned by any API.

#### Scenario: Error echoes the token
- **WHEN** a remote API's error message contains the token that was sent
- **THEN** the stored check detail and the log show `[secret:GITHUB_READ]` instead
