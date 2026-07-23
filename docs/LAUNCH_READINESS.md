# Launch readiness

CyberVett is a hardened deployment foundation, not a completed public-employment launch. This checklist keeps verified repository work separate from infrastructure, operational, legal, and organizational obligations.

## Implemented and verified in this repository

- Deterministic Node.js 24 workspace build order and root `npm run check` gate.
- Strict shared contracts, including bounded unique interview-question identifiers.
- Organization-scoped authorization, current-user revalidation, HTTP-only session cookies, CSRF checks, and explicit CORS methods.
- Single-use, expiring, revocable invitations with client-generated, idempotent, expiring resume capabilities.
- Transactional PostgreSQL answer revisions, completion claims, report creation, human decisions, and audit writes.
- Checksum-verified, ordered, forward-only migration runner with advisory locking and schema readiness checks.
- Fail-closed employment assessment: provider failure or unsafe/untraceable output produces no score or recommendation.
- Same-origin Docker/Nginx topology, private API/database services, URL/log redaction, security headers, and no production source maps.
- Explicit frontend-only Vercel behavior: `/api` returns JSON `503` instead of SPA HTML.
- Accurate loading, empty, unauthorized, unavailable, and retry states across critical UI flows.
- Keyboard-aware mobile navigation, visible focus, reduced-motion support, responsive layouts, and EN/MS/zh-CN critical-flow copy.
- Focused MemoryStore, API, contracts, UI, migration, evaluator, and optional real-PostgreSQL regression tests.

## Required in each deployment environment

- [ ] Use a managed PostgreSQL service with `DATABASE_SSL_MODE=verify-full` and the provider CA.
- [ ] Store `AUTH_SECRET`, database credentials, and optional provider keys in an audited secret manager.
- [ ] Back up the database and prove a restore before applying a release migration.
- [ ] Confirm no legacy `in_progress` interviews block migration `003_security_lifecycle`.
- [ ] Run migrations before starting the new API and verify the expected ledger version.
- [ ] Terminate TLS at the public same-origin boundary and restrict direct API/database network access.
- [ ] Verify live/readiness health checks, security headers, cookie attributes, allowed origins, CSRF failures, and `/api` JSON behavior.
- [ ] Configure centralized redacted logs, metrics, uptime checks, actionable alerts, and an incident runbook.
- [ ] Define and automate retention, deletion, export, correction, and legal-hold procedures for candidate data and logs.
- [ ] Test concurrent writes, invitation expiry/revocation/resume, provider timeout, and backup recovery against the actual production stack.

## External product and organizational blockers

- [ ] Transactional invitation delivery, verified sender domains, bounce handling, and delivery monitoring.
- [ ] Email verification, password reset, account recovery, and administrator lifecycle controls.
- [ ] MFA or SSO appropriate to the target customer segment.
- [ ] Independent penetration test and remediation review of the final infrastructure.
- [ ] Accessibility audit with assistive technology and representative users at 200% and 400% zoom.
- [ ] Employment, privacy, data-processing, and cross-border-transfer legal review for every launch jurisdiction.
- [ ] Validated role rubrics, representative model-quality testing, adverse-impact monitoring, and model-change governance.
- [ ] Candidate notice, consent, correction/appeal, reasonable-adjustment, and alternative-assessment procedures.
- [ ] Named owners and service levels for security incidents, data requests, model incidents, and candidate support.

Do not describe the Vercel frontend-only deployment as a working full-stack product. Public Trainer, Trainee, and invited-candidate workflows require the same-origin API and PostgreSQL deployment described in `docs/DEPLOYMENT.md`.
