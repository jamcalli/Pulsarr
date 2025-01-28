import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { PlexWatchlistService } from '@services/plex-watchlist.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    plexWatchlist: PlexWatchlistService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const service = new PlexWatchlistService(fastify.log, fastify, fastify.db)

    fastify.decorate('plexWatchlist', service)
  },
  {
    name: 'plex-watchlist',
    dependencies: ['config', 'database'],
  },
)
