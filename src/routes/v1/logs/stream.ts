import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  type LogEntry,
  LogStreamQuerySchema,
  LogStreamResponseSchema,
} from '@schemas/logs/logs.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import { sseStream } from '@utils/sse-stream.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const logStreamRoute: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/stream',
    {
      schema: {
        summary: 'Stream log entries',
        operationId: 'streamLogs',
        description:
          'Server-Sent Events stream for real-time log entries. Establishes an SSE connection to receive tail lines and live updates from the application log file. Supports an optional text filter and an initial tail size.',
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
        return reply.serviceUnavailable('Log streaming service not available')
      }

      const logService = fastify.logStreaming
      const abortController = new AbortController()

      const streamOptions = { tail, follow, filter }
      logService.addConnection(connectionId, streamOptions)

      request.raw.once('close', () => {
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

      const emitter = logService.getEventEmitter()

      const matchesFilter = (entry: LogEntry) =>
        !filter || entry.message.toLowerCase().includes(filter.toLowerCase())

      // once() per call keeps logs lossy under pressure - entries arriving mid-yield drop instead of buffering against a slow client
      const nextLogEntry = async (): Promise<LogEntry | undefined> => {
        while (!abortController.signal.aborted) {
          const [entry] = (await once(emitter, 'log', {
            signal: abortController.signal,
          })) as [LogEntry]
          if (matchesFilter(entry)) {
            return entry
          }
        }
        return undefined
      }

      return reply.sse(
        (async function* source() {
          try {
            yield* sseStream<LogEntry>({
              signal: abortController.signal,
              replay:
                tail > 0
                  ? () => logService.getTailLines(tail, filter)
                  : undefined,
              next: follow ? nextLogEntry : async () => undefined,
              serialize: (entry) => ({
                id: randomUUID(),
                data: JSON.stringify(entry),
              }),
            })
          } catch (error) {
            logRouteError(fastify.log, request, error, {
              message: 'SSE stream error',
              connectionId,
            })
            throw error
          } finally {
            // Defensive: ensure the connection is removed on any exit path
            try {
              logService.removeConnection(connectionId)
            } catch (cleanupError) {
              fastify.log.debug(
                { cleanupError, connectionId },
                'Cleanup error removing log connection',
              )
            }
          }
        })(),
      )
    },
  )
}

export default logStreamRoute
