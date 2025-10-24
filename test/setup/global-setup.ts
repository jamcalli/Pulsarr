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
  try {
    const { cleanupTestDatabase } = await import('../helpers/database.js')
    await cleanupTestDatabase()
  } catch (error) {
    console.error('Failed to cleanup test database:', error)
    // Don't throw - allow tests to complete even if cleanup fails
  }
}
