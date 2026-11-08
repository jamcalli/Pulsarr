import { ConfigService } from '@services/config.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    configService: ConfigService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const configService = new ConfigService(fastify.log, fastify)

    fastify.decorate('configService', configService)
  },
  {
    name: 'config-service',
    dependencies: [
      'config',
      'database',
      'maintainerr',
      'notifications',
      'plex-server',
      'plex-watchlist',
      'radarr-manager',
      'sonarr-manager',
      'tmdb',
      'user-tag',
    ],
  },
)
