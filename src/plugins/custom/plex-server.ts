/**
 * Plex Server Plugin
 *
 * Registers the PlexServerService for Plex server operations
 */

import type { ProgressEvent } from '@root/types/progress.types.js'
import { PlexServerService } from '@services/plex-server.service.js'
import { systemStatusEvent } from '@utils/system-status-event.js'
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

    fastify.progress.registerSnapshotProvider('plex-sse', () => [
      buildPlexSSEStatusEvent(fastify),
    ])

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

      emitPlexSSEStatus(fastify)
      // Plex Pass detection during initialize() can change the mobile status
      fastify.notifications.emitStatusEvents()
    })

    // Disconnect SSE and clear workflow caches on close
    fastify.addHook('onClose', () => {
      service.disconnectSSE()
      service.clearWorkflowCaches()
    })
  },
  {
    name: 'plex-server',
    dependencies: ['config', 'progress'],
  },
)

function buildPlexSSEStatusEvent(fastify: FastifyInstance): ProgressEvent {
  return systemStatusEvent('plex-sse-status', 'Plex SSE status', {
    status: fastify.plexServerService.isSSEConnected()
      ? 'connected'
      : 'disconnected',
  })
}

function emitPlexSSEStatus(fastify: FastifyInstance) {
  if (!fastify.progress.hasActiveConnections()) return
  fastify.progress.emit(buildPlexSSEStatusEvent(fastify))
}
