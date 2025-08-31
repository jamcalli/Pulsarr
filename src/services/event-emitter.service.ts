import { EventEmitter } from 'node:events'
import type { ProgressEvent } from '@root/types/progress.types.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class ProgressService {
  private static instance: ProgressService
  private eventEmitter: EventEmitter
  private activeConnections: Set<string> = new Set()
  /** Creates a fresh service logger that inherits current log level */

  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'EVENT_EMITTER')
  }

  private constructor(
    private readonly baseLog: FastifyBaseLogger,
    readonly _fastify: FastifyInstance,
  ) {
    this.eventEmitter = new EventEmitter()
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
    this.log.debug({ event }, 'Emitting progress event')
    this.eventEmitter.emit('progress', event)
  }

  getEventEmitter() {
    return this.eventEmitter
  }

  hasActiveConnections(): boolean {
    return this.activeConnections.size > 0
  }
}
