import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface ProgressEvent {
  operationId: string
  phase: string
  progress: number
  message: string
}

interface ProgressState {
  eventSource: EventSource | null
  isConnected: boolean
  subscribers: Map<string, Set<(event: ProgressEvent) => void>>
  
  // Actions
  connect: () => void
  disconnect: () => void
  subscribe: (operationId: string, callback: (event: ProgressEvent) => void) => () => void
}

export const useProgressStore = create<ProgressState>()(
  devtools((set, get) => ({
    eventSource: null,
    isConnected: false,
    subscribers: new Map(),

    connect: () => {
      const state = get()
      if (state.eventSource) return

      const eventSource = new EventSource('/api/progress')
      
      eventSource.onmessage = (event) => {
        const data: ProgressEvent = JSON.parse(event.data)
        const state = get()
        const callbacks = state.subscribers.get(data.operationId)
        
        if (callbacks) {
          callbacks.forEach(callback => callback(data))
        }
        
        if (data.phase === 'complete') {
          setTimeout(() => {
            state.disconnect()
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

    subscribe: (operationId, callback) => {
      const state = get()
      
      if (!state.subscribers.has(operationId)) {
        state.subscribers.set(operationId, new Set())
      }
      
      const callbacks = state.subscribers.get(operationId)!
      callbacks.add(callback)
      
      if (!state.eventSource) {
        state.connect()
      }

      return () => {
        const state = get()
        const callbacks = state.subscribers.get(operationId)
        
        if (callbacks) {
          callbacks.delete(callback)
          if (callbacks.size === 0) {
            state.subscribers.delete(operationId)
          }
        }

        if (state.subscribers.size === 0) {
          state.disconnect()
        }
      }
    }
  }))
)