import { CacheRegistry } from '@services/cache-registry.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    caches: CacheRegistry
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.decorate('caches', new CacheRegistry())
  },
  {
    name: 'caches',
  },
)
