import { EventEmitter } from 'node:events'
import type {
  EventStreamService,
  LogEvent,
  ProgressEvent,
  StreamEvent,
} from '@root/types/progress.types.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class EventStreamServiceImpl implements EventStreamService {
  private static instance: EventStreamServiceImpl
  private eventEmitter: EventEmitter
  private activeConnections: Set<string> = new Set()

  private constructor(
    private readonly log: FastifyBaseLogger,
    readonly _fastify: FastifyInstance,
  ) {
    this.eventEmitter = new EventEmitter()
  }

  static getInstance(
    log: FastifyBaseLogger,
    fastify: FastifyInstance,
  ): EventStreamServiceImpl {
    if (!EventStreamServiceImpl.instance) {
      EventStreamServiceImpl.instance = new EventStreamServiceImpl(log, fastify)
    }
    return EventStreamServiceImpl.instance
  }

  addConnection(id: string) {
    this.activeConnections.add(id)
    this.log.debug(`Adding stream connection: ${id}`)
  }

  removeConnection(id: string) {
    this.activeConnections.delete(id)
    this.log.debug(`Removing stream connection: ${id}`)
  }

  emitProgress(event: ProgressEvent) {
    this.log.debug({ event }, 'Emitting progress event')
    const streamEvent: StreamEvent = { eventType: 'progress', ...event }
    this.eventEmitter.emit('stream', streamEvent)
  }

  emitLog(event: LogEvent) {
    if (this.hasActiveConnections()) {
      this.log.debug({ event }, 'Emitting log event')
      const streamEvent: StreamEvent = { eventType: 'log', ...event }
      this.eventEmitter.emit('stream', streamEvent)
    }
  }

  // Legacy method for backward compatibility
  emit(event: ProgressEvent) {
    this.emitProgress(event)
  }

  getEventEmitter() {
    return this.eventEmitter
  }

  hasActiveConnections(): boolean {
    return this.activeConnections.size > 0
  }
}

// Export with legacy name for backward compatibility
export const ProgressService = EventStreamServiceImpl
