# AI and hiring safety

CyberVett treats an AI-generated assessment as decision support, not an employment decision.

## Allowed evidence

- The candidate's submitted answer.
- The question and job-related competency defined before the interview.
- Concrete reasoning, examples, trade-offs, outcomes and acknowledged uncertainty in the answer.

## Prohibited inference

- Emotion, stress, gaze, facial expression, personality or honesty.
- Disability, health, age, gender, ethnicity, religion, family status or other sensitive/protected traits.
- “Culture fit” or other vague proxies that can encode bias.
- Retention, promotion, loyalty or future productivity predictions.
- Automatic rejection, automatic shortlisting or a final hiring recommendation.

The Gemini evaluator and interview conductor repeat these boundaries in their instructions and request validated structured output. If employment-assessment output is unavailable, invalid, untraceable to the submitted answer, or violates policy, CyberVett creates an explicit no-score report for direct human review; it never substitutes deterministic keyword or answer-length scoring. The conductor may use a bounded, job-related fallback question and asks at most one follow-up for each approved core question. Deterministic scoring is restricted to local demo and Trainee-practice coaching.

## Conversational interview controls

- Core competencies and questions are defined before an invited interview begins.
- Follow-ups may ask for clearer job-related examples, outcomes, reasoning, or trade-offs only.
- Candidate text is treated as untrusted evidence and cannot override system boundaries.
- Browser voice controls are optional. CyberVett does not request a camera and does not persist audio.
- Trainee scores are coaching feedback, not predictions or employment recommendations.

## Required human controls

- A reviewer sees answer evidence alongside each dimension.
- The interface labels the score as advisory and distinct from a hiring decision.
- A reviewer records the next step separately and may add context.
- Teams should provide reasonable adjustments and alternative assessment formats.
- Before launch, validate rubrics for role relevance and adverse impact, document model/provider changes, sample reports for quality, and establish an appeal/correction route.

## Model-change checklist

1. Pin the provider and model through configuration.
2. Test schema compliance, refusal behavior and evidence traceability.
3. Compare scoring distributions across a representative evaluation set.
4. Require product and legal approval for new data inputs or new inferences.
5. Record the deployed model identifier in every report.
