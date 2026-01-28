import type { ProgressEvent } from '@root/types/progress.types.js'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { api } from '@/lib/api'
import {
  calculateRetryDelay,
  handleSseError,
  MAX_SSE_RECONNECT_ATTEMPTS,
} from '@/lib/sse-retry'

interface ProgressState {
  eventSource: EventSource | null
  isConnected: boolean
  isConnecting: boolean
  reconnectTimeout: ReturnType<typeof setTimeout> | null
  reconnectAttempts: number
  hasGivenUp: boolean
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
    reconnectAttempts: 0,
    hasGivenUp: false,
    operationSubscribers: new Map(),
    typeSubscribers: new Map(),

    initialize: () => {
      const state = get()

      if (state.eventSource || state.isConnecting || state.hasGivenUp) return

      set({ isConnecting: true })
      console.log('Initializing persistent EventSource connection')

      const eventSource = new EventSource(api('/v1/progress'))

      eventSource.onopen = () => {
        console.log('EventSource connection established')
        set({
          isConnected: true,
          isConnecting: false,
          reconnectAttempts: 0,
          hasGivenUp: false,
        })
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

        // Immediately close to prevent browser auto-reconnect interference
        eventSource.close()

        const currentState = get()

        // Clear any existing reconnect timeout
        if (currentState.reconnectTimeout) {
          clearTimeout(currentState.reconnectTimeout)
        }

        set({
          eventSource: null,
          isConnected: false,
          // Keep isConnecting true to block new subscribers from calling initialize
          reconnectTimeout: null,
        })

        // Handle error with auth check and retry logic
        handleSseError(currentState.reconnectAttempts)
          .then(({ shouldRetry, newAttempts }) => {
            set({ reconnectAttempts: newAttempts })

            if (shouldRetry) {
              const delay = calculateRetryDelay(newAttempts)

              console.log(
                `Progress SSE reconnecting in ${Math.ceil(delay / 1000)}s (attempt ${newAttempts}/${MAX_SSE_RECONNECT_ATTEMPTS})`,
              )

              const timeout = setTimeout(() => {
                const latestState = get()
                if (
                  !latestState.eventSource &&
                  !latestState.isConnecting &&
                  !latestState.hasGivenUp
                ) {
                  latestState.initialize()
                }
                set({ reconnectTimeout: null })
              }, delay)

              set({ reconnectTimeout: timeout })
            } else {
              set({ isConnecting: false, hasGivenUp: true })
            }
          })
          .catch((err) => {
            console.warn('SSE auth check failed; falling back to retry', err)
            const newAttempts = currentState.reconnectAttempts + 1
            set({ reconnectAttempts: newAttempts })

            if (newAttempts <= MAX_SSE_RECONNECT_ATTEMPTS) {
              const delay = calculateRetryDelay(newAttempts)

              console.log(
                `Progress SSE reconnecting in ${Math.ceil(delay / 1000)}s (attempt ${newAttempts}/${MAX_SSE_RECONNECT_ATTEMPTS})`,
              )

              const timeout = setTimeout(() => {
                const latestState = get()
                if (
                  !latestState.eventSource &&
                  !latestState.isConnecting &&
                  !latestState.hasGivenUp
                ) {
                  latestState.initialize()
                }
                set({ reconnectTimeout: null })
              }, delay)

              set({ reconnectTimeout: timeout })
            } else {
              set({ isConnecting: false, hasGivenUp: true })
            }
          })
      }

      set({ eventSource })
    },

    cleanup: () => {
      const state = get()

      console.log('Cleaning up EventSource connection')
      if (state.eventSource) {
        state.eventSource.close()
      }

      // Clear any pending reconnect timeout
      if (state.reconnectTimeout) {
        clearTimeout(state.reconnectTimeout)
      }

      set({
        eventSource: null,
        isConnected: false,
        isConnecting: false,
        reconnectTimeout: null,
        reconnectAttempts: 0,
        hasGivenUp: false,
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
        // Reset if we had given up, since a new subscriber wants data
        if (currentState.hasGivenUp) {
          set({ hasGivenUp: false, reconnectAttempts: 0 })
        }
        get().initialize()
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
        // Reset if we had given up, since a new subscriber wants data
        if (currentState.hasGivenUp) {
          set({ hasGivenUp: false, reconnectAttempts: 0 })
        }
        get().initialize()
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
