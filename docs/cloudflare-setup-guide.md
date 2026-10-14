# Cloudflare setup guide

Replicate PM Studio in **your own Cloudflare account**. Start with a fresh D1
database and replace the account-specific values in this fork before deploying.
No custom domain is required. Setup verified on 14 October 2026.

## Services used

| Service                 | Purpose                                                     | Configuration                                          |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| Workers + Static Assets | Vite frontend, API and MCP endpoint in one deployment       | Worker `pm-studio`; assets from `dist/`                |
| D1                      | Projects, tasks, comments, preferences and full-text search | Database `pm-studio-db`; binding `DB`                  |
| R2 Standard             | Private attachment contents                                 | Bucket `pm-studio-files`; binding `FILES`              |
| Zero Trust Access       | Owner sign-in and protection of the entire Worker           | Exact-email Allow policy                               |
| Drizzle ORM / Kit       | SQLite schema, queries and versioned SQL migrations         | `server/schema.js`, `drizzle.config.js`, `migrations/` |

Drizzle is an application dependency, not a hosted service. Pages, KV, Durable
Objects and an AI inference service are not needed for this implementation.
Start with Workers Free and Zero Trust Free. R2 has a free monthly allowance but
is usage-billed; monitor storage and operations. See [current R2 pricing](https://developers.cloudflare.com/r2/pricing/).

## 1. Install and authenticate

Clone this project, install Node.js 22 or newer, then run from the project root:

```sh
npm ci
npx wrangler login
npx wrangler whoami
```

Approve Wrangler's browser login and note your **account ID**. In the Cloudflare
dashboard, enable R2 under **Storage & databases → R2 Object Storage** and complete
its activation flow. Configure a `workers.dev` subdomain if your account does not
already have one. [Wrangler authentication](https://developers.cloudflare.com/workers/wrangler/commands/general/),
[R2 activation](https://developers.cloudflare.com/r2/get-started/).

## 2. Provision storage and replace configuration

**Before provisioning**, edit `wrangler.jsonc`: replace `account_id` with your own
account ID, set `vars.ADMIN_EMAIL` to your owner email, and clear both
`vars.ACCESS_TEAM_DOMAIN` and `vars.ACCESS_AUD`. This prevents commands from
targeting the original account.

```sh
npx wrangler d1 create pm-studio-db
npx wrangler r2 bucket create pm-studio-files
```

Then copy the new D1 database UUID into `wrangler.jsonc`. Final configuration:

| Field                           | Your value                                   |
| ------------------------------- | -------------------------------------------- |
| `account_id`                    | Your Cloudflare account ID                   |
| `name`                          | Worker name, normally `pm-studio`            |
| `vars.ADMIN_EMAIL`              | The exact email allowed to own the workspace |
| `vars.ACCESS_TEAM_DOMAIN`       | Empty string initially                       |
| `vars.ACCESS_AUD`               | Empty string initially                       |
| `d1_databases[0].database_id`   | Your newly created D1 UUID                   |
| `d1_databases[0].database_name` | `pm-studio-db`                               |
| `r2_buckets[0].bucket_name`     | `pm-studio-files`                            |

Keep binding names **`DB`**, **`FILES`** and **`ASSETS`** unchanged. Keep
`migrations_dir: "migrations"`, `workers_dev: true`, `preview_urls: false` and
`assets.run_worker_first: true`. Leave R2 public access disabled. Worker bindings
provide database/bucket access; the app does not need database passwords or R2 S3
keys. If you rename D1, also update the migration scripts in `package.json`.

## 3. Apply migrations and deploy

```sh
npm run db:migrate:remote
npm run deploy
```

Wrangler prints `https://<worker-name>.<your-subdomain>.workers.dev`.
**The initial deployment returns 503 until Access is configured**, so it cannot
serve an unprotected workspace. Apply the existing migrations; do not regenerate
them just to install the app. [D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## 4. Configure owner-only Access

1. Open **Zero Trust / Cloudflare One**, select the Free plan and create a team
   domain if needed. Ensure a login method is available, such as One-time PIN or
   your existing identity provider.
2. Under **Access controls → Applications**, create a **Self-hosted and private**
   application named `PM Studio`.
3. Add a **Workers** destination: select this Worker and choose **production and
   preview URLs**. Protect this Worker only, rather than every Worker in the account.
4. Add one **Allow** policy: **Include → Emails → your exact owner email**. It must
   match `ADMIN_EMAIL`. Do not add Everyone, email-domain or Bypass rules.
5. Use a 24-hour session. Create the application, then enable **HTTP Only** under
   **Additional settings → Cookie settings** and save.
6. Copy **Application Audience (AUD) Tag** from Additional settings. Find your full
   team domain under Cloudflare One Settings.

Set these values in `wrangler.jsonc`:

```json
"ACCESS_TEAM_DOMAIN": "your-team.cloudflareaccess.com",
"ACCESS_AUD": "your-application-audience-tag"
```

Use the team hostname without `https://` or a trailing slash, then run
`npm run deploy` again. Wrangler's OAuth login may lack Access-policy permissions;
use the dashboard or a separately scoped Access API token in that case. Account
IDs, database UUIDs and AUD tags are configuration identifiers, not secret keys.
[Worker Access setup](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

## 5. Verify and start using it

- Without a signed-in session, `/`, `/api/workspace` and `/mcp` should redirect to
  your team's Access login. Check with `curl -I https://<your-worker-host>/`.
- Sign in as the allowed email. A fresh personal workspace should open; edit the
  default display name in **Settings → Profile** if needed.
- Create a project/task, reload and confirm it persists. Upload/download an
  attachment to verify R2. Uploads are limited to 25 MB each.

The Worker independently validates JWT signature, expiry, issuer, audience and
owner identity. A later custom domain uses the same database and bucket;
Worker-level Access covers its associated domains too.

## Local development and future updates

```sh
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev:cloudflare             # localhost:8787; local D1/R2 only
```

`DEV_AUTH=1` is accepted only on localhost; never deploy it as a production
variable. Keep credentials and `.dev.vars` out of Git. For schema changes, run
`npm run db:generate`, review/test the SQL locally, then apply remote migrations
and deploy. Run `npm run lint`, `npm run test` and `npm run build` before deployment.

Back up structured data through **Settings → Backups & API** and back up R2 files
separately. JSON exports contain attachment metadata, not file contents.

**Optional agent access:** `/mcp` uses Streamable HTTP. Create a dedicated Access
service token and an app-scoped Service Auth policy, then add its client ID to
`ACCESS_READ_SERVICE_IDS` or `ACCESS_WRITE_SERVICE_IDS` in Worker variables and
redeploy. Keep its secret in the agent client's secret storage. Clients must send
the Access headers; OAuth-only clients need a separate integration. No service
token is created automatically.

See [deployment details and limitations](cloudflare.md) for API routes, backups,
conflict handling and storage cleanup.
