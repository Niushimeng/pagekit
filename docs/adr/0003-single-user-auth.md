# Single-user authentication

The system has exactly one admin account, configured via a config file with a plain username and password. There is no registration, no multi-user support, and no role-based access control.

## Considered Options

- **Single user** — One admin account in config file
- **Multi-user, no roles** — Registration and login, all users share the same service list
- **Multi-user with roles** — Each user owns their own services

## Decision

Single user.

## Rationale

- Pagekit is an internal operations tool, not a collaborative platform
- A single person or small team typically manages deployments
- Simplest possible auth: no session stores, no user tables, no permission checks
- Config-file credentials are appropriate for a tool run behind a VPN or internal network
