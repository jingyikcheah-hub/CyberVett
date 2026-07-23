const LIBPQ_COMPATIBILITY_PARAMETER = 'uselibpqcompat'

export function assertDatabaseUrlDoesNotConfigureSsl(databaseUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    // Leave general connection-string validation to node-postgres.
    return
  }

  const hasSslParameter = [...parsed.searchParams.keys()].some((name) => {
    const normalized = name.toLowerCase()
    return normalized.startsWith('ssl') || normalized === LIBPQ_COMPATIBILITY_PARAMETER
  })

  if (hasSslParameter) {
    throw new Error(
      'DATABASE_URL must not include SSL-related query parameters; use DATABASE_SSL_MODE and DATABASE_SSL_CA instead.',
    )
  }
}
