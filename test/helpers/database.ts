import os from 'node:os'
import path from 'node:path'
import type { Knex } from 'knex'
import knex from 'knex'

let anchorConnection: Knex | null = null

const TEST_DB_PATH = path.join(os.tmpdir(), `pulsarr-test-${process.pid}.db`)

/**
 * Initialize the test database connection and run migrations
 * Uses a temp file per process to avoid WAL issues and enable sharing
 */
export async function initializeTestDatabase(): Promise<Knex> {
  if (anchorConnection) {
    return anchorConnection
  }

  anchorConnection = knex({
    client: 'better-sqlite3',
    connection: {
      filename: TEST_DB_PATH,
    },
    useNullAsDefault: true,
    migrations: {
      directory: './migrations/migrations',
    },
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn: unknown, cb: () => void): void => {
        const sqliteConn = conn as { exec: (sql: string) => void }
        sqliteConn.exec('PRAGMA foreign_keys = ON;')
        cb()
      },
    },
  })

  await anchorConnection.migrate.latest()

  return anchorConnection
}

/**
 * Get the current test database connection
 * Throws if database has not been initialized
 *
 * @returns The database connection
 */
export function getTestDatabase(): Knex {
  if (!anchorConnection) {
    throw new Error('Database connection not initialized')
  }
  return anchorConnection
}

/**
 * Reset database by truncating all tables except migrations
 * Call this in beforeEach hooks to ensure clean state between tests
 */
export async function resetDatabase(): Promise<void> {
  if (!anchorConnection) {
    throw new Error('Database connection not initialized')
  }

  // Temporarily disable foreign key constraints
  await anchorConnection.raw('PRAGMA foreign_keys = OFF')

  // Get user tables, excluding system and migration tables
  const rows = await anchorConnection('sqlite_master')
    .select<{ name: string }[]>('name')
    .where('type', 'table')
    .whereNot('name', 'like', 'knex_%')
    .whereNot('name', 'like', 'sqlite_%')

  // Truncate each table
  for (const { name } of rows) {
    await anchorConnection(name).del()
  }

  // Re-enable foreign key constraints
  await anchorConnection.raw('PRAGMA foreign_keys = ON')
}

/**
 * Clean up the test database connection and temp files
 * Should be called in global teardown
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (anchorConnection) {
    await anchorConnection.destroy()
    anchorConnection = null
  }

  const fs = await import('node:fs')
  const filesToClean = [
    TEST_DB_PATH,
    `${TEST_DB_PATH}-shm`,
    `${TEST_DB_PATH}-wal`,
    `${TEST_DB_PATH}-journal`,
  ]
  for (const file of filesToClean) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
  }
}
