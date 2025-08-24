import { randomUUID } from 'node:crypto'
import { on } from 'node:events'
import {
  ProgressStreamResponseSchema,
  type StreamQuerystring,
  StreamQuerystringSchema,
} from '@schemas/progress/progress.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const progressRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: StreamQuerystring
    Reply: z.infer<typeof ProgressStreamResponseSchema>
  }>(
    '/',
    {
      schema: {
        summary: 'Stream progress and log events',
        operationId: 'streamEvents',
        description:
          'Server-Sent Events stream for real-time progress and log updates. This endpoint establishes an SSE connection to receive progress updates for various operations like watchlist syncing, delete sync analysis, etc., as well as application log events.',
        querystring: StreamQuerystringSchema,
        response: {
          200: ProgressStreamResponseSchema,
        },
        tags: ['Progress', 'Logs'],
      },
    },
    async (request, reply) => {
      const connectionId = randomUUID()
      const progressService = fastify.progress
      const abortController = new AbortController()

      // Parse query parameters with proper types
      const { events: enabledEvents, logLevel: minLogLevel } = request.query

      const logLevels = [
        'fatal',
        'error',
        'warn',
        'info',
        'debug',
        'trace',
      ] as const
      const minLevelIndex = logLevels.indexOf(minLogLevel)

      progressService.addConnection(connectionId)

      request.socket.once('close', () => {
        abortController.abort(new Error('client disconnected'))
        try {
          progressService.removeConnection(connectionId)
        } catch (error) {
          logRouteError(fastify.log, request, error, {
            message: 'Failed to remove stream connection',
            connectionId,
          })
        }
      })

      return reply.sse(
        (async function* source() {
          try {
            for await (const [event] of on(
              progressService.getEventEmitter(),
              'stream',
              { signal: abortController.signal },
            )) {
              // Filter events based on query parameters
              if (
                event.eventType === 'progress' &&
                enabledEvents.includes('progress')
              ) {
                yield {
                  id: event.operationId,
                  data: JSON.stringify(event),
                }
              } else if (
                event.eventType === 'log' &&
                enabledEvents.includes('log')
              ) {
                // Filter by log level
                const eventLevelIndex = logLevels.indexOf(event.level)
                if (eventLevelIndex <= minLevelIndex) {
                  yield {
                    id: `log-${Date.now()}`,
                    data: JSON.stringify(event),
                  }
                }
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
