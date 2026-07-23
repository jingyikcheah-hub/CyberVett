# Deployment checklist

## Build and release

- Run `npm ci` and `npm run check` in CI.
- Build immutable API and web images from the included Dockerfiles.
- Apply the database migration before switching traffic.
- Set `NODE_ENV=production` and `DEMO_MODE=false`; the API refuses unsafe production defaults.
- Store `AUTH_SECRET`, `DATABASE_URL` and provider keys in the host's secret manager.
- Use a same-site HTTPS domain or update cookie/CORS/CSRF policy deliberately for split domains.

## Data and reliability

- Enable encrypted PostgreSQL connections, point-in-time recovery and tested restore procedures.
- Define retention periods for invitations, answers, reports, audit events and logs.
- Implement user-access, correction and deletion workflows.
- Add request, error, latency and provider-cost dashboards without logging candidate answer bodies.
- Configure alerts for readiness failure, login abuse, elevated 5xx rates and provider timeouts.

## Product acceptance

- A new user can register, sign out, and sign back in with persistent PostgreSQL data.
- Trainer can create a role, copy an invitation, review evidence and record a decision.
- Trainee can choose a practice role, complete conversational questions and receive coaching feedback.
- An invited candidate can understand the assessment, consent, resume safely, answer job-related follow-ups and see confirmation.
- English, Bahasa Melayu and Simplified Chinese are checked on mobile and desktop.
- Keyboard navigation, focus order, labels, contrast, reduced motion and 200% zoom are manually verified.
- Security, privacy, employment-law and accessibility reviews are completed for the launch market.
- AI evaluation is tested against a fixed representative set and never makes the final decision.
