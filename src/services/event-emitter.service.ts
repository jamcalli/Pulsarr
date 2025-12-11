import { EventEmitter } from 'node:events'
import type { ProgressEvent } from '@root/types/progress.types.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class ProgressService {
  private static instance: ProgressService
  private eventEmitter: EventEmitter
  private activeConnections: Set<string> = new Set()
  private readonly log: FastifyBaseLogger

  private constructor(
    readonly baseLog: FastifyBaseLogger,
    readonly _fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'EVENT_EMITTER')
    this.eventEmitter = new EventEmitter()
    // Allow many concurrent SSE consumers without warnings
    this.eventEmitter.setMaxListeners(100)
  }

  static getInstance(
    baseLog: FastifyBaseLogger,
    fastify: FastifyInstance,
  ): ProgressService {
    if (!ProgressService.instance) {
      ProgressService.instance = new ProgressService(baseLog, fastify)
    }
    return ProgressService.instance
  }

  addConnection(id: string) {
    this.activeConnections.add(id)
    this.log.debug(`Adding progress connection: ${id}`)
  }

  removeConnection(id: string) {
    this.activeConnections.delete(id)
    this.log.debug(`Removing progress connection: ${id}`)
  }

  emit(event: ProgressEvent) {
    this.log.trace({ event }, 'Emitting progress event')
    this.eventEmitter.emit('progress', event)
  }

  getEventEmitter() {
    return this.eventEmitter
  }

  hasActiveConnections(): boolean {
    return this.activeConnections.size > 0
  }
}
