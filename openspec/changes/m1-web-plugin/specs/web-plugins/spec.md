# Spec Delta

## ADDED Requirements

### Requirement: Build-time web plugins
The web build SHALL include the `web` entry of every plugin listed in the config's `plugins:`, compiled against the host's Preact, and SHALL fail the build when a listed plugin's manifest cannot be read.

#### Scenario: Plugin with a web part
- **WHEN** `essentials` is listed and its manifest has `web: ./web.tsx`
- **THEN** the built app contains its Checks tab without any runtime loading

### Requirement: Runtime gating
A bundled web plugin SHALL register its extensions only when the server reports that plugin as loaded, and a plugin whose registration throws SHALL leave no extensions behind while other plugins keep working.

#### Scenario: Plugin removed from the config
- **WHEN** the owner removes a plugin from `plugins:` and applies, without rebuilding
- **THEN** after a reload its tabs and layers are gone

### Requirement: Frozen v1 API
The plugin API surface listed in `docs/plugins.md` as v1 SHALL only change additively within v1.

#### Scenario: New hook
- **WHEN** a later release adds a web hook
- **THEN** `WEB_SDK_VERSION` gets a minor bump and existing plugins keep working
