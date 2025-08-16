import type { PlexLabelSyncService } from '@services/plex-label-sync.service.js'
import { PlexWatchlistService } from '@services/plex-watchlist.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    plexWatchlist: PlexWatchlistService
    plexLabelSyncService: PlexLabelSyncService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const service = new PlexWatchlistService(
      fastify.log,
      fastify,
      fastify.db,
      fastify.plexLabelSyncService,
    )

    fastify.decorate('plexWatchlist', service)
  },
  {
    name: 'plex-watchlist',
    dependencies: [
      'config',
      'database',
      'discord-notification-service',
      'quota',
      'plex-label-sync',
    ],
  },
)
