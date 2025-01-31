import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { SonarrManagerService } from '@services/sonarr-manager.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    sonarrManager: SonarrManagerService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const manager = new SonarrManagerService(fastify.log, fastify)
    await manager.initialize()
    fastify.decorate('sonarrManager', manager)
    fastify.addHook('onClose', async () => {
      // Any cleanup needed for the manager
    })
  },
  {
    name: 'sonarr-manager',
    dependencies: ['database'],
  },
)
