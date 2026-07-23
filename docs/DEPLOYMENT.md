# Deployment and database operations

## Supported topology

The included container topology is same-origin:

```text
Browser -> HTTPS endpoint -> Nginx web service -> /api and /health -> private API
                                                        API -> private PostgreSQL
```

Only the web service should receive public traffic. The default Compose file binds it to `127.0.0.1:8080` for local use and does not publish the API or PostgreSQL ports. Put a TLS-terminating load balancer or reverse proxy in front for a hosted environment, preserve the same public origin for web and API traffic, and restrict direct container-network access.

The TLS proxy is part of the trust boundary. It must discard client-supplied `X-Forwarded-For` and `X-Forwarded-Proto`, then set exactly one verified client address and the actual public scheme before forwarding to the loopback-bound web service. Nginx passes those values to Fastify, which trusts one immediate proxy hop. If the production network adds another proxy hop or supplies a chain instead of one address, update and test both the proxy headers and Fastify trust policy together; otherwise rate limiting and secure-origin detection will be incorrect.

The Vercel configuration is deliberately frontend-only. It uses `npm ci`, serves the SPA, and returns a non-cacheable JSON `503 API_NOT_DEPLOYED` for `/api` instead of routing API calls to `index.html`. It is not a full-stack CyberVett deployment. A future Vercel deployment may proxy `/api/:path*` to an explicitly selected backend, but that backend and its same-site cookie/CORS policy must be tested before the placeholder is removed.

## Required environment

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Enables production API safeguards. |
| `HOST=0.0.0.0`, `PORT=4000` | Container listener. |
| `APP_ORIGIN` | Exact public web origin; comma-separated origins are allowed only when deliberately tested. |
| `AUTH_SECRET` | High-entropy secret of at least 32 characters, stored in a secret manager. |
| `DATABASE_URL` | PostgreSQL connection URL without `ssl*` query parameters; TLS policy is configured separately below. |
| `DATABASE_SSL_MODE` | `disable` only for the private local Compose network; use `verify-full` for production. `require` encrypts without certificate verification and should be a documented exception. |
| `DATABASE_SSL_CA` | PEM CA bundle required for `verify-full`; encode line breaks as `\n` when the host requires a single-line secret. |
| `DEMO_MODE=false` | Required in production. |
| `AI_PROVIDER=disabled` | Safe production default: no model assessment is produced and the report remains queued for human review. `demo` is development/test-only. |
| `AI_MODEL`, `GEMINI_API_KEY` | Optional Gemini configuration; provider keys remain server-side. |
| `VITE_API_URL=/api/v1` | Same-origin browser API base. |

Compose additionally requires a high-entropy, URL-safe `POSTGRES_PASSWORD`; `POSTGRES_USER`, `POSTGRES_DB`, and `WEB_PORT` have local defaults. The password, database, and user are used only inside the private Compose network.

## Versioned migrations

Run migrations before starting a new API release:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run migrate
```

`npm run migrate` reads ordered SQL files from `infra/postgres`, normalizes line endings, verifies their SHA-256 checksums against the compiled manifest, obtains a PostgreSQL advisory lock, and applies all pending work in one transaction. Applied versions are recorded in `cybervett_schema_migrations`. The expected version for this release is `003_security_lifecycle`.

For a compatible database created before the ledger existed, the runner verifies the required legacy tables and columns, records `001_initial` as baselined without replaying its `create table` statements, then safely applies the remaining migrations. It refuses partial schemas, unknown/out-of-order ledger entries, and changed migration checksums.

Migration `003_security_lifecycle` also refuses to proceed while a legacy `in_progress` interview lacks a resume credential. This is intentionally non-destructive: keep the previous release available and let those candidates finish, confirm that no such sessions remain, then rerun the migration.

```sql
select id, candidate_email, started_at
from interview_sessions
where status = 'in_progress';
```

Do not silently mark those candidates declined, completed, or revoked merely to unblock a release. If one cannot finish, coordinate a replacement assessment with the candidate and document the operational decision before changing data.

Compose runs the same migration command as a one-shot `migrate` service and starts the API only after it exits successfully:

```powershell
docker compose up --build -d
docker compose ps
```

To rerun only the idempotent migration check after rebuilding the API image:

```powershell
docker compose run --rm migrate
```

Verify the ledger before switching traffic:

```sql
select version, filename, checksum, applied_at, execution_ms, baselined
from cybervett_schema_migrations
order by version;
```

Do not edit an applied SQL migration or delete a ledger row. Add a new forward migration.

## Upgrade and recovery procedure

1. Confirm the current application/database versions and stop writes or enter a maintenance window.
2. Take a provider-native snapshot or `pg_dump` backup and verify that it can be read.
3. Run the migration command with the same `DATABASE_URL`, TLS mode, and CA that the API will use.
4. Verify the final ledger version and exercise readiness plus one non-destructive authenticated read.
5. Deploy the new API and web images, then run the critical Trainer, Trainee, and invitation smoke paths.

A migration error rolls back the complete migration transaction. If an operational rollback is required after a committed migration, stop writes, preserve the failed database for investigation, restore the pre-deployment backup, and redeploy the previous images. The repository does not claim an automatic down-migration path.

## Headers, logs, and source maps

Nginx and Vercel apply a restrictive CSP, clickjacking protection, `no-referrer`, and permissions policy. Camera and geolocation remain disabled; microphone access is limited to the same origin for the optional dictation control. Production web builds do not publish source maps.

The Nginx access log is structured and omits query strings, Referer, and user-agent values. Invitation-page and invitation-API paths are replaced with fixed redacted route labels. Request-serving Nginx error logs are sent to a non-collected sink because their fixed format can include the original capability-bearing URI; collect startup diagnostics before traffic is enabled, and collect runtime health, status, and latency from the sanitized access log and platform metrics instead. Keep equivalent URL redaction at every upstream load balancer and application logger. Do not log candidate answer bodies, authorization headers, cookies, invitation capabilities, CSRF values, or provider prompts containing candidate text.

Before launch, set documented retention periods and access controls for application logs, proxy logs, invitations, answers, reports, and audit events.

## Release checklist

- Run `npm ci` and `npm run check` from a clean checkout.
- Run the migration and confirm `003_security_lifecycle` in the ledger.
- Build images from reviewed base-image digests in the deployment system; the repository tags alone are not immutable.
- Verify `/health/live` and `/health/ready` through the same-origin proxy.
- Verify `/api` never falls through to SPA HTML.
- Test allowed and denied origins, CSRF failure, cookie attributes, invitation expiry/revocation/resume, repeated completion, and concurrent answer writes.
- Confirm production source maps are absent and security headers are present on HTML and API responses.
- Test backup restore, alerting, and log redaction.
- Define retention/deletion procedures and complete security, privacy, employment-law, accessibility, and model-quality reviews for the launch market.

The fuller split between repository-complete work and external launch obligations is maintained in `docs/LAUNCH_READINESS.md`.
