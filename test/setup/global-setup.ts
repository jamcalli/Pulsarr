/**
 * Global test setup and teardown file
 * Sets up test environment variables and manages test database lifecycle
 */

import fs from 'node:fs'
import path from 'node:path'

const TEST_DB_PATH = path.join(process.cwd(), '.test-db.sqlite')

/**
 * Runs once before all tests
 */
export async function setup(): Promise<void> {
  // Set test environment
  process.env.NODE_ENV = 'test'

  // Use camelCase for env vars (matches @fastify/env schema)
  process.env.logLevel = 'silent'

  // Set required env vars for tests
  process.env.port = '3004' // Use different port for tests
  process.env.dbType = 'sqlite'

  // Use a temporary file-based database for tests
  // In-memory databases don't share across connections with better-sqlite3
  process.env.dbPath = TEST_DB_PATH

  // Clean up all test database files from previous test runs
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

/**
 * Runs once after all tests complete
 */
export async function teardown(): Promise<void> {
  // Import cleanup function dynamically to avoid circular dependencies
  const { cleanupTestDatabase } = await import('../helpers/database.js')

  // Clean up the database connection
  await cleanupTestDatabase()

  // Clean up all test database files
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
