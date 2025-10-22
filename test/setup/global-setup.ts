/**
 * Global test setup and teardown
 */

export async function setup(): Promise<void> {
  process.env.NODE_ENV = 'test'
  process.env.logLevel = 'silent'
  process.env.port = '3004'
  process.env.dbType = 'sqlite'
}

export async function teardown(): Promise<void> {
  const { cleanupTestDatabase } = await import('../helpers/database.js')
  await cleanupTestDatabase()
}
