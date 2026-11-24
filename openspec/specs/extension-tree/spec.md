# extension-tree Specification

## Purpose
Lets every visual piece of the web app (map layers, side-panel tabs) be an extension with an ID that can be replaced, wrapped, disabled or configured without touching the core.

## Requirements

### Requirement: Extensions attach to root slots
The web app SHALL render map layers from the `map` slot's `layers` input, ordered by `order`, and side-panel tabs from the `sidepanel` slot's `tabs` input. Extension IDs SHALL have the form `kind:plugin:name`.

#### Scenario: Default garden map
- **WHEN** no extension config is set
- **THEN** the map and side panel look and behave exactly as before this change

### Requirement: Replace by ID, last one wins
Registering an extension with an ID that already exists SHALL replace it, in plugin load order, and every replacement SHALL be recorded as "who replaced what".

#### Scenario: Two plugins register the same layer
- **WHEN** a second registration of `layer:garden:labels` arrives
- **THEN** the second one renders and the override log names both

### Requirement: Disable and configure from YAML
An entry under `extensions:` with `disabled: true` SHALL remove that extension; an entry with `config:` SHALL pass that config to it.

#### Scenario: Hide the labels layer
- **WHEN** the config has `extensions: { layer:garden:labels: { disabled: true } }`
- **THEN** the map renders without labels and everything else is unchanged

### Requirement: Wrap an extension
An extension SHALL be overridable with a render function that receives the original, so a plugin can decorate it without copying it.

#### Scenario: Frame a tab
- **WHEN** an override wraps `tab:essentials:links`
- **THEN** the tab renders inside the wrapper with its original content
