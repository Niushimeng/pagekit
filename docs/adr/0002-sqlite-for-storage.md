# SQLite as the sole data store

All persistent data (services, credentials, operation logs) lives in a single SQLite file.

## Considered Options

- **JSON file** — Read/write a single `data.json`
- **SQLite** — Embedded relational database, single file
- **MySQL/PostgreSQL** — External database server

## Decision

SQLite via a single file stored in the application's data directory.

## Rationale

- Zero configuration: no database server to install, configure, or maintain
- Relational integrity: credentials are referenced by services; logs reference services — foreign keys keep data consistent
- Concurrent access: SQLite handles multiple simultaneous reads and writes safely
- Sufficient scale: a publishing system will have dozens to low hundreds of records, well within SQLite's comfort zone
- Migration path: switching to an ORM-backed MySQL/PostgreSQL later is straightforward if scale demands it
