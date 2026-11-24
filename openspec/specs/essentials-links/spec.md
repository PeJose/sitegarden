# essentials-links Specification

## Purpose
Turns one short config field into the standard set of links for a repo, a CMS project or a site, so the owner writes `repo: acme/fernhill` instead of five URLs.

## Requirements

### Requirement: Shorthand fields expand into links
A shorthand field registered by a plugin SHALL be accepted on its node type and SHALL add that plugin's generated links to the node when the config loads. Generated links SHALL come before the node's explicit `links:`; an explicit link with the same label SHALL replace the generated one.

#### Scenario: GitHub repo
- **WHEN** a `repo` node has `repo: acme/fernhill`
- **THEN** the node has the links Actions, Settings, Secrets, Pull requests and Issues pointing to `https://github.com/acme/fernhill/...`

#### Scenario: Override one link
- **WHEN** the same node also has an explicit link labelled `Issues` with another URL
- **THEN** the node has one `Issues` link, the explicit one

### Requirement: Essentials shorthands
`essentials` SHALL provide `repo: <owner>/<name>` on `repo` nodes (Actions, Settings, Secrets, Pull requests, Issues), `sanity: <projectId>` on `cms` nodes (Sanity manage, API, Webhooks) with optional `studio: <name>` (Studio at `https://<name>.sanity.studio`), and `url: <https URL>` on `site` nodes (a link labelled with the URL's host). Invalid values (`repo` without exactly one `/`, a `url` that is not http or https) SHALL be config errors with their line.

#### Scenario: Bad repo value
- **WHEN** a node has `repo: fernhill`
- **THEN** plan fails with an error on that line saying the value must be `owner/name`
