# plugin-host Specification

## Purpose
Loads the plugins listed in the config, checks they fit this core, lets them register node types, schema fragments and checks, and keeps one broken plugin from taking the server down.

## Requirements

### Requirement: Plugins load from the config list
The host SHALL load each entry of `plugins:` as a local folder (path relative to the config file) or an installed package name, read its manifest from the `sitegarden` key of its `package.json`, and validate it. Load order SHALL follow the list, after ordering by `dependsOn`.

#### Scenario: Local plugin folder
- **WHEN** `plugins:` lists `./plugins/essentials`
- **THEN** the host loads it and its node types are available to the config

#### Scenario: Missing dependency
- **WHEN** a plugin declares `dependsOn: { essentials: "^1" }` and essentials is not listed
- **THEN** that plugin is refused with a message naming the missing dependency, and the others load

### Requirement: API version is checked
The host SHALL refuse a plugin whose `apiVersion` range does not include the core SDK version, with a message naming both versions.

#### Scenario: Plugin for a newer API
- **WHEN** a plugin declares `apiVersion: "^2"` and the core is 1.x
- **THEN** the plugin is refused and the server keeps running with the rest

### Requirement: Registrations can be undone
Every registration a plugin makes SHALL return a disposer, and unloading a plugin SHALL dispose all of them, leaving no node types, schema fragments or checks of that plugin behind.

#### Scenario: Config drops a plugin
- **WHEN** the owner removes a plugin from `plugins:` while the server runs
- **THEN** its registrations are gone after reload and nothing else is affected

### Requirement: A failing plugin is isolated
A plugin that throws while loading or registering SHALL be marked failed with its error, and SHALL NOT stop other plugins or the server from starting.

#### Scenario: Plugin throws on register
- **WHEN** one plugin's `register` throws
- **THEN** the server starts, the failure is logged with the plugin id, and the other plugins work

### Requirement: Declarative contributions are listed before code runs
For tier A contributions (themes, building packs, shorthands), the host SHALL read them from the manifest without running plugin code.

#### Scenario: Theme-only plugin
- **WHEN** a plugin has `contributes.themes` and no `server` entry
- **THEN** its themes are listed and no module of that plugin is imported
