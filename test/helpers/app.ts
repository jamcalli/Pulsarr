import serviceApp from '@root/app.js'
import type { FastifyInstance, onRouteHookHandler } from 'fastify'
import Fastify from 'fastify'
import type { TestContext } from 'vitest'
import { initializeTestDatabase } from './database.js'

/** Runs migrations on first call, and an onRoute hook sees every route the app registers. */
export async function build(
  t?: TestContext,
  onRoute?: onRouteHookHandler,
): Promise<FastifyInstance> {
  await initializeTestDatabase()

  const app = Fastify({
    logger: false,
    // Match production AJV options from server.ts
    ajv: {
      customOptions: {
        coerceTypes: 'array',
        removeAdditional: 'all',
      },
    },
  })

  if (onRoute) {
    app.addHook('onRoute', onRoute)
  }

  await app.register(serviceApp)

  if (t) {
    t.onTestFinished(async () => {
      await app.close()
    })
  }

  return app
}
