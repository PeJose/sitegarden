# app-auth Specification

## Purpose
TBD - created by archiving change m1-deploy-auth. Update Purpose after archive.

## Requirements

### Requirement: Fail closed
With `auth.enabled: true`, every route except the login page, logout, `/api/health` and static assets SHALL require an authenticated user; an unauthenticated API request SHALL get 401 and a page request SHALL be sent to the login page or get a 401 page.

#### Scenario: Missing Tailscale header
- **WHEN** auth is in `tailscale` mode and a request arrives without `Tailscale-User-Login`
- **THEN** it gets 401 and no data

### Requirement: Tailscale identity
In `tailscale` mode the server SHALL accept the `Tailscale-User-Login` header only for logins listed in `auth.users`, and SHALL reject other logins with 403.

#### Scenario: Unknown tailnet user
- **WHEN** a tailnet user not in `auth.users` opens the map
- **THEN** they get 403

### Requirement: Password sessions
In `password` mode the server SHALL check the password against the scrypt hash in `SITEGARDEN_PASSWORD_HASH`, start a 30-day sliding session in an HttpOnly, SameSite=Strict, Secure cookie, store only a hash of the session token, and limit failed logins to 5 per 15 minutes per client.

#### Scenario: Guessing
- **WHEN** a client sends a sixth wrong password within 15 minutes
- **THEN** it gets 429 and the password is not checked

### Requirement: API token
A request with `Authorization: Bearer <token>` equal to `SITEGARDEN_API_TOKEN` SHALL be authenticated in either mode; a wrong token SHALL get 401 without trying other methods.

#### Scenario: CLI against a locked server
- **WHEN** `sg apply` runs with `SITEGARDEN_TOKEN` set to the server's API token
- **THEN** the apply succeeds as with auth off
