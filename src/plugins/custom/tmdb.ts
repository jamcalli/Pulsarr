import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { TmdbService } from '@services/tmdb.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    tmdb: TmdbService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const tmdbService = new TmdbService(fastify.log, fastify)

    fastify.decorate('tmdb', tmdbService)
  },
  {
    name: 'tmdb',
    dependencies: ['config', 'database', 'radarr-manager'],
  },
)
