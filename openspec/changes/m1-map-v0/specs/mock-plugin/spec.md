# Spec Delta

## ADDED Requirements

### Requirement: Mock check type
The `mock` plugin SHALL provide a `mock` check type that returns a node's `mock.initialStatus` on its first run and then plausible statuses and response times around `mock.baseMs`, including occasional slow and down results that recover by themselves.

#### Scenario: Sample opens with the designed scene
- **WHEN** the server starts with the sample config and an empty database
- **THEN** copperleaf's site is down and the other mocked nodes are ok after their first checks

### Requirement: Demo mode
With `SITEGARDEN_DEMO=1` the server SHALL load the `mock` plugin even when the config does not list it, and the web app SHALL show demo deploy and webhook flows only while the mock plugin is loaded.

#### Scenario: Real config, no demo
- **WHEN** a config without the mock plugin runs and `SITEGARDEN_DEMO` is unset
- **THEN** no fake statuses or flows appear and deploy buttons are disabled
