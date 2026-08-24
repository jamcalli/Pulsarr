/**
 * Detects a unique constraint violation from either supported database client.
 *
 * @param error - The thrown value to inspect
 * @returns True if the error is a PostgreSQL or better-sqlite3 unique violation
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = 'code' in error ? error.code : undefined
  return (
    // PostgreSQL: SQLSTATE 23505
    code === '23505' ||
    // better-sqlite3: SQLITE_CONSTRAINT_UNIQUE (19)
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    (code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE')) ||
    error.message.includes('UNIQUE constraint failed')
  )
}
