import serviceApp from '@root/app.js'
import type { FastifyInstance } from 'fastify'
import Fastify from 'fastify'
import type { TestContext } from 'vitest'
import { initializeTestDatabase } from './database.js'

/**
 * Build a Fastify application instance for testing
 * Runs migrations on first call and keeps an anchor connection alive
 *
 * @param t - Optional Vitest test context for automatic cleanup
 * @returns Fastify instance ready for testing
 */
export async function build(t?: TestContext): Promise<FastifyInstance> {
  // Initialize database on first call
  await initializeTestDatabase()

  const app = Fastify({
    logger: false, // Disable logging in tests
    // Match production AJV options from server.ts
    ajv: {
      customOptions: {
        coerceTypes: 'array',
        removeAdditional: 'all',
      },
    },
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
