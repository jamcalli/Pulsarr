import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { SonarrService } from '@services/sonarr.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    sonarr: SonarrService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const service = new SonarrService(fastify.log, fastify.config)
    fastify.decorate('sonarr', service)
  },
  {
    name: 'sonarr',
    dependencies: ['config'],
  },
)
