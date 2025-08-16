import { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    sonarrManager: SonarrManagerService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const manager = new SonarrManagerService(fastify.log, fastify)

    try {
      await manager.initialize()
    } catch (error) {
      fastify.log.error({ error }, 'Failed to initialize Sonarr manager')
      throw error // Re-throw to prevent server start with broken state
    }

    fastify.decorate('sonarrManager', manager)
  },
  {
    name: 'sonarr-manager',
    dependencies: ['database'],
  },
)
