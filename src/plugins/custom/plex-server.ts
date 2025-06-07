/**
 * Plex Server Plugin
 *
 * Registers the PlexServerService for Plex server operations
 */
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { PlexServerService } from '@utils/plex-server.js'

declare module 'fastify' {
  interface FastifyInstance {
    plexServerService: PlexServerService
  }
}

export default fp(
  async function plexServer(fastify: FastifyInstance) {
    const service = new PlexServerService(fastify.log, fastify)

    fastify.decorate('plexServerService', service)

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
        }
      } catch (error) {
        fastify.log.error(
          { error },
          'Error during PlexServerService initialization',
        )
        // Don't throw - let server continue without full Plex functionality
      }
    })

    // Clear workflow caches on close
    fastify.addHook('onClose', async () => {
      service.clearWorkflowCaches()
    })
  },
  {
    name: 'plex-server',
    dependencies: ['config'],
  },
)
