import type { Knex } from 'knex'
import knex from 'knex'

// Use globalThis to ensure connection is shared across module instances
// (vitest may load this module multiple times with different identities)
declare global {
  var __testDbConnection: Knex | null
}
globalThis.__testDbConnection ??= null

/**
 * Initialize the test database connection and run migrations
 * Uses in-memory SQLite for fast test execution
 */
export async function initializeTestDatabase(): Promise<Knex> {
  if (globalThis.__testDbConnection) {
    return globalThis.__testDbConnection
  }

  globalThis.__testDbConnection = knex({
    client: 'better-sqlite3',
    connection: {
      filename: ':memory:',
    },
    useNullAsDefault: true,
    migrations: {
      directory: './migrations/migrations',
    },
    pool: {
      min: 1,
      max: 1,
      afterCreate: (
        conn: unknown,
        done: (err: Error | null, conn: unknown) => void,
      ): void => {
        const sqliteConn = conn as { exec: (sql: string) => void }
        sqliteConn.exec('PRAGMA foreign_keys = ON;')
        done(null, conn)
      },
    },
  })

  await globalThis.__testDbConnection.migrate.latest()

  return globalThis.__testDbConnection
}

/**
 * Get the current test database connection
 * Throws if database has not been initialized
 *
 * @returns The database connection
 */
export function getTestDatabase(): Knex {
  if (!globalThis.__testDbConnection) {
    throw new Error('Database connection not initialized')
  }
  return globalThis.__testDbConnection
}

/**
 * Reset database by truncating all tables except migrations
 * Call this in beforeEach hooks to ensure clean state between tests
 */
export async function resetDatabase(): Promise<void> {
  if (!globalThis.__testDbConnection) {
    throw new Error('Database connection not initialized')
  }

  // Rollback any in-flight transaction from a failed test
  await globalThis.__testDbConnection.raw('ROLLBACK').catch(() => {})

  // Temporarily disable foreign key constraints
  await globalThis.__testDbConnection.raw('PRAGMA foreign_keys = OFF')

  // Get user tables, excluding system and migration tables
  const rows = await globalThis
    .__testDbConnection('sqlite_master')
    .select<{ name: string }[]>('name')
    .where('type', 'table')
    .whereNot('name', 'like', 'knex_%')
    .whereNot('name', 'like', 'sqlite_%')

  // Truncate each table
  for (const { name } of rows) {
    await globalThis.__testDbConnection(name).del()
  }

  // Reset autoincrement sequences (SQLite) - may not exist if no autoincrement writes yet
  await globalThis.__testDbConnection
    .raw('DELETE FROM sqlite_sequence')
    .catch(() => {})

  // Re-enable foreign key constraints
  await globalThis.__testDbConnection.raw('PRAGMA foreign_keys = ON')
}

/**
 * Clean up the test database connection
 * Should be called in global teardown
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (globalThis.__testDbConnection) {
    await globalThis.__testDbConnection.destroy()
    globalThis.__testDbConnection = null
  }
}
