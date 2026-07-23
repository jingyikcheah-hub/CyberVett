# Security policy

Please do not report security vulnerabilities in public issues. Send a private report to the project owner with the affected route, reproduction steps, impact, and any suggested mitigation.

## Security boundaries

- Trainer and Trainee sessions use signed, HTTP-only, SameSite cookies.
- State-changing signed-in requests require a CSRF token bound to the signed session.
- Passwords are validated at registration and stored only as bcrypt hashes.
- Trainer and Trainee route permissions are enforced by the API, not only by interface navigation.
- Candidate invitations use 256-bit random tokens; only SHA-256 digests are stored.
- Candidate access tokens are scoped to one interview session and expire after three hours.
- Organization ownership is checked in every Trainer data query.
- Rate limits, security headers, request-size limits, strict validation, and generic production errors are enabled at the API boundary.
- AI provider keys remain server-side and are never included in the web bundle.

Before a public launch, arrange independent penetration testing, configure centralized secrets, logs and alerts, set a retention/deletion policy, review the target jurisdictions, and complete a threat model for the final infrastructure.
