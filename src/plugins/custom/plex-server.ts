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
    const service = new PlexServerService(fastify.log, fastify.config)

    // Initialize the service
    const initialized = await service.initialize()
    if (!initialized) {
      fastify.log.warn(
        'PlexServerService failed to initialize - some features may not work properly',
      )
    }

    fastify.decorate('plexServerService', service)

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
