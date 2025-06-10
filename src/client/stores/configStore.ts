import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { Config } from '@root/types/config.types'

export interface UserWatchlistInfo {
  id: string
  name: string
  apprise: string
  alias: string | null
  discord_id: string | null
  notify_apprise: boolean
  notify_discord: boolean
  notify_tautulli: boolean
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
  openUtilitiesAccordion: string | null

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
  updateUser: (
    userId: string,
    updates: Partial<UserWatchlistInfo>,
  ) => Promise<void>
  setOpenUtilitiesAccordion: (accordionId: string | null) => void
}

export const useConfigStore = create<ConfigState>()(
  devtools(
    persist(
      (set, get) => ({
        config: null,
        loading: true,
        error: null,
        isInitialized: false,
        users: null,
        selfWatchlistCount: null,
        othersWatchlistInfo: null,
        openUtilitiesAccordion: null,

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
              const selfUser = users.find((user) => Number(user.id) === 1)
              const otherUsers = users.filter((user) => Number(user.id) !== 1)

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

        updateUser: async (
          userId: string,
          updates: Partial<UserWatchlistInfo>,
        ) => {
          try {
            const response = await fetch(`/v1/users/users/${userId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: updates.name,
                apprise: updates.apprise,
                alias: updates.alias,
                discord_id: updates.discord_id,
                notify_apprise: updates.notify_apprise,
                notify_discord: updates.notify_discord,
                notify_tautulli: updates.notify_tautulli,
                can_sync: updates.can_sync,
              }),
            })

            if (!response.ok) {
              throw new Error('Failed to update user')
            }

            set((state) => ({
              users:
                state.users?.map((user) =>
                  user.id === userId ? { ...user, ...updates } : user,
                ) ?? null,
            }))

            await get().fetchUserData()
          } catch (error) {
            console.error('User update error:', error)
            throw error
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

        setOpenUtilitiesAccordion: (accordionId: string | null) => {
          set({ openUtilitiesAccordion: accordionId })
        },
      }),
      {
        name: 'config-storage',
        partialize: (state) => ({
          openUtilitiesAccordion: state.openUtilitiesAccordion,
        }),
      },
    ),
  ),
)
