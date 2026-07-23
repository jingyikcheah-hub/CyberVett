# CyberVett 3.0

CyberVett is a multilingual, conversational interview platform with two focused experiences:

- **Trainer mode** gives HR and hiring teams a plain-language workspace to create roles, invite candidates, review answer evidence, and record a human decision.
- **Trainee mode** gives candidates a private practice workspace with realistic questions, one job-related follow-up per answer, optional voice input/read-aloud, and structured coaching feedback.

Invited candidates do not need an account. English is the default language; Bahasa Melayu and Simplified Chinese are included.

## Product boundaries

CyberVett analyzes submitted interview text against job-related competencies. It does not score facial expressions, emotion, stress, gaze, personality, honesty, “culture fit,” retention, or promotion potential. AI feedback is advisory; a person owns every hiring decision.

The live interview is a responsive, turn-by-turn conversation. Voice controls use supported browser speech features and the application stores only submitted text—not camera or audio recordings.

## Quick start on Windows PowerShell

Requirements: Node.js 24 and npm 10 or newer.

From the folder containing this README and the top-level `package.json`:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run dev
```

Open `http://localhost:5173`. The development web server proxies `/api` to the API on port `4000`, avoiding local CORS and cookie problems.

You can create a real Trainer or Trainee account from **Create account**. In the default no-database mode, new accounts work normally for the current server session but reset when the API restarts.

Optional demo Trainer account:

```text
Email: maya@northstarlabs.test
Password: Demo123!
```

The landing page also includes an invited-candidate interview preview.

## Persistent accounts with PostgreSQL

For persistent sign-up and sign-in, run PostgreSQL rather than the in-memory development store.

1. Copy `.env.example` to `.env`.
2. Replace `AUTH_SECRET` and `POSTGRES_PASSWORD`. Use a URL-safe random database password because Compose also places it in an internal connection URL.
3. Run the complete stack:

```powershell
docker compose up --build -d
```

Open `http://localhost:8080` and create either account type through the registration page. The web service is bound to loopback; the API and PostgreSQL are reachable only on the private Compose network.

Compose runs the checksum-verified migration service before starting the API. It handles both fresh databases and compatible existing CyberVett databases, including named volumes created by an older release. Back up an existing database before upgrading; do not apply or edit individual SQL files by hand. See `docs/DEPLOYMENT.md` for the manual migration and recovery procedure.

## AI modes

No subscription is needed for local use:

```env
AI_PROVIDER=demo
```

Demo AI is for deterministic local development and tests only. Production Compose defaults to `AI_PROVIDER=disabled`, which records an honest unavailable assessment state for human review rather than manufacturing a score. To use Gemini from the server:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-server-only-key
AI_MODEL=gemini-2.5-flash
```

Employment-assessment provider failures produce an explicit unavailable report with no score or recommendation, preserving the submitted answers for direct human review. Deterministic scoring is limited to local demo and Trainee-practice coaching. API keys are never sent to the browser.

## Common commands

```powershell
npm.cmd run dev        # Start API and web app with live reload
npm.cmd run typecheck  # Build shared contracts, then run strict checks
npm.cmd run test       # API and interface tests
npm.cmd run build      # Production builds
npm.cmd run check      # Complete verification gate
npm.cmd run migrate    # Build the API and apply pending PostgreSQL migrations
```

To diagnose the API independently:

```powershell
npm.cmd run dev --workspace @cybervett/api
Invoke-RestMethod "http://localhost:4000/health/live"
```

Expected response: `status: ok`.

## Architecture

```text
apps/api/              Fastify API, authentication, authorization, stores and AI adapters
apps/web/              React Trainer, Trainee and invited-candidate experiences
packages/contracts/    Shared Zod validation and TypeScript contracts
infra/postgres/        Initial schema and versioned migration
docs/                  Architecture, AI safety, deployment and legacy audit
```

Security controls include HTTP-only session cookies, CSRF protection, password hashing, organization-scoped data access, opaque invitation tokens, candidate-scoped access tokens, rate limits, security headers, audit events, request-size limits, and validated AI output.

## Honest production status

The Docker path is a same-origin deployment foundation: Nginx serves the web app and proxies `/api` to the private API service. `vercel.json` intentionally deploys only the frontend and returns an explicit JSON 503 for `/api`; it is not a full-stack deployment.

A public employment product still requires managed PostgreSQL, tested backups and restores, transactional email, password reset/email verification, MFA or SSO where appropriate, monitoring and alerting, retention/deletion automation, accessibility testing with users, independent penetration testing, and legal review for each operating jurisdiction.
