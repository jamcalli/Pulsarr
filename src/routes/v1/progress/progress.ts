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
        try {
          progressService.removeConnection(connectionId)
        } catch (error) {
          fastify.log.error('Error removing progress connection:', error)
        }
      })

      return reply.sse(
        (async function* source() {
          try {
            for await (const [event] of on(
              progressService.getEventEmitter(),
              'progress',
            )) {
              yield {
                id: event.operationId,
                data: JSON.stringify(event),
              }
            }
          } catch (error) {
            fastify.log.error('SSE stream error:', error)
            // The generator will terminate, closing the SSE connection
          }
        })(),
      )
    },
  )
}

export default progressRoute
