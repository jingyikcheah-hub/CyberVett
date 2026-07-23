import type { CandidateSummary, CreateJobInput, Dashboard, Job, Question, RegistrationInput, Report, User } from '@cybervett/contracts'

const TRAINER_USER_ID = '22222222-2222-4222-8222-222222222222'
const TRAINEE_USER_ID = '77777777-7777-4777-8777-777777777777'
const JOB_ID = '33333333-3333-4333-8333-333333333333'
const SESSION_ID = '44444444-4444-4444-8444-444444444444'
const REPORT_ID = '55555555-5555-4555-8555-555555555555'
const PREVIEW_USER_KEY = 'cybervett_preview_user'

export class PreviewApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

const questions: Question[] = [
  {
    id: 'q1',
    competency: 'Problem solving',
    prompt: 'Tell us about a difficult frontend problem you solved. What options did you consider, and why did you choose your final approach?',
    guidance: 'Use a real example and explain your trade-offs.',
  },
  {
    id: 'q2',
    competency: 'Web fundamentals',
    prompt: 'A page feels slow after loading a large list. How would you identify the bottleneck and improve the experience?',
  },
  {
    id: 'q3',
    competency: 'Collaboration',
    prompt: 'Describe a disagreement about a technical decision. How did you help the team reach a decision?',
  },
]

const createdAt = new Date(Date.now() - 86_400_000 * 5).toISOString()
const completedAt = new Date(Date.now() - 86_400_000).toISOString()

let jobs: Job[] = [
  {
    id: JOB_ID,
    title: 'Frontend Engineer',
    department: 'Product Engineering',
    location: 'Hybrid · Kuala Lumpur',
    status: 'active',
    durationMinutes: 30,
    questions,
    createdAt,
    candidateCount: 3,
  },
]

let candidates: CandidateSummary[] = [
  {
    id: SESSION_ID,
    reportId: REPORT_ID,
    name: 'Aisha Rahman',
    email: 'aisha@example.com',
    jobId: JOB_ID,
    jobTitle: 'Frontend Engineer',
    status: 'review',
    score: 82,
    completedAt,
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    reportId: null,
    name: 'Invited candidate',
    email: 'pending-candidate@example.com',
    jobId: JOB_ID,
    jobTitle: 'Frontend Engineer',
    status: 'invited',
    score: null,
    completedAt: null,
  },
]

let report: Report = {
  id: REPORT_ID,
  candidate: candidates[0]!,
  overallScore: 82,
  recommendation: 'strong_evidence',
  summary: 'Aisha gave specific examples, explained trade-offs, and consistently described how she validates technical decisions with evidence.',
  dimensions: [
    { name: 'Problem solving', score: 84, evidence: ['Explained the alternatives considered before choosing route-level code splitting.'] },
    { name: 'Web fundamentals', score: 82, evidence: ['Separated network, rendering, and data-fetching bottlenecks in the investigation plan.'] },
    { name: 'Collaboration', score: 80, evidence: ['Used decision criteria and a time-boxed spike to resolve disagreement.'] },
  ],
  strengths: ['Evidence-led debugging', 'Clear trade-off reasoning', 'Constructive collaboration'],
  developmentAreas: ['Could explain accessibility verification in more detail.'],
  answers: [
    {
      question: questions[0]!.prompt,
      competency: 'Problem solving',
      answer: 'I reduced a dashboard bundle by profiling it first, splitting large routes, and measuring real-user performance before and after the change. I chose route-level splitting because it improved the first visit without making the code hard to maintain.',
    },
    {
      question: questions[1]!.prompt,
      competency: 'Web fundamentals',
      answer: 'I would reproduce the issue, inspect network and performance traces, then separate rendering cost from data-fetching cost. For rendering, I would consider pagination or virtualization and confirm the result with before-and-after measurements.',
    },
    {
      question: questions[2]!.prompt,
      competency: 'Collaboration',
      answer: 'I wrote down the decision criteria, asked each engineer to explain their main concern, and proposed a small time-boxed spike. The team used the evidence from that spike and recorded the decision so we could revisit it later.',
    },
  ],
  reviewerNote: null,
  generatedBy: 'CyberVett preview evaluator (sample data)',
  generatedAt: completedAt,
}

function trainerUser(name = 'Maya Lee', email = 'maya@northstarlabs.test'): User {
  return {
    id: TRAINER_USER_ID,
    name,
    email,
    role: 'admin',
    mode: 'trainer',
    organizationName: 'Northstar Labs',
  }
}

function traineeUser(name = 'Preview Candidate', email = 'candidate@example.com'): User {
  return {
    id: TRAINEE_USER_ID,
    name,
    email,
    role: 'trainee',
    mode: 'trainee',
    organizationName: `${name}'s practice workspace`,
  }
}

function readStoredUser(): User | null {
  try {
    const value = localStorage.getItem(PREVIEW_USER_KEY)
    return value ? JSON.parse(value) as User : null
  } catch {
    return null
  }
}

function storeUser(user: User | null): void {
  if (user) localStorage.setItem(PREVIEW_USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(PREVIEW_USER_KEY)
}

function bodyAs<T>(options: RequestInit): T {
  if (typeof options.body !== 'string') return {} as T
  try {
    return JSON.parse(options.body) as T
  } catch {
    return {} as T
  }
}

function dashboard(): Dashboard {
  const scored = candidates.flatMap((candidate) => candidate.score === null ? [] : [candidate.score]).sort((a, b) => a - b)
  return {
    activeJobs: jobs.filter((job) => job.status === 'active').length,
    awaitingReview: candidates.filter((candidate) => candidate.status === 'review').length,
    completedThisWeek: candidates.filter((candidate) => candidate.completedAt !== null).length,
    medianScore: scored.length ? scored[Math.floor(scored.length / 2)]! : null,
    jobs,
    candidates,
  }
}

function ensureUser(): User {
  const user = readStoredUser()
  if (!user) throw new PreviewApiError('Open the preview sign-in page to enter the sample workspace.', 'PREVIEW_SIGN_IN_REQUIRED', 401)
  return user
}

export async function previewApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  await Promise.resolve()
  const method = (options.method ?? 'GET').toUpperCase()

  if (path === '/auth/session' && method === 'GET') {
    const user = ensureUser()
    return { user, csrfToken: 'preview-csrf-token' } as T
  }

  if (path === '/auth/login' && method === 'POST') {
    const input = bodyAs<{ email?: string }>(options)
    const user = trainerUser('Maya Lee', input.email || 'maya@northstarlabs.test')
    storeUser(user)
    return { user, csrfToken: 'preview-csrf-token' } as T
  }

  if (path === '/auth/register' && method === 'POST') {
    const input = bodyAs<RegistrationInput>(options)
    const user = input.mode === 'trainee'
      ? traineeUser(input.name || 'Preview Candidate', input.email || 'candidate@example.com')
      : trainerUser(input.name || 'Preview Recruiter', input.email || 'recruiter@example.com')
    storeUser(user)
    return { user, csrfToken: 'preview-csrf-token' } as T
  }

  if (path === '/auth/logout' && method === 'POST') {
    storeUser(null)
    return undefined as T
  }

  if (path === '/dashboard' && method === 'GET') {
    const user = ensureUser()
    if (user.mode !== 'trainer') throw new PreviewApiError('The trainer dashboard is unavailable in Trainee mode.', 'FORBIDDEN', 403)
    return dashboard() as T
  }

  if (path === '/jobs' && method === 'GET') {
    ensureUser()
    return jobs as T
  }

  if (path === '/jobs' && method === 'POST') {
    ensureUser()
    const input = bodyAs<CreateJobInput>(options)
    const job: Job = {
      ...input,
      id: crypto.randomUUID(),
      status: 'active',
      createdAt: new Date().toISOString(),
      candidateCount: 0,
    }
    jobs = [job, ...jobs]
    return job as T
  }

  const invitationJobMatch = path.match(/^\/jobs\/([^/]+)\/invitations$/)
  if (invitationJobMatch && method === 'POST') {
    ensureUser()
    const jobId = invitationJobMatch[1]!
    jobs = jobs.map((job) => job.id === jobId ? { ...job, candidateCount: job.candidateCount + 1 } : job)
    return { inviteUrl: `${window.location.origin}/invite/demo-invite` } as T
  }

  const reportMatch = path.match(/^\/reports\/([^/]+)$/)
  if (reportMatch && method === 'GET') {
    ensureUser()
    if (reportMatch[1] !== REPORT_ID) throw new PreviewApiError('Preview report not found.', 'NOT_FOUND', 404)
    return report as T
  }

  const decisionMatch = path.match(/^\/reports\/([^/]+)\/decision$/)
  if (decisionMatch && method === 'PATCH') {
    ensureUser()
    if (decisionMatch[1] !== REPORT_ID) throw new PreviewApiError('Preview report not found.', 'NOT_FOUND', 404)
    const input = bodyAs<{ decision: CandidateSummary['status']; note?: string }>(options)
    const updatedCandidate = { ...report.candidate, status: input.decision }
    candidates = candidates.map((candidate) => candidate.id === updatedCandidate.id ? updatedCandidate : candidate)
    report = { ...report, candidate: updatedCandidate, reviewerNote: input.note ?? null }
    return report as T
  }

  const invitationMatch = path.match(/^\/public\/invitations\/([^/]+)$/)
  if (invitationMatch && method === 'GET') {
    if (invitationMatch[1] !== 'demo-invite') throw new PreviewApiError('This preview invitation is unavailable.', 'NOT_FOUND', 404)
    return {
      organizationName: 'Northstar Labs',
      job: {
        title: 'Frontend Engineer',
        department: 'Product Engineering',
        location: 'Hybrid · Kuala Lumpur',
        durationMinutes: 30,
        questionCount: questions.length,
      },
      status: 'invited',
      privacy: {
        cameraRequired: false,
        emotionAnalysis: false,
        notice: 'This is a browser-only sample. Answers are not uploaded or retained by a backend.',
      },
    } as T
  }

  const invitationStartMatch = path.match(/^\/public\/invitations\/([^/]+)\/start$/)
  if (invitationStartMatch && method === 'POST') {
    if (invitationStartMatch[1] !== 'demo-invite') throw new PreviewApiError('This preview invitation is unavailable.', 'NOT_FOUND', 404)
    return {
      sessionId: '88888888-8888-4888-8888-888888888888',
      accessToken: 'preview-candidate-token',
      questions,
      answers: [],
    } as T
  }

  const answerMatch = path.match(/^\/public\/interviews\/([^/]+)\/answers$/)
  if (answerMatch && method === 'PUT') {
    const input = bodyAs<{ questionId?: string }>(options)
    const question = questions.find((item) => item.id === input.questionId)
    return {
      saved: true,
      followUpPrompt: `What evidence or measurement helped you confirm your approach to ${question?.competency.toLowerCase() ?? 'this problem'}?`,
      answeredCount: 1,
      totalCount: questions.length,
    } as T
  }

  if (/^\/public\/interviews\/[^/]+\/follow-up$/.test(path) && method === 'PUT') {
    return { saved: true, answeredCount: 1, totalCount: questions.length } as T
  }

  if (/^\/public\/interviews\/[^/]+\/complete$/.test(path) && method === 'POST') {
    return { completed: true, message: 'Your preview interview was completed in this browser only.' } as T
  }

  if (path === '/practice/follow-up' && method === 'POST') {
    ensureUser()
    const input = bodyAs<{ competency?: string }>(options)
    return { followUpPrompt: `Can you give one concrete result that demonstrates your ${input.competency?.toLowerCase() ?? 'approach'}?` } as T
  }

  if (path === '/practice/evaluate' && method === 'POST') {
    ensureUser()
    return {
      overallScore: 81,
      summary: 'Your sample responses were structured, relevant, and supported by concrete actions. Add more measurable outcomes to make the evidence stronger.',
      strengths: ['Clear problem framing', 'Logical sequence of actions', 'Good reflection on trade-offs'],
      developmentAreas: ['Quantify outcomes more consistently', 'Explain verification steps in greater detail'],
      dimensions: [
        { name: 'Problem solving', score: 84, evidence: ['Explained a structured way to investigate and decide.'] },
        { name: 'Communication', score: 80, evidence: ['Responses were easy to follow and job-related.'] },
        { name: 'Evidence', score: 78, evidence: ['Included actions, but some results could be more measurable.'] },
      ],
    } as T
  }

  throw new PreviewApiError('This operation is not available in the UI preview. Download the repository and run it locally for the complete application.', 'PREVIEW_ONLY', 501)
}
