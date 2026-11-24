# Spec Delta

## MODIFIED Requirements

### Requirement: A bad edit keeps the last good config
An invalid config SHALL never replace the running one: a plan, an apply or a GUI edit with an invalid config SHALL be rejected with its errors, and the server SHALL keep serving the latest valid revision. Rejections SHALL be reported in the log and as a `config.invalid` event.

#### Scenario: Typo while the server runs
- **WHEN** the owner applies a config with an unknown node type
- **THEN** the apply is rejected with the error on its line, the map keeps showing the previous revision, and a `config.invalid` event carries the error
