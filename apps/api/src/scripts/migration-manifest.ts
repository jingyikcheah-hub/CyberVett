export type MigrationManifestEntry = {
  version: string
  filename: string
  checksum: string
}

export const MIGRATION_MANIFEST: readonly MigrationManifestEntry[] = [
  {
    version: '001_initial',
    filename: '001_initial.sql',
    checksum: '749b754f4cc80f68002c6cfff9d6e433382b89bda20a529be3a2d5f35dbbd41b',
  },
  {
    version: '002_v3_accounts_and_followups',
    filename: '002_v3_accounts_and_followups.sql',
    checksum: '3d7876930cfe059b9bb41ba250f006457c058b6e13ce76931b66d8d381fe18d2',
  },
  {
    version: '003_security_lifecycle',
    filename: '003_security_lifecycle.sql',
    checksum: 'a3bab1b8b79c524b342f5acc5825e21268f785dbdf175f98d0d53047c28392a9',
  },
]

export const EXPECTED_SCHEMA_VERSION = '003_security_lifecycle'
