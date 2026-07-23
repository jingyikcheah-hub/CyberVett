# Deployment guide

## Supported public deployment: Vercel UI preview

CyberVett's public Vercel deployment is intentionally frontend-only. It is a product demonstration, not a hosted interview service.

The root `vercel.json` builds only:

- `@cybervett/contracts`
- `@cybervett/web`

During the Vercel build, `VITE_PREVIEW_MODE=true` activates browser-only sample data. The preview does not require or expose:

- `AUTH_SECRET`
- `DATABASE_URL`
- `GEMINI_API_KEY`
- a Fastify API deployment
- a PostgreSQL deployment

The preview includes a permanent notice linking visitors to the repository and ZIP download.

### Vercel project settings

Use the repository root as the project root. Keep framework detection on **Other** or allow Vercel to use `vercel.json`.

Expected settings:

```text
Install Command: npm install
Build Command: defined by vercel.json
Output Directory: apps/web/dist
```

Do not add real backend secrets to this frontend-only Vercel project.

### Preview limitations

- Authentication is simulated in the browser.
- Dashboard and report data are samples.
- Created jobs and decisions are temporary.
- Candidate interview and practice flows do not upload information.
- Refreshing or clearing site storage may reset the preview.
- Real users must download the repository and run the complete application locally.

## Local complete application

For the supported complete setup, follow `README.md` and choose either:

1. npm development mode with the in-memory store; or
2. Docker Compose with the Fastify API and PostgreSQL.

Every local user must create their own `.env` file and provide their own credentials where required.

## Optional future production hosting

A real public service would require separate production infrastructure for the API and PostgreSQL database. Before such a release:

- Run `npm ci` and `npm run check` in CI.
- Set `NODE_ENV=production` and `DEMO_MODE=false`.
- Store `AUTH_SECRET`, `DATABASE_URL`, and provider keys in a backend secret manager.
- Configure HTTPS, cookie, CORS, and CSRF policies deliberately.
- Enable encrypted PostgreSQL connections, backups, restore tests, retention policies, and deletion workflows.
- Add security, privacy, employment-law, accessibility, abuse, and AI evaluation reviews.
- Keep final hiring decisions under human control.

This repository does not claim that the frontend-only Vercel preview satisfies those production requirements.
