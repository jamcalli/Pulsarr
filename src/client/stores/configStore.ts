import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Config } from '@root/types/config.types'

interface UserWatchlistInfo {
  id: string
  name: string
  email: string
  alias: string | null
  discord_id: string | null
  notify_email: boolean
  notify_discord: boolean
  can_sync: boolean
  created_at: string
  updated_at: string
  watchlist_count: number
}

interface UserListResponse {
  success: boolean
  message: string
  users: UserWatchlistInfo[]
}

interface ConfigResponse {
  success: boolean
  config: Config
}

interface ConfigState {
  config: Config | null
  loading: boolean
  error: string | null
  isInitialized: boolean
  users: UserWatchlistInfo[] | null
  selfWatchlistCount: number | null
  othersWatchlistInfo: {
    userCount: number
    totalItems: number
  } | null

  initialize: (force?: boolean) => Promise<void>
  updateConfig: (updates: Partial<Config>) => Promise<void>
  fetchConfig: () => Promise<void>
  refreshRssFeeds: () => Promise<void>

  fetchUserData: () => Promise<void>
  getSelfWatchlistInfo: () => UserWatchlistInfo | null
  getOthersWatchlistInfo: () => {
    users: UserWatchlistInfo[]
    totalCount: number
  } | null
}

export const useConfigStore = create<ConfigState>()(
  devtools((set, get) => ({
    config: null,
    loading: true,
    error: null,
    isInitialized: false,
    users: null,
    selfWatchlistCount: null,
    othersWatchlistInfo: null,

    fetchConfig: async () => {
      try {
        const response = await fetch('/v1/config/config')
        const data: ConfigResponse = await response.json()
        if (data.success) {
          set((state) => ({
            ...state,
            config: {
              ...data.config,
            },
            error: null,
          }))
        } else {
          throw new Error('Failed to fetch config')
        }
      } catch (err) {
        set({ error: 'Failed to load configuration' })
        console.error('Config fetch error:', err)
      }
    },

    refreshRssFeeds: async () => {
      try {
        const response = await fetch('/v1/plex/generate-rss-feeds')
        const result = await response.json()

        if (response.ok && result.self && result.friends) {
          await get().updateConfig({
            selfRss: result.self,
            friendsRss: result.friends,
          })
          return { selfRss: result.self, friendsRss: result.friends }
        }
      } catch (err) {
        console.error('RSS generation error:', err)
        throw err
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
          set((state) => ({
            config: {
              ...state.config,
              ...data.config,
            },
          }))
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

    fetchUserData: async () => {
      try {
        const response = await fetch('/v1/users/users/list/with-counts')
        const data: UserListResponse = await response.json()

        if (data.success && data.users) {
          const users = data.users
          const selfUser = users.find((user) => user.can_sync)
          const otherUsers = users.filter((user) => !user.can_sync)

          set({
            users,
            selfWatchlistCount: selfUser?.watchlist_count ?? null,
            othersWatchlistInfo:
              otherUsers.length > 0
                ? {
                    userCount: otherUsers.length,
                    totalItems: otherUsers.reduce(
                      (acc, user) => acc + user.watchlist_count,
                      0,
                    ),
                  }
                : null,
          })
        } else {
          throw new Error('Failed to fetch user data')
        }
      } catch (err) {
        set({ error: 'Failed to fetch user data' })
        console.error('User data fetch error:', err)
      }
    },

    getSelfWatchlistInfo: () => {
      const state = get()
      return state.users?.find((user) => Number(user.id) === 1) ?? null
    },

    getOthersWatchlistInfo: () => {
      const state = get()
      const otherUsers =
        state.users?.filter((user) => Number(user.id) !== 1) ?? []

      return otherUsers.length > 0
        ? {
            users: otherUsers,
            totalCount: otherUsers.reduce(
              (acc, user) => acc + (user.watchlist_count || 0),
              0,
            ),
          }
        : null
    },

    initialize: async (force = false) => {
      const state = get()
      if (!state.isInitialized || force) {
        try {
          await state.fetchConfig()

          const currentState = get()
          if (
            currentState.config?.plexTokens &&
            currentState.config.plexTokens.length > 0
          ) {
            await state.fetchUserData()
          }

          set({ isInitialized: true })
        } catch (error) {
          set({ error: 'Failed to initialize config' })
          console.error('Config initialization error:', error)
        }
      }
    },
  })),
)
