import type { ProgressEvent } from '@root/types/progress.types.js'

class EventSourceManager {
  private static instance: EventSourceManager
  private eventSource: EventSource | null = null
  private operationCallbacks = new Map<
    string,
    Set<(event: ProgressEvent) => void>
  >()
  private typeCallbacks = new Map<string, Set<(event: ProgressEvent) => void>>()

  private constructor() {}

  static getInstance(): EventSourceManager {
    if (!EventSourceManager.instance) {
      EventSourceManager.instance = new EventSourceManager()
    }
    return EventSourceManager.instance
  }

  subscribeToOperation(
    operationId: string,
    callback: (event: ProgressEvent) => void,
  ): () => void {
    if (!this.operationCallbacks.has(operationId)) {
      this.operationCallbacks.set(operationId, new Set())
    }

    const callbacks = this.operationCallbacks.get(operationId)
    if (!callbacks) {
      throw new Error('Unexpected: callbacks set should exist')
    }

    callbacks.add(callback)

    if (!this.eventSource) {
      this.connect()
    }

    return () => {
      const callbacks = this.operationCallbacks.get(operationId)
      if (callbacks) {
        callbacks.delete(callback)
        if (callbacks.size === 0) {
          this.operationCallbacks.delete(operationId)
        }
      }

      if (this.operationCallbacks.size === 0 && this.typeCallbacks.size === 0) {
        this.disconnect()
      }
    }
  }

  subscribeToType(
    type: ProgressEvent['type'],
    callback: (event: ProgressEvent) => void,
  ): () => void {
    if (!this.typeCallbacks.has(type)) {
      this.typeCallbacks.set(type, new Set())
    }

    const callbacks = this.typeCallbacks.get(type)
    if (!callbacks) {
      throw new Error('Unexpected: callbacks set should exist')
    }

    callbacks.add(callback)

    if (!this.eventSource) {
      this.connect()
    }

    return () => {
      const callbacks = this.typeCallbacks.get(type)
      if (callbacks) {
        callbacks.delete(callback)
        if (callbacks.size === 0) {
          this.typeCallbacks.delete(type)
        }
      }

      if (this.operationCallbacks.size === 0 && this.typeCallbacks.size === 0) {
        this.disconnect()
      }
    }
  }

  private connect() {
    if (this.eventSource) return

    this.eventSource = new EventSource('/api/progress')

    this.eventSource.onmessage = (event) => {
      const data: ProgressEvent = JSON.parse(event.data)

      const operationCallbacks = this.operationCallbacks.get(data.operationId)
      if (operationCallbacks) {
        for (const callback of operationCallbacks) {
          callback(data)
        }
      }

      const typeCallbacks = this.typeCallbacks.get(data.type)
      if (typeCallbacks) {
        for (const callback of typeCallbacks) {
          callback(data)
        }
      }

      if (data.phase === 'complete') {
        setTimeout(() => {
          if (
            this.operationCallbacks.size === 0 &&
            this.typeCallbacks.size === 0
          ) {
            this.disconnect()
          }
        }, 1000)
      }
    }

    this.eventSource.onerror = () => {
      this.disconnect()
    }
  }

  private disconnect() {
    if (!this.eventSource) return
    this.eventSource.close()
    this.eventSource = null
  }

  isConnected(): boolean {
    return this.eventSource !== null
  }
}

export const eventSourceManager = EventSourceManager.getInstance()
