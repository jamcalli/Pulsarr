import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Config } from '@root/types/config.types'

export type LogLevel =
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'trace'
  | 'silent'

interface ConfigResponse {
  success: boolean
  config: Config
}

interface ConfigState {
  // State
  config: Config | null
  loading: boolean
  error: string | null
  isInitialized: boolean

  // Actions
  initialize: (force?: boolean) => Promise<void>
  updateConfig: (updates: Partial<Config>) => Promise<void>
  fetchConfig: () => Promise<void>
}

export const useConfigStore = create<ConfigState>()(
  devtools((set, get) => ({
    // Initial state
    config: null,
    loading: true,
    error: null,
    isInitialized: false,

    fetchConfig: async () => {
      try {
        const response = await fetch('/v1/config/config')
        const data: ConfigResponse = await response.json()
        if (data.success) {
          set({ config: data.config })
        } else {
          throw new Error('Failed to fetch config')
        }
      } catch (err) {
        set({ error: 'Failed to load configuration' })
        console.error('Config fetch error:', err)
      }
    },

    updateConfig: async (updates: Partial<Config>) => {
      set({ loading: true })
      try {
        const response = await fetch('/v1/config/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
        const data: ConfigResponse = await response.json()
        if (data.success) {
          set({ config: data.config })
        } else {
          throw new Error('Failed to update config')
        }
      } catch (err) {
        set({ error: 'Failed to update configuration' })
        console.error('Config update error:', err)
        throw err
      } finally {
        set({ loading: false })
      }
    },

    initialize: async (force = false) => {
      const state = get()
      if (!state.isInitialized || force) {
        try {
          await state.fetchConfig()
          set({ isInitialized: true })
        } catch (error) {
          set({ error: 'Failed to initialize config' })
          console.error('Config initialization error:', error)
        }
      }
    },
  })),
)
