import { Writable } from 'node:stream'
import type { LogEvent } from '@root/types/progress.types.js'
import type { EventStreamServiceImpl } from '@services/event-emitter.service.js'
import {
  createErrorSerializer,
  createRequestSerializer,
} from '@utils/logger.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import pino from 'pino'

class LogEventStream extends Writable {
  constructor(private readonly eventService: EventStreamServiceImpl) {
    super({ objectMode: true })
  }

  _write(
    chunk: Record<string, unknown>,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      if (!this.eventService.hasActiveConnections()) {
        callback()
        return
      }

      // Extract module name from chunk properties or stack trace
      const getModuleName = (): string | undefined => {
        const chunkData = chunk as Record<string, unknown>
        if (typeof chunkData.module === 'string') return chunkData.module
        if (typeof chunkData.name === 'string') return chunkData.name
        if (typeof chunkData.stack === 'string') {
          const match = chunkData.stack.match(/at\s+(?:.*\s+)?\(?([^)]+):/)
          if (match?.[1]) {
            const path = match[1]
            const segments = path.split('/')
            return segments[segments.length - 1]
              ?.replace('.js', '')
              .replace('.ts', '')
          }
        }
        return undefined
      }

      // Create log event from Pino log entry
      const chunkData = chunk as Record<string, unknown>
      const logEvent: LogEvent = {
        timestamp: new Date().toISOString(),
        level: chunkData.level as LogEvent['level'],
        message: (chunkData.msg ||
          chunkData.message ||
          'Unknown message') as string,
        metadata: {
          module: getModuleName(),
          ...(typeof (chunkData.req as { id?: string })?.id === 'string'
            ? { requestId: (chunkData.req as { id: string }).id }
            : {}),
          ...(typeof chunkData.userId === 'number'
            ? { userId: chunkData.userId }
            : {}),
          // Include any additional properties except standard Pino fields
          ...Object.fromEntries(
            Object.entries(chunkData).filter(
              ([key]) =>
                ![
                  'level',
                  'time',
                  'pid',
                  'hostname',
                  'msg',
                  'message',
                  'v',
                  'req',
                  'userId',
                ].includes(key),
            ),
          ),
        },
      }

      this.eventService.emitLog(logEvent)
      callback()
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)))
    }
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    // Add log streaming to existing logger after progress plugin is registered
    const eventService = fastify.progress as EventStreamServiceImpl

    if (eventService) {
      // Create a new stream that includes SSE logging
      const logEventStream = new LogEventStream(eventService)

      // Add the SSE stream to the existing logger by creating a new multistream
      const streams = [
        { stream: process.stdout }, // Default stream
        { stream: logEventStream }, // SSE stream
      ]

      const newMultistream = pino.multistream(streams)

      // Replace the logger with a new one that includes SSE streaming
      const newLogger = pino.default(
        {
          level: fastify.log.level,
          serializers: {
            req: createRequestSerializer(),
            error: createErrorSerializer(),
          },
        },
        newMultistream,
      )

      // Copy log methods to new logger (preserving existing functionality)
      fastify.log = newLogger as typeof fastify.log

      fastify.log.info('Log streaming enabled for SSE clients')
    }
  },
  {
    name: 'log-streaming',
    dependencies: ['progress'],
  },
)
