import { LogStreamingService } from '@services/log-streaming.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    logStreaming: LogStreamingService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const service = new LogStreamingService(fastify.log)
    fastify.decorate('logStreaming', service)
    fastify.log.debug('Log streaming service initialized')

    fastify.addHook('onClose', () => {
      service.shutdown()
    })
  },
  {
    name: 'log-streaming',
    dependencies: ['fastify-sse-v2'],
  },
)
