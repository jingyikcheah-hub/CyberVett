import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: z.string().default('http://localhost:5173').refine(
    (value) => value.split(',').every((origin) => {
      try { new URL(origin.trim()); return true } catch { return false }
    }),
    'APP_ORIGIN must contain valid comma-separated origins',
  ),
  AUTH_SECRET: z.string().min(32).default('development-only-secret-change-me-now'),
  DATABASE_URL: z.string().optional(),
  DEMO_MODE: z.string().default('true').transform((value) => value === 'true'),
  AI_PROVIDER: z.enum(['demo', 'gemini']).default('demo'),
  GEMINI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('gemini-2.5-flash'),
})

export type AppConfig = z.infer<typeof envSchema>

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = envSchema.parse(source)

  if (config.NODE_ENV === 'production') {
    if (config.AUTH_SECRET.startsWith('development-only')) {
      throw new Error('AUTH_SECRET must be replaced in production')
    }
    if (!config.DEMO_MODE && !config.DATABASE_URL) {
      throw new Error('DATABASE_URL is required when DEMO_MODE is false')
    }
    if (config.DEMO_MODE) {
      throw new Error('DEMO_MODE must be false in production')
    }
  }

  if (config.AI_PROVIDER === 'gemini' && !config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini')
  }

  return config
}
