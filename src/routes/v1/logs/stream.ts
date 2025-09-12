import { randomUUID } from 'node:crypto'
import { on } from 'node:events'
import {
  type LogEntry,
  LogStreamQuerySchema,
  LogStreamResponseSchema,
} from '@schemas/logs/logs.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const logStreamRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: z.infer<typeof LogStreamQuerySchema>
    Reply: z.infer<typeof LogStreamResponseSchema>
  }>(
    '/stream',
    {
      schema: {
        summary: 'Stream log entries',
        operationId: 'streamLogs',
        description:
          'Server-Sent Events stream for real-time log entries. This endpoint establishes an SSE connection to receive log entries from the application log file. The requested log level dynamically adjusts the runtime logger level to ensure all requested logs are captured. Supports filtering by level, text content, and initial tail lines.',
        querystring: LogStreamQuerySchema,
        response: {
          200: LogStreamResponseSchema,
        },
        tags: ['Logs'],
      },
    },
    async (request, reply) => {
      const connectionId = randomUUID()
      const { tail, follow, filter } = request.query

      if (!fastify.logStreaming) {
        return reply.internalServerError('Log streaming service not available')
      }

      const logService = fastify.logStreaming
      const abortController = new AbortController()

      const streamOptions = { tail, follow, filter }
      logService.addConnection(connectionId, streamOptions)

      request.socket.once('close', () => {
        abortController.abort(new Error('client disconnected'))
        try {
          logService.removeConnection(connectionId)
        } catch (error) {
          logRouteError(fastify.log, request, error, {
            message: 'Failed to remove log streaming connection',
            connectionId,
          })
        }
      })

      return reply.sse(
        (async function* source() {
          try {
            // First, send historical log entries if tail > 0
            if (tail > 0) {
              const tailEntries = await logService.getTailLines(tail, filter)

              for (const entry of tailEntries) {
                yield {
                  id: randomUUID(),
                  data: JSON.stringify(entry),
                }
              }
            }

            // Then stream live entries if follow is enabled
            if (follow) {
              for await (const [entry] of on(
                logService.getEventEmitter(),
                'log',
                { signal: abortController.signal },
              )) {
                const logEntry = entry as LogEntry

                // Apply text filter if provided
                if (
                  filter &&
                  !logEntry.message.toLowerCase().includes(filter.toLowerCase())
                ) {
                  continue
                }

                yield {
                  id: randomUUID(),
                  data: JSON.stringify(logEntry),
                }
              }
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              return
            }
            logRouteError(fastify.log, request, error, {
              message: 'SSE log stream error',
              connectionId,
            })
            throw error
          }
        })(),
      )
    },
  )
}

export default logStreamRoute
