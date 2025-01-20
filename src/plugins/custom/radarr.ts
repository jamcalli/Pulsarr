import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { RadarrService } from '@services/radarr.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    radarr: RadarrService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const service = new RadarrService(fastify.log, fastify.config)
    fastify.decorate('radarr', service)
  },
  {
    name: 'radarr',
    dependencies: ['config'],
  },
)
