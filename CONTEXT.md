# Pagekit

A lightweight service publishing system. Users register static resource sources as "services" and publish them to a public URL with auto-generated QR codes.

## Language

**Service (服务)**:
A named, independently publishable static resource source. Each service has its own publish/unpublish/update lifecycle, serving location, and QR code. Services differ by source type (git or zip).
_Avoid_: Site, project, app

**Source Type (来源类型)**:
How a service obtains its static files. `git` — pull from a remote repository and branch; `zip` — extract from an uploaded archive. Chosen at creation and cannot be changed afterward.
_Avoid_: Deploy type, service mode

**Git Service (Git 服务)**:
A service whose source type is `git`. Requires a repository URL, credential, and branch. Supports webhook-triggered updates and optional scheduled updates (polling), which coexist independently.
_Avoid_: Repo service

**Zip Service (Zip 服务)**:
A service whose source type is `zip`. Static files come from an uploaded zip archive; no git credential or branch is involved. A zip may be uploaded when creating the service or at publish/update time. The archive is extracted as-is; the extracted root is the source tree (same role as a git repo root).
_Avoid_: Upload service, package service

**Stored Archive (存档包)**:
The latest uploaded zip file kept on disk for a zip service. Uploaded via a dedicated archive endpoint, separate from publish/update. Publish and update both read from this archive; update replaces it with a newly uploaded zip before extracting. Upload size is limited by server configuration (default 50MB). Path traversal entries inside the archive are rejected.
_Avoid_: Cached zip, package file

**Credential (凭证)**:
A reusable git username + password pair, referenced by git services only.
_Avoid_: Account, key, token

**Publish (发布)**:
Extract or pull the service's source files, copy the configured publish directory to the serving location, and make them publicly accessible. For git services: clone the repo. For zip services: extract the stored archive (must exist before publish). Saving configuration changes (such as publish directory) does not automatically republish; the user must trigger publish or update explicitly.
_Avoid_: Deploy, release

**Unpublish (取消发布)**:
Remove published files from the serving location so the service is no longer accessible. The service record and source artifacts (git cache or stored archive) are kept for future re-publishing.
_Avoid_: Take offline, suspend

**Update (更新)**:
Replace the serving files with a new version and atomically switch. For git services: pull latest code (triggered manually, via webhook, or via scheduled update). For zip services: optionally upload a new archive to replace the stored archive, then extract; if no new archive is provided, re-extract the existing stored archive with the current configuration.
_Avoid_: Refresh, sync

**Scheduled Update (定时更新)**:
A git-service option that periodically pulls the remote repository at a configured interval, specified in minutes (default: 1, minimum: 1). Disabled by default; configurable when creating or editing a git service. Coexists with webhook updates; both trigger the same Update flow. After pull, compares the commit hash with the last deployed version — if unchanged, skips copy and atomic switch silently (no log entry). Runs only while the service is published; pauses on unpublish and resumes on re-publish. Concurrent update attempts on the same service are skipped while an update is already in progress. A single global scheduler tick (every 30 seconds) checks all eligible services against their configured intervals. Logs success only when a new version is deployed; logs errors on pull failure.
_Avoid_: Auto deploy, cron job, polling

**Publish Directory (发布目录)**:
A subdirectory path within the source tree (repo root or extracted zip root) whose contents become the served files. Defaults to the root when empty.
_Avoid_: Output directory, build folder

**Serving Location (发布位置)**:
The filesystem path where published files are placed for the external web server to serve: `<publishDir>/<service-name>/` (Docker default: `/data/sites/<service-name>/`; local dev default: `./data/sites/<service-name>/`).
_Avoid_: Output path, site root
