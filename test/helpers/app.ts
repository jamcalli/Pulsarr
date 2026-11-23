import serviceApp from '@root/app.js'
import { createConfigurableProxyTrust } from '@utils/ip.js'
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

  const proxyTrust = createConfigurableProxyTrust()
  const app = Fastify({
    logger: false,
    // Match production AJV options from server.ts
    ajv: {
      customOptions: {
        coerceTypes: 'array',
        removeAdditional: 'all',
      },
    },
    trustProxy: proxyTrust.trustProxy,
  })

  if (onRoute) {
    app.addHook('onRoute', onRoute)
  }

  await app.register(serviceApp)
  app.addHook('onReady', async () => {
    proxyTrust.configure(app.config.trustedProxies)
  })

  if (t) {
    t.onTestFinished(async () => {
      await app.close()
    })
  }

  return app
}
