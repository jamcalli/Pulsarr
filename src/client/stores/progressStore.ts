import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ProgressEvent } from '@root/types/progress.types.js'

interface ProgressState {
  eventSource: EventSource | null
  isConnected: boolean
  operationSubscribers: Map<string, Set<(event: ProgressEvent) => void>>
  typeSubscribers: Map<string, Set<(event: ProgressEvent) => void>>

  // Actions
  initialize: () => void
  cleanup: () => void
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

    initialize: () => {
      const state = get()
      if (state.eventSource) {
        console.log('EventSource already initialized')
        return
      }

      console.log('Initializing persistent EventSource connection')

      const eventSource = new EventSource('/api/progress')

      eventSource.onopen = () => {
        console.log('EventSource connection established')
        set({ isConnected: true })
      }

      eventSource.onmessage = (event) => {
        const data: ProgressEvent = JSON.parse(event.data)
        const state = get()

        // Handle operation subscribers
        const operationCallbacks = state.operationSubscribers.get(
          data.operationId,
        )
        if (operationCallbacks) {
          for (const callback of operationCallbacks) {
            callback(data)
          }
        }

        // Handle type subscribers
        const typeCallbacks = state.typeSubscribers.get(data.type)
        if (typeCallbacks) {
          for (const callback of typeCallbacks) {
            callback(data)
          }
        }
      }

      eventSource.onerror = (err) => {
        console.error('EventSource error:', err)
        setTimeout(() => {
          const currentState = get()
          if (currentState.eventSource === eventSource) {
            console.log('Reconnecting EventSource after error')
            currentState.cleanup()
            currentState.initialize()
          }
        }, 2000)
      }

      set({ eventSource, isConnected: true })
    },

    cleanup: () => {
      const state = get()
      if (!state.eventSource) return

      console.log('Cleaning up EventSource connection')
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
        state.initialize()
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
        state.initialize()
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
      }
    },
  })),
)
