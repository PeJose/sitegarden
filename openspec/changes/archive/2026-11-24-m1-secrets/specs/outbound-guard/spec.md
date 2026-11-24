# Spec Delta

## Purpose

Gives plugins one HTTP client that only reaches the hosts they declared and never reaches internal addresses unless a check explicitly opts in, so a config, a plugin or a DNS change cannot turn the server into a proxy into the private network.

## ADDED Requirements

### Requirement: Plugins declare the hosts they call
The plugin HTTP client SHALL refuse a request to a host not matched by the plugin's manifest `permissions.network` (exact host, `*.domain` suffix, or `*` for any host).

#### Scenario: Undeclared host
- **WHEN** a plugin allowed only `api.github.com` requests `https://example.org`
- **THEN** the request is refused before any connection, naming the plugin and the host

### Requirement: Internal addresses are blocked
The client SHALL resolve the host, check every resolved address, and connect only to a checked address, keeping the original host name for TLS and the Host header. It SHALL refuse loopback, `0.0.0.0/8`, RFC 1918, `169.254.0.0/16`, `100.64.0.0/10`, `fe80::/10`, `fc00::/7`, multicast, IPv4-mapped forms of these, `fd00:ec2::254` and `metadata.google.internal`. IP-literal URLs SHALL be checked the same way.

#### Scenario: Name resolves to a private address
- **WHEN** a check targets `https://intranet.example` and it resolves to `10.0.0.5`
- **THEN** the request fails with "blocked address 10.0.0.5" and no connection is made

#### Scenario: Literal metadata address
- **WHEN** a check targets `http://169.254.169.254/latest/meta-data`
- **THEN** the request is refused

#### Scenario: Opt-in for an internal service
- **WHEN** the request is made with `allowPrivate: true` and the host resolves to `192.168.1.20`
- **THEN** the request is sent

### Requirement: Redirects are re-checked
The client SHALL NOT follow redirects automatically. It SHALL follow at most 5, applying the host allowlist and address checks to each hop, and SHALL drop secret-bearing headers when a redirect changes the host.

#### Scenario: Redirect to an internal address
- **WHEN** a public URL redirects to `http://127.0.0.1:8787/`
- **THEN** the request fails at that hop

### Requirement: Requests are bounded
Every request SHALL have a timeout (default 10 s) and a response body cap (default 5 MB); exceeding either SHALL fail the request with a clear message.

#### Scenario: Endless body
- **WHEN** a target streams more than 5 MB
- **THEN** the request fails with "response larger than 5 MB" and the connection is closed
