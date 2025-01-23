import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { ShowStatusService } from '@services/watchlist-status.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    sync: ShowStatusService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const service = new ShowStatusService(
      fastify.log,
      fastify.db,
      fastify.sonarr,
      fastify.config,
    )
    fastify.decorate('sync', service)
  },
  {
    name: 'sync',
    dependencies: ['database', 'sonarr', 'config'],
  },
)
