import type { ProgressEvent } from '@root/types/progress.types.js'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ProgressState {
  eventSource: EventSource | null
  isConnected: boolean
  isConnecting: boolean
  reconnectTimeout: ReturnType<typeof setTimeout> | null
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
    isConnecting: false,
    reconnectTimeout: null,
    operationSubscribers: new Map(),
    typeSubscribers: new Map(),

    initialize: () => {
      const state = get()

      if (state.eventSource || state.isConnecting) return

      set({ isConnecting: true })
      console.log('Initializing persistent EventSource connection')

      const eventSource = new EventSource('/v1/progress')

      eventSource.onopen = () => {
        console.log('EventSource connection established')
        set({ isConnected: true, isConnecting: false })
      }

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
      }

      eventSource.onerror = (err) => {
        console.error('EventSource error:', err)
        set({ isConnected: false, isConnecting: false })
        // Debounce reconnect
        const currentState = get()
        if (!currentState.reconnectTimeout) {
          const timeout = setTimeout(() => {
            const latestState = get()
            if (latestState.eventSource === eventSource) {
              console.log('Reconnecting EventSource after error')
              latestState.cleanup()
              latestState.initialize()
            }
            set({ reconnectTimeout: null })
          }, 2000)
          set({ reconnectTimeout: timeout })
        }
      }

      set({ eventSource })
    },

    cleanup: () => {
      const state = get()
      if (!state.eventSource) return

      console.log('Cleaning up EventSource connection')
      state.eventSource.close()

      // Clear any pending reconnect timeout
      if (state.reconnectTimeout) {
        clearTimeout(state.reconnectTimeout)
      }

      set({
        eventSource: null,
        isConnected: false,
        isConnecting: false,
        reconnectTimeout: null,
      })
    },

    subscribeToOperation: (operationId, callback) => {
      set((state) => {
        const newOperationSubscribers = new Map(state.operationSubscribers)

        if (!newOperationSubscribers.has(operationId)) {
          newOperationSubscribers.set(operationId, new Set())
        }

        const callbacks = newOperationSubscribers.get(operationId)
        if (!callbacks) return { operationSubscribers: newOperationSubscribers }
        const newCallbacks = new Set(callbacks)
        newCallbacks.add(callback)
        newOperationSubscribers.set(operationId, newCallbacks)

        return { operationSubscribers: newOperationSubscribers }
      })

      const currentState = get()
      if (!currentState.eventSource && !currentState.isConnecting) {
        currentState.initialize()
      }

      return () => {
        set((state) => {
          const newOperationSubscribers = new Map(state.operationSubscribers)
          const callbacks = newOperationSubscribers.get(operationId)

          if (callbacks) {
            const newCallbacks = new Set(callbacks)
            newCallbacks.delete(callback)

            if (newCallbacks.size === 0) {
              newOperationSubscribers.delete(operationId)
            } else {
              newOperationSubscribers.set(operationId, newCallbacks)
            }
          }

          return { operationSubscribers: newOperationSubscribers }
        })
      }
    },

    subscribeToType: (type, callback) => {
      set((state) => {
        const newTypeSubscribers = new Map(state.typeSubscribers)

        if (!newTypeSubscribers.has(type)) {
          newTypeSubscribers.set(type, new Set())
        }

        const callbacks = newTypeSubscribers.get(type)
        if (!callbacks) return { typeSubscribers: newTypeSubscribers }
        const newCallbacks = new Set(callbacks)
        newCallbacks.add(callback)
        newTypeSubscribers.set(type, newCallbacks)

        return { typeSubscribers: newTypeSubscribers }
      })

      const currentState = get()
      if (!currentState.eventSource && !currentState.isConnecting) {
        currentState.initialize()
      }

      return () => {
        set((state) => {
          const newTypeSubscribers = new Map(state.typeSubscribers)
          const callbacks = newTypeSubscribers.get(type)

          if (callbacks) {
            const newCallbacks = new Set(callbacks)
            newCallbacks.delete(callback)

            if (newCallbacks.size === 0) {
              newTypeSubscribers.delete(type)
            } else {
              newTypeSubscribers.set(type, newCallbacks)
            }
          }

          return { typeSubscribers: newTypeSubscribers }
        })
      }
    },
  })),
)
