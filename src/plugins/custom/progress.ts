import {
  type EventStreamServiceImpl,
  ProgressService,
} from '@services/event-emitter.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    progress: EventStreamServiceImpl
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const service = ProgressService.getInstance(fastify.log, fastify)
    fastify.decorate('progress', service)
  },
  {
    name: 'progress',
    dependencies: ['fastify-sse-v2'],
  },
)
