import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import { on } from 'node:events'
import { ProgressStreamResponseSchema } from '@schemas/progress/progress.schema.js'

const progressRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/',
    {
      schema: {
        summary: 'Stream progress events',
        operationId: 'streamProgress',
        description:
          'Server-Sent Events stream for real-time progress updates. This endpoint establishes an SSE connection to receive progress updates for various operations like watchlist syncing, delete sync analysis, etc.',
        response: {
          200: ProgressStreamResponseSchema,
        },
        tags: ['progress'],
      },
    },
    async (request, reply) => {
      const connectionId = randomUUID()
      const progressService = fastify.progress

      progressService.addConnection(connectionId)

      request.socket.on('close', () => {
        progressService.removeConnection(connectionId)
      })

      return reply.sse(
        (async function* source() {
          for await (const [event] of on(
            progressService.getEventEmitter(),
            'progress',
          )) {
            yield {
              id: event.operationId,
              data: JSON.stringify(event),
            }
          }
        })(),
      )
    },
  )
}

export default progressRoute
