import { z } from 'zod'

export const roleSchema = z.enum(['admin', 'recruiter', 'reviewer', 'trainee'])
export type Role = z.infer<typeof roleSchema>

export const accountModeSchema = z.enum(['trainer', 'trainee'])
export type AccountMode = z.infer<typeof accountModeSchema>

export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: roleSchema,
  mode: accountModeSchema,
  organizationName: z.string(),
})
export type User = z.infer<typeof userSchema>

export const questionSchema = z.object({
  id: z.string(),
  prompt: z.string().min(10).max(1200),
  competency: z.string().min(2).max(80),
  guidance: z.string().max(400).optional(),
})
export type Question = z.infer<typeof questionSchema>

export const jobStatusSchema = z.enum(['draft', 'active', 'closed'])
export const jobSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  department: z.string(),
  location: z.string(),
  status: jobStatusSchema,
  durationMinutes: z.number().int().min(10).max(120),
  questions: z.array(questionSchema),
  createdAt: z.string(),
  candidateCount: z.number().int().nonnegative(),
})
export type Job = z.infer<typeof jobSchema>

export const candidateStatusSchema = z.enum([
  'invited',
  'in_progress',
  'completed',
  'review',
  'shortlisted',
  'declined',
])

export const candidateSummarySchema = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid().nullable(),
  name: z.string(),
  email: z.string().email(),
  jobId: z.string().uuid(),
  jobTitle: z.string(),
  status: candidateStatusSchema,
  score: z.number().int().min(0).max(100).nullable(),
  completedAt: z.string().nullable(),
})
export type CandidateSummary = z.infer<typeof candidateSummarySchema>

export const dashboardSchema = z.object({
  activeJobs: z.number().int().nonnegative(),
  awaitingReview: z.number().int().nonnegative(),
  completedThisWeek: z.number().int().nonnegative(),
  medianScore: z.number().int().min(0).max(100).nullable(),
  jobs: z.array(jobSchema),
  candidates: z.array(candidateSummarySchema),
})
export type Dashboard = z.infer<typeof dashboardSchema>

export const createJobSchema = z.object({
  title: z.string().trim().min(2).max(120),
  department: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(120),
  durationMinutes: z.number().int().min(10).max(120),
  questions: z.array(questionSchema).min(3).max(12),
})
export type CreateJobInput = z.infer<typeof createJobSchema>

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
})

export const registrationSchema = z.object({
  mode: accountModeSchema,
  name: z.string().trim().min(2).max(120),
  organizationName: z.string().trim().max(160).default(''),
  email: z.string().trim().toLowerCase().email(),
  password: z.string()
    .min(12, 'Use at least 12 characters.')
    .max(200)
    .regex(/[a-z]/, 'Include a lowercase letter.')
    .regex(/[A-Z]/, 'Include an uppercase letter.')
    .regex(/[0-9]/, 'Include a number.'),
  acceptTerms: z.literal(true),
}).superRefine((input, context) => {
  if (input.mode === 'trainer' && input.organizationName.length < 2) {
    context.addIssue({ code: 'custom', path: ['organizationName'], message: 'Enter your organization name.' })
  }
})
export type RegistrationInput = z.infer<typeof registrationSchema>

export const startInterviewSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  consent: z.literal(true),
})

export const answerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().trim().min(20).max(10000),
  locale: z.enum(['en', 'ms', 'zh-CN']).default('en'),
})

export const followUpAnswerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().trim().min(20).max(10000),
})

export const completeInterviewSchema = z.object({
  locale: z.enum(['en', 'ms', 'zh-CN']).default('en'),
})

export const practiceTurnSchema = z.object({
  questionId: z.string().min(1).max(80),
  competency: z.string().trim().min(2).max(80),
  question: z.string().trim().min(10).max(1200),
  answer: z.string().trim().min(20).max(10000),
  followUpPrompt: z.string().trim().min(10).max(1200).nullable().default(null),
  followUpAnswer: z.string().trim().min(20).max(10000).nullable().default(null),
})

export const practiceFollowUpSchema = practiceTurnSchema.pick({
  competency: true,
  question: true,
  answer: true,
}).extend({
  roleTitle: z.string().trim().min(2).max(120),
  locale: z.enum(['en', 'ms', 'zh-CN']).default('en'),
})

export const practiceEvaluationSchema = z.object({
  roleTitle: z.string().trim().min(2).max(120),
  turns: z.array(practiceTurnSchema).min(3).max(8),
  locale: z.enum(['en', 'ms', 'zh-CN']).default('en'),
})

export const decisionSchema = z.object({
  decision: z.enum(['review', 'shortlisted', 'declined']),
  note: z.string().trim().max(2000).optional(),
})

export const dimensionScoreSchema = z.object({
  name: z.string(),
  score: z.number().int().min(0).max(100),
  evidence: z.array(z.string()),
})

export const reportSchema = z.object({
  id: z.string().uuid(),
  candidate: candidateSummarySchema,
  overallScore: z.number().int().min(0).max(100),
  recommendation: z.enum(['strong_evidence', 'mixed_evidence', 'limited_evidence']),
  summary: z.string(),
  dimensions: z.array(dimensionScoreSchema),
  strengths: z.array(z.string()),
  developmentAreas: z.array(z.string()),
  answers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    competency: z.string(),
  })),
  reviewerNote: z.string().nullable(),
  generatedBy: z.string(),
  generatedAt: z.string(),
})
export type Report = z.infer<typeof reportSchema>

export type ApiError = {
  error: {
    code: string
    message: string
    requestId?: string
    details?: unknown
  }
}
