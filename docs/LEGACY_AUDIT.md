# Legacy project audit

The uploaded hackathon project demonstrated strong ambition and a broad surface area, but several design choices prevented it from being production-ready.

| Legacy behavior | Risk | CyberVett 3.0 treatment |
| --- | --- | --- |
| Direct Supabase reads/writes from many pages | Authorization depended on external policies not included in the repository; domain logic was duplicated in the browser. | All domain access passes through an organization-scoped API and store interface. |
| Guest login set a fake user in React state | Protected screens could be opened without server authentication. | Signed HTTP-only Trainer or Trainee session with server-enforced role claims. Demo credentials use the real authentication route. |
| Invitation configuration encoded as reversible base64 in the URL | Anyone could edit the job context and questions. | 256-bit opaque invitation token; only its digest is stored server-side. |
| Interview and report fallback in localStorage | Sensitive candidate data could remain on shared devices and was not available to the hiring team reliably. | Answers and reports persist through the API; session storage holds only temporary candidate access state. |
| DeepFace emotion labels converted into stress/focus and gaze judgments | Unsupported biometric/affective inference in a high-impact employment context. | Removed. Candidate flow explicitly states that camera and emotion analysis are not used. |
| “Culture fit,” integrity score and future retention/promotion prediction | Vague, unvalidated and potentially discriminatory employment signals. | Removed. The rubric is job-related, evidence-linked and advisory. |
| AI calls and JSON parsing distributed across UI modules | Inconsistent instructions, error handling and provider behavior. | One server-side evaluator interface with schema validation, timeout, fallback and provider metadata. |
| Wildcard CORS and raw exception text | Cross-origin and information-exposure risk. | Origin allowlist, security headers, generic errors and request IDs. |
| No included database schema or tests | The repository could not reproduce its claimed workflow reliably. | PostgreSQL schema, seeded demo store, API/UI tests and CI verification. |

## Features intentionally not carried forward

The cyberpunk particle-heavy visual language, invasive anti-cheat scoring, facial monitoring, predictive career outcomes and client-side Piston code execution were not treated as production strengths. They can create distraction, accessibility cost, privacy risk or unsupported claims. A future code exercise should run in an isolated sandbox with explicit resource limits, language allowlists and test-case versioning.
