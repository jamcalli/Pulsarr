import fs from 'node:fs'
import type { FastifyInstance } from 'fastify'
import Fastify from 'fastify'
import type { Knex } from 'knex'
import knex from 'knex'
import type { TestContext } from 'vitest'
import { expect } from 'vitest'
import serviceApp, { options } from '../src/app.js'

// Global test database connection kept alive to prevent database from being wiped
// This "anchor" connection ensures the test database persists across tests
let anchorConnection: Knex | null = null

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

/**
 * Build a Fastify application instance for testing
 * Runs migrations on first call and keeps an anchor connection alive
 *
 * @param t - Optional Vitest test context for automatic cleanup
 * @returns Fastify instance ready for testing
 */
export async function build(t?: TestContext): Promise<FastifyInstance> {
  // On first call, create anchor connection and run migrations
  // This connection is never closed, keeping the database alive for the duration of tests
  if (!anchorConnection) {
    const dbPath = process.env.dbPath
    if (!dbPath) {
      throw new Error(
        'dbPath environment variable not set in test configuration',
      )
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
  }

  const app = Fastify({
    logger: false, // Disable logging in tests
    ...options,
  })

  // Register the main app
  await app.register(serviceApp)

  // Auto-close app after test if context provided
  if (t) {
    t.onTestFinished(async () => {
      await app.close()
    })
  }

  return app
}

/**
 * Helper to assert validation errors
 */
export function expectValidationError(
  statusCode: number,
  payload: string,
  expectedMessage: string,
) {
  expect(statusCode).toBe(400)
  const { message } = JSON.parse(payload)
  expect(message).toContain(expectedMessage)
}
