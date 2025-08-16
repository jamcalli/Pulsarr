import { TautulliService } from '@root/services/tautulli.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

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

    // Emit initial status
    emitTautulliStatus(fastify)

    // Set up status monitoring interval
    const statusInterval = setInterval(() => {
      if (fastify.progress.hasActiveConnections()) {
        emitTautulliStatus(fastify)
      }
    }, 1000) // 1 second

    fastify.addHook('onClose', () => {
      clearInterval(statusInterval)
    })

    // Initialize on ready (after all dependencies are loaded)
    fastify.addHook('onReady', async () => {
      try {
        await tautulliService.initialize()
        emitTautulliStatus(fastify)
      } catch (error) {
        fastify.log.error({ error }, 'Failed to initialize Tautulli service')
        emitTautulliStatus(fastify)
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
    dependencies: ['database', 'config', 'progress'],
  },
)

/**
 * Emits the current Tautulli service status as a progress event if there are active connections.
 *
 * @param fastify - The Fastify instance containing the Tautulli and progress services.
 */
function emitTautulliStatus(fastify: FastifyInstance) {
  if (!fastify.progress.hasActiveConnections()) {
    return
  }

  const status = fastify.tautulli.getStatus()
  const operationId = `tautulli-status-${Date.now()}`

  fastify.progress.emit({
    operationId,
    type: 'system',
    phase: 'info',
    progress: 100,
    message: `Tautulli status: ${status}`,
  })
}
