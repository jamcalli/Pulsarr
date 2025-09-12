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

      if (!fastify.progress) {
        return reply.serviceUnavailable(
          'Progress streaming service not available',
        )
      }

      const progressService = fastify.progress
      const abortController = new AbortController()

      progressService.addConnection(connectionId)

      request.raw.once('close', () => {
        abortController.abort(new Error('client disconnected'))
        try {
          progressService.removeConnection(connectionId)
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
            throw error
          } finally {
            // Defensive: ensure the connection is removed on any exit path
            try {
              progressService.removeConnection(connectionId)
            } catch {}
          }
        })(),
      )
    },
  )
}

export default progressRoute
