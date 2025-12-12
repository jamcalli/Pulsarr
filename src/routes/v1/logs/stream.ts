import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  type LogEntry,
  LogStreamQuerySchema,
  LogStreamResponseSchema,
} from '@schemas/logs/logs.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

// Keep-alive interval in milliseconds (30 seconds)
const KEEP_ALIVE_INTERVAL = 30_000

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
              const emitter = logService.getEventEmitter()

              while (!abortController.signal.aborted) {
                // Use a per-iteration AbortController for the once() call
                // This prevents listener accumulation when keep-alive wins the race
                const iterationAbort = new AbortController()

                // Named handler so we can remove it after each iteration
                const onConnectionAbort = () => iterationAbort.abort()
                abortController.signal.addEventListener(
                  'abort',
                  onConnectionAbort,
                )

                // Race between log event and keep-alive timeout
                const logPromise = once(emitter, 'log', {
                  signal: iterationAbort.signal,
                })

                let keepAliveTimer: NodeJS.Timeout | null = null
                const keepAlivePromise = new Promise<'keepalive'>((resolve) => {
                  keepAliveTimer = setTimeout(
                    () => resolve('keepalive'),
                    KEEP_ALIVE_INTERVAL,
                  )
                })

                let result: Awaited<typeof logPromise> | 'keepalive'
                try {
                  result = await Promise.race([logPromise, keepAlivePromise])
                } finally {
                  // Always clean up to prevent listener accumulation
                  abortController.signal.removeEventListener(
                    'abort',
                    onConnectionAbort,
                  )
                  if (keepAliveTimer) {
                    clearTimeout(keepAliveTimer)
                  }
                }

                if (result === 'keepalive') {
                  // Abort the once() listener to prevent accumulation
                  iterationAbort.abort()
                  // Send SSE comment as keep-alive (not visible to client as data)
                  yield { comment: 'keep-alive' }
                  continue
                }

                // Got a log entry
                const logEntry = result[0] as LogEntry

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
              message: 'SSE stream error',
              connectionId,
            })
            throw error
          } finally {
            // Defensive: ensure the connection is removed on any exit path
            try {
              logService.removeConnection(connectionId)
            } catch {}
          }
        })(),
      )
    },
  )
}

export default logStreamRoute
