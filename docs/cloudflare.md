# Personal Cloudflare deployment

PM Studio uses a Vite frontend, a Cloudflare Worker API, D1 and private R2 storage.
The owner is `dave@creativerandom.com`. The provisioned URL is
`https://pm-studio.dave-1b0.workers.dev`.

## Local development

Requires Node 22 or newer. Install with `npm ci`, then:

```sh
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev:cloudflare
```

Open `http://localhost:8787`. D1 and R2 are emulated in `.wrangler/`; local test
records do not reach production. For frontend hot reload, run `npm run dev` in
another terminal while Wrangler is running. Vite proxies API requests to port 8787.

The `DEV_AUTH` shortcut only works on localhost URLs. Production validates the
Access JWT signature, expiry, issuer and application audience and requires the
owner email. Both frontend assets and API requests fail closed when Access is
unconfigured. `.dev.vars` and local runtime state are ignored by Git.

## Data and migrations

`server/schema.js` is the Drizzle SQLite schema. Each UI collection has its own
table with indexed project references and queryable title/body columns. JSON
payloads preserve the existing UI's fields, including subtasks and view settings.
These are application-managed references, not SQL foreign keys. API writes validate
project/task references and protect the owner's identity.

```sh
npm run db:generate
npm run db:migrate:local
npm run db:migrate:remote
npm run deploy
```

Review generated SQL and export the database before destructive schema changes.
Wrangler tracks migrations; do not also run a second migration runner against the
same database. FTS5 and its triggers are maintained in a custom SQL migration.

The browser sends changed records rather than uploading the entire workspace.
Writes use a global revision and a unique commit token in one atomic D1 batch.
Stale writes cannot modify records. The browser rebases edits to unaffected records,
and preserves conflicting drafts locally with export and reload controls. Batches
are limited to 30 changed records to stay below the Free plan's query limit.
Large imports/deletions span multiple batches and are not globally atomic.

The UI loads a workspace snapshot and refreshes on focus or every 30 seconds while
visible. This intentionally favors a small personal workspace over multiuser scale.

## Access and agent connections

The Access application must protect all traffic for this Worker and allow only the
owner email. Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.jsonc` from the
application's authentication settings, then redeploy. Preview URLs are disabled.
Worker-level Access also covers a later custom domain; the Worker still verifies
every request independently.

Configured on 14 October 2026: application `PM Studio`
(`1e68b247-8ad0-4f99-94e4-a45e26bbb5b5`), Worker destination `pm-studio` covering
production and preview URLs, and the `PM Studio owner` Allow policy restricted to
the exact email `dave@creativerandom.com`. The application session lasts 24 hours
and its authorization cookie is HTTP-only. Unauthenticated requests to the frontend,
workspace API and MCP endpoint were verified to redirect to the team's Access login.
The authenticated production workspace was verified to load successfully for the
owner. The request filter permits Access's cross-site top-level GET redirect while
continuing to reject cross-site API requests.

The Streamable HTTP MCP endpoint is `/mcp`. Available tools list/read projects and
tasks, search project descriptions/tasks/comments, obtain the workspace revision,
and create/update tasks. Write tools require a current revision.

Unattended clients need a dedicated Cloudflare Access service token, a Service Auth
policy scoped to this app, and its client ID in `ACCESS_READ_SERVICE_IDS` or
`ACCESS_WRITE_SERVICE_IDS`. These lists are empty by default. Read-only service
identities cannot call write API routes and do not receive MCP write tools. The
Worker verifies the signed `common_name` claim against the configured list.
Keep the service-token secret in the client's secret storage, never Git or frontend
configuration. Clients must support the Access headers; OAuth-only MCP clients
require a separate OAuth integration.

HTTP endpoints (all require Access):

| Endpoint                                                      | Behavior                                             |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| `GET /api/workspace`                                          | Snapshot and revision                                |
| `GET /api/projects`, `/api/tasks`, `/api/comments`            | Up to 500 records; tasks can filter by `?project=ID` |
| `GET /api/projects/ID/context`                                | Project, tasks and matching comments                 |
| `GET /api/tasks/ID`                                           | One task                                             |
| `POST /api/projects`, `/api/tasks`, `/api/comments`           | Create; JSON includes `version`                      |
| `PATCH /api/projects/ID`, `/api/tasks/ID`, `/api/comments/ID` | Update allowed fields; JSON includes `version`       |
| `GET /api/search?q=TEXT`                                      | Full-text search, up to 50 results                   |
| `GET /api/export`                                             | JSON backup of structured data                       |

## Attachments and backups

R2 is private. Uploads are streamed through the authenticated Worker and limited to
25 MB per file. Downloads use attachment disposition and are served only after
authentication. Task-description HTML is sanitized and the app sets a Content
Security Policy.

Settings → Backups & API exports structured data and attachment metadata. It does
not export attachment contents: download those separately or back up the R2 bucket.
Imports are supported only in an empty workspace and do not upload attachment bytes.
Browser storage from a different hostname cannot be imported automatically; export
that original browser's `gr8r.v2` value as JSON if needed.

Removing attachment metadata retains the R2 object so immediate undo can restore it.
Unreferenced uploads and removed objects currently require manual cleanup; monitor
bucket size. D1 Free provides seven days of Time Travel, but independent exports
are still needed for longer recovery. A domain change does not change D1/R2 data.

## Verification

```sh
npm run lint
npm run format:check
npm run test
npm run build
# With the disposable local Worker running:
npm run test:integration
```

Integration tests create local test projects and attachments. They check actual D1
writes, stale and concurrent writes, R2 round trips, FTS, export, origin checks and
an MCP SDK client. They are fixed to localhost and never target production.

This personal deployment does not send invitations, email/push notifications, or
provide billing plans. Cloudflare Access manages sign-in. No agent service token is
provisioned automatically.
