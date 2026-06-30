# Separate file serving from the application

The system writes published files to a fixed directory (`/data/sites/<service-name>/`) but does **not** serve HTTP itself. An external web server (Nginx, Caddy, etc.) is responsible for serving the files to end users.

## Considered Options

- **Built-in HTTP server** — Node.js serves the static files directly
- **Generate web server configs** — System outputs Nginx/Caddy config snippets and reloads the server
- **File output only** — System writes files; external web server handles HTTP

## Decision

File output only. Pagekit manages the file lifecycle (publish, update, unpublish, delete) but has zero involvement in HTTP routing or request handling.

## Rationale

- Separation of concerns: the publishing tool and the web server have independent failure modes
- Flexibility: users can choose any web server
- Simplicity: no need to manage HTTP server processes, TLS, or config reloads
- The Docker volume mapping (`-v /data/sites:/data/sites`) cleanly bridges the container boundary
