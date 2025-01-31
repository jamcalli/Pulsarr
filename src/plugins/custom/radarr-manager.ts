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
    await manager.initialize()
    fastify.decorate('radarrManager', manager)
    fastify.addHook('onClose', async () => {
      // Any cleanup needed for the manager
    })
  },
  {
    name: 'radarr-manager',
    dependencies: ['database'],
  },
)
