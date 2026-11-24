# garden-config Specification

## Purpose
Defines the `sitegarden.yaml` file, the graph of groups, nodes and edges it describes, how invalid configs are reported, and the JSON Schema editors use to autocomplete it.

## Requirements

### Requirement: Config describes a graph
The config SHALL describe groups, nodes and edges in flat top-level lists (`groups`, `nodes`, `edges`), plus `plugins`, `extensions` and `world.seed`. Every node SHALL have an `id`, a `type` and a `group`; every edge SHALL have `from`, `to` and `type`.

#### Scenario: Sample config loads
- **WHEN** the server starts with the repo's sample `sitegarden.yaml`
- **THEN** the graph has the same groups, nodes and edges the old `estates:` file had, and the rendered map is unchanged

### Requirement: Invalid configs are rejected with locations
The loader SHALL reject a config with a duplicate ID, an edge or node that references a missing node or group, a node type no loaded plugin registered, or a field that fails the merged schema. Each error SHALL name the file, the line and the offending path.

#### Scenario: Edge to a missing node
- **WHEN** an edge has `to: nowhere` and no node has that id
- **THEN** loading fails with an error naming the edge's line and `nowhere`

#### Scenario: Unknown node type
- **WHEN** a node has `type: spaceship` and no plugin registered that type
- **THEN** loading fails with an error naming the node and the known types

### Requirement: A bad edit keeps the last good config
An invalid config SHALL never replace the running one: a plan, an apply or a GUI edit with an invalid config SHALL be rejected with its errors, and the server SHALL keep serving the latest valid revision. Rejections SHALL be reported in the log and as a `config.invalid` event.

#### Scenario: Typo while the server runs
- **WHEN** the owner applies a config with an unknown node type
- **THEN** the apply is rejected with the error on its line, the map keeps showing the previous revision, and a `config.invalid` event carries the error

### Requirement: Merged JSON Schema
The server SHALL build one JSON Schema from the core schema and every loaded plugin's schema fragments. It SHALL serve it at `/schema.json`, and `pnpm sg schema` SHALL write it next to the config file.

#### Scenario: Editor autocomplete for a plugin field
- **WHEN** a loaded plugin adds an optional field to node type `site`
- **THEN** the schema lists that field, with its description, under nodes of type `site`
