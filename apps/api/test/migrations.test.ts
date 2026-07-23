import { describe, expect, it } from 'vitest'
import { databaseClientConfig, EXPECTED_SCHEMA_VERSION, loadMigrationPlan } from '../src/scripts/migrate.js'

describe('database migration manifest', () => {
  it('loads every immutable SQL migration in order', async () => {
    const migrations = await loadMigrationPlan()

    expect(migrations.map(({ version }) => version)).toEqual([
      '001_initial',
      '002_v3_accounts_and_followups',
      '003_security_lifecycle',
    ])
    expect(migrations.at(-1)?.version).toBe(EXPECTED_SCHEMA_VERSION)
    expect(migrations.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true)
    expect(migrations.at(-1)?.sql).toContain('legacy in-progress interviews have no resumable credential')
  })

  it('rejects SSL overrides in the migration DATABASE_URL', () => {
    expect(() => databaseClientConfig({
      DATABASE_URL: 'postgres://database.example.com/cybervett?sslmode=disable',
      DATABASE_SSL_MODE: 'verify-full',
      DATABASE_SSL_CA: '-----BEGIN CERTIFICATE-----\\nTEST-CA-DATA\\n-----END CERTIFICATE-----',
    })).toThrow(/DATABASE_URL must not include SSL-related query parameters/)
  })
})
