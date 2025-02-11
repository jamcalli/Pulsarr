import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ProgressEvent } from '@root/types/progress.types.js'

interface ProgressState {
  eventSource: EventSource | null
  isConnected: boolean
  operationSubscribers: Map<string, Set<(event: ProgressEvent) => void>>
  typeSubscribers: Map<string, Set<(event: ProgressEvent) => void>>

  // Actions
  connect: () => void
  disconnect: () => void
  subscribeToOperation: (
    operationId: string,
    callback: (event: ProgressEvent) => void,
  ) => () => void
  subscribeToType: (
    type: ProgressEvent['type'],
    callback: (event: ProgressEvent) => void,
  ) => () => void
}

export const useProgressStore = create<ProgressState>()(
  devtools((set, get) => ({
    eventSource: null,
    isConnected: false,
    operationSubscribers: new Map(),
    typeSubscribers: new Map(),

    connect: () => {
      const state = get()
      if (state.eventSource) return

      const eventSource = new EventSource('/api/progress')

      eventSource.onmessage = (event) => {
        const data: ProgressEvent = JSON.parse(event.data)
        const state = get()

        const operationCallbacks = state.operationSubscribers.get(
          data.operationId,
        )
        if (operationCallbacks) {
          for (const callback of operationCallbacks) {
            callback(data)
          }
        }

        const typeCallbacks = state.typeSubscribers.get(data.type)
        if (typeCallbacks) {
          for (const callback of typeCallbacks) {
            callback(data)
          }
        }

        if (data.phase === 'complete') {
          setTimeout(() => {
            if (
              state.operationSubscribers.size === 0 &&
              state.typeSubscribers.size === 0
            ) {
              state.disconnect()
            }
          }, 1000)
        }
      }

      eventSource.onerror = () => {
        get().disconnect()
      }

      set({ eventSource, isConnected: true })
    },

    disconnect: () => {
      const state = get()
      if (!state.eventSource) return

      state.eventSource.close()
      set({ eventSource: null, isConnected: false })
    },

    subscribeToOperation: (operationId, callback) => {
      const state = get()

      if (!state.operationSubscribers.has(operationId)) {
        state.operationSubscribers.set(operationId, new Set())
      }

      const callbacks = state.operationSubscribers.get(operationId)
      if (!callbacks) {
        throw new Error('Unexpected: callbacks set should exist')
      }

      callbacks.add(callback)

      if (!state.eventSource) {
        state.connect()
      }

      return () => {
        const state = get()
        const callbacks = state.operationSubscribers.get(operationId)

        if (callbacks) {
          callbacks.delete(callback)
          if (callbacks.size === 0) {
            state.operationSubscribers.delete(operationId)
          }
        }

        if (
          state.operationSubscribers.size === 0 &&
          state.typeSubscribers.size === 0
        ) {
          state.disconnect()
        }
      }
    },

    subscribeToType: (type, callback) => {
      const state = get()

      if (!state.typeSubscribers.has(type)) {
        state.typeSubscribers.set(type, new Set())
      }

      const callbacks = state.typeSubscribers.get(type)
      if (!callbacks) {
        throw new Error('Unexpected: callbacks set should exist')
      }

      callbacks.add(callback)

      if (!state.eventSource) {
        state.connect()
      }

      return () => {
        const state = get()
        const callbacks = state.typeSubscribers.get(type)

        if (callbacks) {
          callbacks.delete(callback)
          if (callbacks.size === 0) {
            state.typeSubscribers.delete(type)
          }
        }

        if (
          state.operationSubscribers.size === 0 &&
          state.typeSubscribers.size === 0
        ) {
          state.disconnect()
        }
      }
    },
  })),
)
