import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { RadarrManagerService } from '@services/radarr-manager.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    radarrManager: RadarrManagerService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const manager = new RadarrManagerService(fastify.log, fastify)

    try {
      await manager.initialize()
    } catch (error) {
      fastify.log.error({ error }, 'Failed to initialize Radarr manager')
      throw error // Re-throw to prevent server start with broken state
    }

    fastify.decorate('radarrManager', manager)
  },
  {
    name: 'radarr-manager',
    dependencies: ['database'],
  },
)
