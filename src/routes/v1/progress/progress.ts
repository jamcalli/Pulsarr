import { randomUUID } from 'node:crypto'
import { on } from 'node:events'
import { ProgressStreamResponseSchema } from '@schemas/progress/progress.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'

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
        tags: ['Progress'],
      },
    },
    async (request, reply) => {
      const connectionId = randomUUID()
      const progressService = fastify.progress
      const abortController = new AbortController()

      progressService.addConnection(connectionId)

      request.socket.on('close', () => {
        try {
          progressService.removeConnection(connectionId)
          abortController.abort()
        } catch (error) {
          logRouteError(fastify.log, request, error, {
            message: 'Failed to remove progress connection',
            connectionId,
          })
        }
      })

      return reply.sse(
        (async function* source() {
          try {
            for await (const [event] of on(
              progressService.getEventEmitter(),
              'progress',
              { signal: abortController.signal },
            )) {
              yield {
                id: event.operationId,
                data: JSON.stringify(event),
              }
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              return
            }
            logRouteError(fastify.log, request, error, {
              message: 'SSE stream error',
              connectionId,
            })
          }
        })(),
      )
    },
  )
}

export default progressRoute
