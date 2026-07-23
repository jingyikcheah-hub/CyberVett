import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { loadEnvFile } from 'node:process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { Client, type ClientConfig, type QueryResultRow } from 'pg'
import { assertDatabaseUrlDoesNotConfigureSsl } from '../config/database.js'
import { EXPECTED_SCHEMA_VERSION, MIGRATION_MANIFEST, type MigrationManifestEntry } from './migration-manifest.js'

const migrationsDirectoryUrl = new URL('../../../../infra/postgres/', import.meta.url)
const MIGRATION_LOCK_NAMESPACE = 1_129_907_531
const MIGRATION_LOCK_ID = 1_341_281_011

const legacyBaselineColumns = {
  organizations: ['id', 'name', 'created_at'],
  users: ['id', 'organization_id', 'name', 'email', 'role', 'password_hash', 'active', 'created_at'],
  jobs: ['id', 'organization_id', 'title', 'department', 'location', 'status', 'duration_minutes', 'questions', 'created_at', 'updated_at'],
  interview_sessions: [
    'id',
    'organization_id',
    'job_id',
    'candidate_name',
    'candidate_email',
    'invite_token_digest',
    'status',
    'score',
    'consented_at',
    'started_at',
    'completed_at',
    'reviewer_note',
    'created_at',
    'updated_at',
  ],
  interview_answers: ['id', 'session_id', 'question_id', 'answer', 'submitted_at'],
  interview_reports: ['id', 'session_id', 'organization_id', 'payload', 'created_at', 'updated_at'],
  audit_events: ['id', 'organization_id', 'actor_id', 'action', 'entity_type', 'entity_id', 'request_id', 'created_at'],
} as const

type Migration = MigrationManifestEntry & {
  sql: string
}

type AppliedMigration = QueryResultRow & {
  version: string
  filename: string
  checksum: string
  baselined: boolean
}

export { EXPECTED_SCHEMA_VERSION }

export async function loadMigrationPlan(directoryUrl: URL = migrationsDirectoryUrl): Promise<Migration[]> {
  const directoryFiles = (await readdir(directoryUrl))
    .filter((filename) => /^\d{3}_[a-z0-9_]+\.sql$/.test(filename))
    .sort()
  const manifestFiles = MIGRATION_MANIFEST.map((migration) => migration.filename)

  if (directoryFiles.join('\n') !== manifestFiles.join('\n')) {
    throw new Error(
      `Migration manifest does not match infra/postgres. Expected [${manifestFiles.join(', ')}], found [${directoryFiles.join(', ')}].`,
    )
  }

  const migrations = await Promise.all(MIGRATION_MANIFEST.map(async (entry) => {
    const rawSql = await readFile(new URL(entry.filename, directoryUrl), 'utf8')
    const sql = normalizeSql(rawSql)
    if (/\b(?:begin|commit|rollback)\s*;/i.test(sql)) {
      throw new Error(`${entry.filename} contains transaction control; the migration runner owns the transaction.`)
    }
    const checksum = createHash('sha256').update(sql, 'utf8').digest('hex')
    if (checksum !== entry.checksum) {
      throw new Error(`${entry.filename} checksum does not match the immutable migration manifest.`)
    }
    return { ...entry, sql }
  }))

  if (migrations.at(-1)?.version !== EXPECTED_SCHEMA_VERSION) {
    throw new Error('EXPECTED_SCHEMA_VERSION must match the final migration in the manifest.')
  }
  return migrations
}

export async function runMigrations(clientConfig: ClientConfig): Promise<void> {
  const migrations = await loadMigrationPlan()
  const client = new Client(clientConfig)
  const completedMessages: string[] = []
  await client.connect()

  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock($1, $2)', [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_ID])
    await client.query(`
      create table if not exists cybervett_schema_migrations (
        version varchar(100) primary key,
        filename varchar(160) not null unique,
        checksum char(64) not null,
        applied_at timestamptz not null default current_timestamp,
        execution_ms integer not null check (execution_ms >= 0),
        baselined boolean not null default false
      )
    `)

    const appliedResult = await client.query<AppliedMigration>(
      `select version, filename, checksum, baselined
       from cybervett_schema_migrations
       order by version`,
    )
    const manifestVersions = new Set(migrations.map((migration) => migration.version))
    const unknown = appliedResult.rows.filter((migration) => !manifestVersions.has(migration.version))
    if (unknown.length > 0) {
      throw new Error(`Database contains migration versions unknown to this release: ${unknown.map((item) => item.version).join(', ')}.`)
    }

    const appliedByVersion = new Map(appliedResult.rows.map((migration) => [migration.version, migration]))
    for (const migration of migrations) {
      const applied = appliedByVersion.get(migration.version)
      if (!applied) continue
      if (applied.filename !== migration.filename || applied.checksum !== migration.checksum) {
        throw new Error(`Applied migration ${migration.version} does not match the immutable migration manifest.`)
      }
    }
    let encounteredGap = false
    for (const migration of migrations) {
      if (!appliedByVersion.has(migration.version)) {
        encounteredGap = true
      } else if (encounteredGap) {
        throw new Error(`Applied migration history is out of order at ${migration.version}.`)
      }
    }

    if (!appliedByVersion.has('001_initial') && await hasExistingCyberVettSchema(client)) {
      await verifyLegacyBaseline(client)
      const initial = migrations[0]!
      await recordMigration(client, initial, 0, true)
      appliedByVersion.set(initial.version, {
        version: initial.version,
        filename: initial.filename,
        checksum: initial.checksum,
        baselined: true,
      })
      completedMessages.push(`Baselined ${initial.version} against the existing CyberVett schema.`)
    }

    for (const migration of migrations) {
      if (appliedByVersion.has(migration.version)) continue
      const startedAt = performance.now()
      await client.query(migration.sql)
      const executionMs = Math.max(0, Math.round(performance.now() - startedAt))
      await recordMigration(client, migration, executionMs, false)
      completedMessages.push(`Applied ${migration.version} (${executionMs} ms).`)
    }

    await client.query('commit')
    completedMessages.push(`Database schema is current at ${EXPECTED_SCHEMA_VERSION}.`)
    process.stdout.write(`${completedMessages.join('\n')}\n`)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    await client.end()
  }
}

async function hasExistingCyberVettSchema(client: Client): Promise<boolean> {
  const tableNames = Object.keys(legacyBaselineColumns)
  const result = await client.query<QueryResultRow & { table_name: string }>(
    `select table_name
     from information_schema.tables
     where table_schema = current_schema()
       and table_name = any($1::text[])`,
    [tableNames],
  )
  if (result.rowCount === 0) return false
  if (result.rowCount !== tableNames.length) {
    const found = new Set(result.rows.map((row) => row.table_name))
    const missing = tableNames.filter((tableName) => !found.has(tableName))
    throw new Error(`Refusing to baseline a partial CyberVett schema; missing tables: ${missing.join(', ')}.`)
  }
  return true
}

async function verifyLegacyBaseline(client: Client): Promise<void> {
  const result = await client.query<QueryResultRow & { table_name: string; column_name: string }>(
    `select table_name, column_name
     from information_schema.columns
     where table_schema = current_schema()
       and table_name = any($1::text[])`,
    [Object.keys(legacyBaselineColumns)],
  )
  const columnsByTable = new Map<string, Set<string>>()
  for (const row of result.rows) {
    const columns = columnsByTable.get(row.table_name) ?? new Set<string>()
    columns.add(row.column_name)
    columnsByTable.set(row.table_name, columns)
  }

  const missing: string[] = []
  for (const [tableName, requiredColumns] of Object.entries(legacyBaselineColumns)) {
    const existingColumns = columnsByTable.get(tableName) ?? new Set<string>()
    for (const columnName of requiredColumns) {
      if (!existingColumns.has(columnName)) missing.push(`${tableName}.${columnName}`)
    }
  }
  if (missing.length > 0) {
    throw new Error(`Refusing to baseline an incompatible CyberVett schema; missing columns: ${missing.join(', ')}.`)
  }
}

async function recordMigration(
  client: Client,
  migration: Migration,
  executionMs: number,
  baselined: boolean,
): Promise<void> {
  await client.query(
    `insert into cybervett_schema_migrations
       (version, filename, checksum, execution_ms, baselined)
     values ($1, $2, $3, $4, $5)`,
    [migration.version, migration.filename, migration.checksum, executionMs, baselined],
  )
}

function normalizeSql(sql: string): string {
  return sql.replace(/\r\n/g, '\n')
}

export function databaseClientConfig(environment: NodeJS.ProcessEnv): ClientConfig {
  const connectionString = environment.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required to run database migrations.')
  assertDatabaseUrlDoesNotConfigureSsl(connectionString)

  const sslMode = environment.DATABASE_SSL_MODE
    ?? (environment.NODE_ENV === 'production' ? 'verify-full' : 'disable')
  if (!['disable', 'require', 'verify-full'].includes(sslMode)) {
    throw new Error('DATABASE_SSL_MODE must be disable, require, or verify-full.')
  }
  if (sslMode === 'verify-full' && !environment.DATABASE_SSL_CA) {
    throw new Error('DATABASE_SSL_CA is required when DATABASE_SSL_MODE=verify-full.')
  }

  const ssl = sslMode === 'disable'
    ? undefined
    : {
        rejectUnauthorized: sslMode === 'verify-full',
        ...(environment.DATABASE_SSL_CA
          ? { ca: environment.DATABASE_SSL_CA.replaceAll('\\n', '\n') }
          : {}),
      }
  return {
    connectionString,
    ...(ssl ? { ssl } : {}),
  }
}

function isEntrypoint(): boolean {
  const entrypoint = process.argv[1]
  return Boolean(entrypoint && pathToFileURL(resolve(entrypoint)).href === import.meta.url)
}

async function main(): Promise<void> {
  try {
    loadEnvFile(new URL('../../../../.env', import.meta.url))
  } catch {
    // Deployment environments may supply variables without an .env file.
  }
  await runMigrations(databaseClientConfig(process.env))
}

if (isEntrypoint()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown migration failure.'
    process.stderr.write(`Migration failed: ${message}\n`)
    process.exitCode = 1
  })
}
