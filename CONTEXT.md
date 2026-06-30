# Pagekit

A lightweight service publishing system. Users register git repositories and branches as "services," then publish their static files to a public URL with auto-generated QR codes and Gogs webhooks for continuous delivery.

## Language

**Service (服务)**:
A binding of one git repository + one branch. Each service has independent publish/unpublish/update operations.
_Avoid_: Site, project, app

**Credential (凭证)**:
A reusable git username + password pair, referenced by one or more services.
_Avoid_: Account, key, token

**Publish (发布)**:
Pull code from the service's git repo and branch, copy the configured publish directory to the serving location, and make it publicly accessible.
_Avoid_: Deploy, release

**Unpublish (取消发布)**:
Remove published files so the service is no longer accessible, while keeping the service record for future re-publishing.
_Avoid_: Take offline, suspend

**Update (更新)**:
Pull the latest code and atomically switch the serving files to the new version. Can be triggered manually or via webhook.
_Avoid_: Refresh, sync

**Publish Directory (发布目录)**:
A subdirectory path within the repo (e.g. `dist/`, `build/`) whose contents become the served files. Defaults to the repo root when empty.
_Avoid_: Output directory, build folder

**Serving Location (发布位置)**:
The filesystem path where published files are placed for the external web server to serve: `/data/sites/<service-name>/`.
_Avoid_: Output path, site root
