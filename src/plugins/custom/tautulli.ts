import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { TautulliService } from '@root/services/tautulli.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    tautulli: TautulliService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const tautulliService = new TautulliService(fastify.log, fastify)

    // Decorate fastify instance
    fastify.decorate('tautulli', tautulliService)

    // Initialize on ready (after all dependencies are loaded)
    fastify.addHook('onReady', async () => {
      try {
        await tautulliService.initialize()
        // Service initialized successfully
      } catch (error) {
        fastify.log.error({ error }, 'Failed to initialize Tautulli service')
      }
    })

    // Cleanup on close
    fastify.addHook('onClose', async () => {
      await tautulliService.shutdown()
    })

    // Plugin loaded
  },
  {
    name: 'tautulli',
    dependencies: ['database', 'config'],
  },
)
