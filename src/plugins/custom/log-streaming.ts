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
    const service = LogStreamingService.getInstance(fastify.log, fastify)
    fastify.decorate('logStreaming', service)
    fastify.log.debug('Log streaming service initialized')

    fastify.addHook('onClose', async () => {
      // Clean up polling intervals on server shutdown
      if ('shutdown' in service && typeof service.shutdown === 'function') {
        service.shutdown()
      }
    })
  },
  {
    name: 'log-streaming',
    dependencies: ['fastify-sse-v2'],
  },
)
