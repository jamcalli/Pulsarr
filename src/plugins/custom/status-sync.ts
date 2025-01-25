import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { StatusService } from '@services/watchlist-status.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    sync: StatusService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const service = new StatusService(
      fastify.log,
      fastify.db,
      fastify.sonarr,
      fastify.radarr,
      fastify.config,
    )
    fastify.decorate('sync', service)
  },
  {
    name: 'sync',
    dependencies: ['database', 'sonarr', 'radarr', 'config'],
  },
)
