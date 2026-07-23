import assert from 'node:assert/strict'
import test from 'node:test'
import {
  answerSchema,
  candidateStatusSchema,
  createJobSchema,
  dashboardSchema,
  evaluationResultSchema,
  followUpAnswerSchema,
  practiceTurnSchema,
  reportSchema,
  startInterviewSchema,
} from '../src/index.ts'

const validQuestions = [
  {
    id: 'architecture_1',
    competency: 'Architecture',
    prompt: 'Describe a system architecture trade-off and how you evaluated it.',
  },
  {
    id: 'reliability-2',
    competency: 'Reliability',
    prompt: 'How would you investigate and contain an intermittent service failure?',
  },
  {
    id: 'collaboration_3',
    competency: 'Collaboration',
    prompt: 'Describe how you documented and communicated a technical decision.',
  },
]

const validJob = {
  title: 'API Engineer',
  department: 'Engineering',
  location: 'Remote',
  durationMinutes: 30,
  questions: validQuestions,
}

test('createJobSchema trims bounded safe question IDs and rejects duplicates', () => {
  const parsed = createJobSchema.parse({
    ...validJob,
    questions: validQuestions.map((question, index) => ({
      ...question,
      id: index === 0 ? '  architecture_1  ' : question.id,
    })),
  })
  assert.equal(parsed.questions[0]?.id, 'architecture_1')

  const duplicate = createJobSchema.safeParse({
    ...validJob,
    questions: validQuestions.map((question, index) => ({
      ...question,
      id: index < 2 ? 'same_id' : question.id,
    })),
  })
  assert.equal(duplicate.success, false)
  if (!duplicate.success) {
    assert.deepEqual(duplicate.error.issues[0]?.path, ['questions', 1, 'id'])
  }
})

test('createJobSchema rejects empty, unsafe, and overlong question IDs', () => {
  for (const id of ['', '   ', '../question', 'question id', `q${'x'.repeat(80)}`]) {
    const result = createJobSchema.safeParse({
      ...validJob,
      questions: validQuestions.map((question, index) => index === 0 ? { ...question, id } : question),
    })
    assert.equal(result.success, false, `expected ${JSON.stringify(id)} to be rejected`)
  }
})

test('createJobSchema rejects whitespace-only prompts and competencies', () => {
  const blankPrompt = createJobSchema.safeParse({
    ...validJob,
    questions: validQuestions.map((question, index) => index === 0 ? { ...question, prompt: '          ' } : question),
  })
  const blankCompetency = createJobSchema.safeParse({
    ...validJob,
    questions: validQuestions.map((question, index) => index === 0 ? { ...question, competency: '  ' } : question),
  })
  assert.equal(blankPrompt.success, false)
  assert.equal(blankCompetency.success, false)
})

test('answer and practice schemas share the bounded safe question ID contract', () => {
  const answer = 'This is a sufficiently detailed answer for contract validation.'
  const payloads = [
    {
      schema: answerSchema,
      value: { questionId: '  safe-id_1  ', answer, locale: 'en' },
    },
    {
      schema: followUpAnswerSchema,
      value: { questionId: '  safe-id_1  ', answer },
    },
    {
      schema: practiceTurnSchema,
      value: {
        questionId: '  safe-id_1  ',
        competency: 'Reliability',
        question: 'How would you investigate an intermittent production failure?',
        answer,
        followUpPrompt: null,
        followUpAnswer: null,
      },
    },
  ] as const

  for (const { schema, value } of payloads) {
    assert.equal(schema.parse(value).questionId, 'safe-id_1')
    assert.equal(schema.safeParse({ ...value, questionId: '../unsafe' }).success, false)
    assert.equal(schema.safeParse({ ...value, questionId: `q${'x'.repeat(80)}` }).success, false)
  }
})

test('interview starts require a high-entropy-shaped client resume capability', () => {
  const valid = {
    name: 'Candidate One',
    email: 'candidate@example.com',
    consent: true,
    resumeToken: 'a'.repeat(43),
  } as const
  assert.equal(startInterviewSchema.safeParse(valid).success, true)
  assert.equal(startInterviewSchema.safeParse({ ...valid, resumeToken: 'too-short' }).success, false)
  assert.equal(startInterviewSchema.safeParse({ ...valid, resumeToken: `${'a'.repeat(42)}+` }).success, false)
})

test('assessment schemas enforce nullable fields only for unavailable results', () => {
  const common = {
    summary: 'A human reviewer must inspect the submitted answers directly.',
    dimensions: [],
    strengths: [],
    developmentAreas: [],
    answers: [],
    generatedBy: 'test',
    generatedAt: new Date(0).toISOString(),
  }

  assert.equal(evaluationResultSchema.safeParse({
    ...common,
    assessmentStatus: 'unavailable',
    overallScore: null,
    recommendation: null,
  }).success, true)

  assert.equal(evaluationResultSchema.safeParse({
    ...common,
    assessmentStatus: 'unavailable',
    overallScore: 50,
    recommendation: 'mixed_evidence',
  }).success, false)

  assert.equal(evaluationResultSchema.safeParse({
    ...common,
    assessmentStatus: 'available',
    overallScore: null,
    recommendation: null,
  }).success, false)
})

test('legacy available reports parse with an explicit available assessment status', () => {
  const parsed = reportSchema.parse({
    id: '55555555-5555-4555-8555-555555555555',
    candidate: {
      id: '44444444-4444-4444-8444-444444444444',
      reportId: '55555555-5555-4555-8555-555555555555',
      name: 'Candidate',
      email: 'candidate@example.com',
      jobId: '33333333-3333-4333-8333-333333333333',
      jobTitle: 'API Engineer',
      status: 'review',
      score: 80,
      completedAt: new Date(0).toISOString(),
    },
    overallScore: 80,
    recommendation: 'strong_evidence',
    summary: 'The submitted answers contained job-related evidence for human review.',
    dimensions: [],
    strengths: [],
    developmentAreas: [],
    answers: [],
    reviewerNote: null,
    generatedBy: 'legacy',
    generatedAt: new Date(0).toISOString(),
  })
  assert.equal(parsed.assessmentStatus, 'available')
})

test('candidate revocation and fractional median values are representable', () => {
  assert.equal(candidateStatusSchema.parse('revoked'), 'revoked')
  const dashboard = dashboardSchema.parse({
    activeJobs: 0,
    awaitingReview: 0,
    completedThisWeek: 0,
    medianScore: 82.5,
    jobs: [],
    candidates: [],
  })
  assert.equal(dashboard.medianScore, 82.5)
})
