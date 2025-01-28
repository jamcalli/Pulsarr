import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { on } from 'node:events'
import { ProgressService } from '@services/event-emitter.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    progress: ProgressService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const service = ProgressService.getInstance(fastify.log, fastify)
    fastify.decorate('progress', service)

    fastify.get('/api/progress', (request, reply) => {
      const connectionId = randomUUID()
      service.addConnection(connectionId)

      request.socket.on('close', () => {
        service.removeConnection(connectionId)
      })

      reply.sse(
        (async function* source() {
          for await (const [event] of on(
            service.getEventEmitter(),
            'progress',
          )) {
            yield {
              id: event.operationId,
              data: JSON.stringify(event),
            }
          }
        })(),
      )
    })
  },
  {
    name: 'progress',
    dependencies: ['fastify-sse-v2'],
  },
)
