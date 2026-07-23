# CyberVett 3.0

> **UI preview + local application:** The Vercel deployment is a browser-only product preview. It uses sample data and does not connect to a live backend, database, real authentication service, or Gemini API. Download the repository and run it locally to use the complete project.

- **Repository:** https://github.com/jingyikcheah-hub/CyberVett
- **Download ZIP:** https://github.com/jingyikcheah-hub/CyberVett/archive/refs/heads/main.zip

CyberVett is a multilingual, conversational interview platform with two focused experiences:

- **Trainer mode** gives HR and hiring teams a plain-language workspace to create roles, invite candidates, review answer evidence, and record a human decision.
- **Trainee mode** gives candidates a private practice workspace with realistic questions, one job-related follow-up per answer, optional voice input/read-aloud, and structured coaching feedback.

Invited candidates do not need an account. English is the default language; Bahasa Melayu and Simplified Chinese are included.

## Public Vercel preview

The public Vercel link exists only to demonstrate the user interface and navigation.

- Preview sign-in and registration use browser-only sample sessions.
- Dashboard, jobs, candidate reports, invitations, and practice feedback use mock data.
- Preview changes are temporary and are not saved to a server.
- Visitors should not enter real candidate, employer, password, or confidential information.
- The preview does not use any repository owner's API key, database, or private credential.

For the complete frontend + backend + database workflow, use one of the local setup options below.

## Important security notice

Every user must create their own local environment file and use their own credentials.

- Never commit your `.env` file to GitHub.
- Never share your Gemini API key, database password, or authentication secret.
- Do not use secrets copied from another person.
- Only `GEMINI_API_KEY` is an external AI API key. `AUTH_SECRET` is a private application secret, while `DATABASE_URL` is a PostgreSQL connection string.

## Requirements

Install the following before starting:

- Node.js **24.x**
- npm **10 or newer**
- Git
- Docker Desktop, only for the recommended persistent-database setup

## Clone the repository

```bash
git clone https://github.com/jingyikcheah-hub/CyberVett.git
cd CyberVett
```

Alternatively, download the ZIP from the link at the top of this README, extract it, and open a terminal in the extracted `CyberVett` folder.

## Option 1 — Quick local demo

This is the fastest way to test the project. It uses an in-memory database and the built-in deterministic AI evaluator.

No Gemini API key, PostgreSQL installation, or paid service is required.

### Windows PowerShell

```powershell
npm.cmd install
npm.cmd run check
npm.cmd run dev
```

### macOS or Linux

```bash
npm install
npm run check
npm run dev
```

Open:

```text
http://localhost:5173
```

The frontend runs on port `5173`, and the backend runs on port `4000`.

### Demo-mode limitation

The default configuration uses:

```env
DEMO_MODE=true
AI_PROVIDER=demo
```

Accounts, jobs, interviews, and reports are stored only in memory. They will be deleted when the backend is restarted.

Optional demo Trainer account:

```text
Email: maya@northstarlabs.test
Password: Demo123!
```

Users can also create a temporary Trainer or Trainee account through **Create account**.

## Option 2 — Recommended full local setup

This setup runs the frontend, backend, and a persistent PostgreSQL database locally with Docker Compose.

### 1. Create your environment file

#### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

#### macOS or Linux

```bash
cp .env.example .env
```

### 2. Replace the local secrets

Open `.env` and review these values:

```env
NODE_ENV=development
PORT=4000
HOST=127.0.0.1
APP_ORIGIN=http://localhost:5173

AUTH_SECRET=replace-with-at-least-32-random-characters
DATABASE_URL=postgres://cybervett:cybervett@localhost:5432/cybervett
DEMO_MODE=true

AI_PROVIDER=demo
GEMINI_API_KEY=
AI_MODEL=gemini-2.5-flash

VITE_API_URL=/api/v1
VITE_PREVIEW_MODE=false
```

Generate a strong `AUTH_SECRET`.

#### Windows PowerShell

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

#### macOS or Linux

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy the generated value into:

```env
AUTH_SECRET=YOUR_GENERATED_SECRET
```

For Docker Compose, leave the following values unchanged unless you understand the network configuration:

```env
DATABASE_URL=postgres://cybervett:cybervett@localhost:5432/cybervett
VITE_API_URL=/api/v1
VITE_PREVIEW_MODE=false
```

Docker Compose supplies its own internal PostgreSQL connection to the backend.

### 3. Choose the AI mode

#### Free offline/demo AI

No external API key is required:

```env
AI_PROVIDER=demo
GEMINI_API_KEY=
```

This mode supports the complete application workflow using deterministic interview questions and evaluation.

#### Gemini AI

Use your own Gemini API key:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=YOUR_OWN_GEMINI_API_KEY
AI_MODEL=gemini-2.5-flash
```

Do not add the key to frontend code. The key must remain in the root `.env` file and is used only by the backend.

If Gemini is unavailable, CyberVett falls back to its deterministic evaluator.

### 4. Start the complete local application

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:8080
```

Docker starts:

- React frontend
- Fastify backend
- PostgreSQL 17 database
- Database migrations

In this mode, accounts, jobs, interviews, reports, and audit events remain available after the application restarts.

## Stop the application

### npm development mode

Press:

```text
Ctrl + C
```

### Docker mode

```bash
docker compose down
```

To delete the local PostgreSQL data as well:

```bash
docker compose down -v
```

**Warning:** The `-v` command permanently deletes the local CyberVett database volume.

## Restart the Docker application

```bash
docker compose up -d
```

## View Docker logs

```bash
docker compose logs -f
```

Backend logs only:

```bash
docker compose logs -f api
```

## Verify the backend

For npm development mode:

```text
http://localhost:4000/health/live
```

For Docker mode:

```text
http://localhost:4000/health/ready
```

Expected status:

```json
{"status":"ok"}
```

or:

```json
{"status":"ready"}
```

## Common commands

```bash
npm run dev        # Start the API and frontend with live reload
npm run typecheck  # Run strict TypeScript checks
npm run test       # Run API and frontend tests
npm run build      # Build all workspaces
npm run check      # Typecheck, test, and build the complete project
```

Windows PowerShell users may use `npm.cmd` instead of `npm` when PowerShell execution policy blocks `npm.ps1`:

```powershell
npm.cmd run dev
```

## Troubleshooting

### `npm.ps1 cannot be loaded`

Use:

```powershell
npm.cmd install
npm.cmd run dev
```

### Port already in use

Check whether ports `5173`, `4000`, `5432`, or `8080` are already being used. Stop the conflicting application and restart CyberVett.

### Gemini key error

When using Gemini, confirm:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=YOUR_VALID_KEY
```

To run without Gemini, switch back to:

```env
AI_PROVIDER=demo
GEMINI_API_KEY=
```

### Data disappears after restart

You are running the in-memory development mode. Use Docker Compose and open `http://localhost:8080` for persistent PostgreSQL storage.

### Docker database needs a fresh reset

```bash
docker compose down -v
docker compose up --build -d
```

This deletes all existing local CyberVett data and creates a fresh database.

## Product boundaries

CyberVett analyzes submitted interview text against job-related competencies. It does not score facial expressions, emotion, stress, gaze, personality, honesty, culture fit, retention, or promotion potential. AI feedback is advisory; a person owns every hiring decision.

Voice controls use supported browser speech features. The application stores submitted text, not camera or audio recordings.

## Project structure

```text
apps/api/              Fastify API, authentication, authorization, stores and AI adapters
apps/web/              React Trainer, Trainee and invited-candidate experiences
packages/contracts/    Shared Zod validation and TypeScript contracts
infra/postgres/        PostgreSQL schema and versioned migrations
docs/                  Architecture, AI safety, deployment and legacy audit
```

## Current project status

CyberVett provides complete core local workflows for account registration, login, job creation, invitations, interviews, reports, and human-controlled decisions.

The Vercel deployment is intentionally limited to a safe UI preview. The complete application is distributed for local use. Each user is responsible for their own environment, credentials, API usage, database, backups, and local security.

## License and responsible use

Use CyberVett only for lawful, job-related interviewing and training. Do not use it to infer protected characteristics, emotions, health, honesty, personality, or other sensitive traits. Human reviewers must remain responsible for hiring decisions.
