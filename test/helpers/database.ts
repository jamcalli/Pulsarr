import fs from 'node:fs'
import type { Knex } from 'knex'
import knex from 'knex'

// Global test database connection kept alive to prevent database from being wiped
// This "anchor" connection ensures the test database persists across tests
let anchorConnection: Knex | null = null

/**
 * Initialize the test database connection and run migrations
 * Should be called once before running tests
 *
 * @returns The initialized database connection
 */
export async function initializeTestDatabase(): Promise<Knex> {
  if (anchorConnection) {
    return anchorConnection
  }

  const dbPath = process.env.dbPath
  if (!dbPath) {
    throw new Error('dbPath environment variable not set in test configuration')
  }

  // Clean up all SQLite-related files from previous test runs
  const filesToClean = [
    dbPath,
    `${dbPath}-shm`,
    `${dbPath}-wal`,
    `${dbPath}-journal`,
  ]
  for (const file of filesToClean) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
  }

  // Create connection with test-specific config that doesn't load .env
  anchorConnection = knex({
    client: 'better-sqlite3',
    connection: {
      filename: dbPath,
    },
    useNullAsDefault: true,
    migrations: {
      directory: './migrations/migrations',
    },
    pool: {
      afterCreate: (conn: unknown, cb: () => void): void => {
        const sqliteConn = conn as { exec: (sql: string) => void }
        sqliteConn.exec('PRAGMA journal_mode = WAL;')
        sqliteConn.exec('PRAGMA foreign_keys = ON;')
        cb()
      },
    },
  })

  // Run migrations
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

  // Get all table names except knex migrations table
  const result = await anchorConnection.raw<{ name: string }[]>(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    AND name NOT LIKE 'knex_%'
  `)

  // Truncate each table
  for (const row of result) {
    await anchorConnection.raw(`DELETE FROM ${row.name}`)
  }
}

/**
 * Clean up the test database connection
 * Should be called in global teardown
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (anchorConnection) {
    await anchorConnection.destroy()
    anchorConnection = null
  }
}
