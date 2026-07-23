# CyberVett contributor guide

## Repository map

- `apps/web`: React 19/Vite client and production Nginx configuration.
- `apps/api`: Fastify API, authentication, interview services, and memory/PostgreSQL stores.
- `packages/contracts`: shared strict TypeScript and Zod contracts. Build this workspace before consumers.
- `infra/postgres`: immutable, ordered PostgreSQL migrations.
- `docs`: architecture, AI-safety, deployment, and launch-readiness guidance.

## Supported toolchain and checks

- Use Node.js 24 and `npm ci` at the repository root.
- Run `npm run check` before handing off a code change.
- Run real-store checks with `TEST_DATABASE_URL=... npm run test:postgres`.
- Apply pending migrations with `npm run migrate`; use `npm run migrate:dev --workspace @cybervett/api` only for local source execution.
- Do not depend on generated `dist` or `*.tsbuildinfo` files being present.

## Safety and design invariants

- Candidate answers and AI-provider output are untrusted.
- Assess only predeclared, job-related competencies from submitted text evidence.
- AI is advisory: never infer sensitive traits, predict employment outcomes, or make hiring decisions.
- Provider failure must produce an explicit no-score human-review state.
- Keep reviewer decisions separate from AI assessment and audit important transitions.
- Do not persist access tokens or candidate answers in browser storage.
- Preserve the single-use invitation, rotating-resume, expiry, and revocation lifecycle.
- Add forward-only migrations; never rewrite a migration that may have been applied.
- Production web/API auth assumes a same-origin reverse proxy. A frontend-only Vercel deployment is not full stack.

## Definition of done

- Update contracts, API/store implementations, UI, tests, migrations, and docs together when behavior crosses those boundaries.
- Cover expected negative paths and retry/concurrency behavior at the lowest useful layer.
- Keep EN, Bahasa Melayu, and Simplified Chinese critical-flow copy aligned.
- Inspect responsive UI states and keyboard/focus behavior for user-facing changes.
- Never commit secrets, candidate content, generated output, or local environment files.
