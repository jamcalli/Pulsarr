import { EventEmitter } from 'node:events'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { ProgressEvent } from '@root/types/progress.types.js'

export class ProgressService {
  private static instance: ProgressService
  private eventEmitter: EventEmitter
  private activeConnections: Set<string> = new Set()

  private constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.eventEmitter = new EventEmitter()
  }

  static getInstance(
    log: FastifyBaseLogger,
    fastify: FastifyInstance,
  ): ProgressService {
    if (!ProgressService.instance) {
      ProgressService.instance = new ProgressService(log, fastify)
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
