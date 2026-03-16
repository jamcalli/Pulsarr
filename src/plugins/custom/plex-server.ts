/**
 * Plex Server Plugin
 *
 * Registers the PlexServerService for Plex server operations
 */

import { PlexServerService } from '@services/plex-server.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    plexServerService: PlexServerService
  }
}

export default fp(
  async function plexServer(fastify: FastifyInstance) {
    const service = new PlexServerService(fastify.log, fastify)

    fastify.decorate('plexServerService', service)

    emitPlexSSEStatus(fastify)

    const statusInterval = setInterval(() => {
      if (fastify.progress.hasActiveConnections()) {
        emitPlexSSEStatus(fastify)
      }
    }, 1000)

    // Move initialization to onReady hook
    fastify.addHook('onReady', async () => {
      try {
        const initialized = await service.initialize()
        if (!initialized) {
          fastify.log.warn(
            'PlexServerService failed to initialize - some features may not work properly',
          )
        } else {
          fastify.log.info('PlexServerService initialized successfully')

          try {
            await service.connectSSE()
          } catch (error) {
            fastify.log.warn(
              { error },
              'SSE connection failed - polling will continue as fallback',
            )
          }

          service.onSSE('connected', () => emitPlexSSEStatus(fastify))
          service.onSSE('disconnected', () => emitPlexSSEStatus(fastify))
        }
      } catch (error) {
        fastify.log.error(
          { error },
          'Error during PlexServerService initialization',
        )
        // Don't throw - let server continue without full Plex functionality
      }
    })

    // Disconnect SSE and clear workflow caches on close
    fastify.addHook('onClose', () => {
      clearInterval(statusInterval)
      service.disconnectSSE()
      service.clearWorkflowCaches()
    })
  },
  {
    name: 'plex-server',
    dependencies: ['config', 'progress'],
  },
)

function emitPlexSSEStatus(fastify: FastifyInstance) {
  if (!fastify.progress.hasActiveConnections()) return

  const connected = fastify.plexServerService.isSSEConnected()
  const status = connected ? 'connected' : 'disconnected'

  fastify.progress.emit({
    operationId: `plex-sse-status-${Date.now()}`,
    type: 'system',
    phase: 'info',
    progress: 100,
    message: `Plex SSE status: ${status}`,
  })
}
