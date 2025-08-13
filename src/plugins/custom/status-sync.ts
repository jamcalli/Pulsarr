import { StatusService } from '@services/watchlist-status.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

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
      fastify.sonarrManager,
      fastify.radarrManager,
      fastify,
    )
    fastify.decorate('sync', service)
  },
  {
    name: 'sync',
    dependencies: ['database', 'sonarr-manager', 'radarr-manager', 'user-tag'],
  },
)
