# Atomic file switching for service updates

When updating a published service, new files are prepared in a temporary directory first, then atomically renamed into the serving location. Users never see a partially-updated site.

## Considered Options

- **Direct overwrite** — Pull new code directly into the serving directory
- **Atomic switch** — Prepare in temp dir, then `rename` into place

## Decision

Atomic switch via temporary directory and filesystem `rename`.

## Flow

1. `git clone` / `git pull` into `/data/sites/.tmp/<service-name>/`
2. Copy publish directory contents into the temp location
3. `rename` old serving dir → `/data/sites/.old/<service-name>/`
4. `rename` temp dir → `/data/sites/<service-name>/`
5. Remove old directory

## Rationale

- `rename` on the same filesystem is atomic — no visitor sees a half-written site
- If any step fails, the old version remains in place (natural rollback)
- Minimal complexity: just careful directory management, no symlinks or versioning system needed
