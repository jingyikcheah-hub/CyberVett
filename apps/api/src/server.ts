import { loadEnvFile } from 'node:process'
import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { createEvaluator, StructuredEvaluator } from './services/evaluator.js'
import { createInterviewConductor } from './services/interview-conductor.js'
import { MemoryStore } from './store/memory-store.js'
import { PostgresStore } from './store/postgres-store.js'

try { loadEnvFile(new URL('../../../.env', import.meta.url)) } catch { /* Environment variables may be supplied by the host. */ }

const config = loadConfig()
const store = config.DEMO_MODE
  ? new MemoryStore()
  : new PostgresStore(config.DATABASE_URL!, config.DATABASE_SSL_MODE, config.DATABASE_SSL_CA)

if (store instanceof MemoryStore) await store.initialize()

const app = await buildApp({
  config,
  store,
  evaluator: createEvaluator(config),
  practiceEvaluator: new StructuredEvaluator(),
  conductor: createInterviewConductor(config),
})

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down')
  await app.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

await app.listen({ port: config.PORT, host: config.HOST })
