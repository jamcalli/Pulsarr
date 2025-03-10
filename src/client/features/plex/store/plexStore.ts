import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Config } from '@root/types/config.types'
import type { UserListWithCountsResponse } from '@root/schemas/users/users-list.schema'

type PlexUserType = UserListWithCountsResponse['users'][0];

interface PlexState {
  config: Config | null
  users: PlexUserType[] | null
  selfWatchlistInfo: PlexUserType | null
  othersWatchlistInfo: {
    users: PlexUserType[]
    totalCount: number
  } | null
  rssFeeds: {
    selfRss: string | null
    friendsRss: string | null
  }
  isInitialized: boolean
  isLoading: boolean
  error: string | null

  // Actions
  initialize: (force?: boolean) => Promise<void>
  fetchConfig: () => Promise<void>
  updateConfig: (updates: Partial<Config>) => Promise<void>
  
  // User operations
  fetchUserData: () => Promise<void>
  updateUser: (
    userId: number,
    updates: Partial<PlexUserType>,
  ) => Promise<void>
  
  // Watchlist operations
  refreshSelfWatchlist: () => Promise<void>
  refreshOthersWatchlist: () => Promise<void>
  refreshAllWatchlists: () => Promise<void>
  
  // RSS operations
  refreshRssFeeds: () => Promise<void>
  
  // Helpers
  setLoading: (loading: boolean) => void
}

export const usePlexStore = create<PlexState>()(
  devtools((set, get) => ({
    config: null,
    users: null,
    selfWatchlistInfo: null,
    othersWatchlistInfo: null,
    rssFeeds: {
      selfRss: null,
      friendsRss: null,
    },
    isInitialized: false,
    isLoading: false,
    error: null,

    setLoading: (loading) => {
      set({ isLoading: loading })
    },

    initialize: async (force = false) => {
      const state = get()
      if (!state.isInitialized || force) {
        set({ isLoading: true })
        try {
          await state.fetchConfig()

          const currentState = get()
          if (
            currentState.config?.plexTokens &&
            currentState.config.plexTokens.length > 0
          ) {
            await state.fetchUserData()
          }

          set({ isInitialized: true, error: null })
        } catch (error) {
          set({ error: 'Failed to initialize Plex configuration' })
          console.error('Plex initialization error:', error)
        } finally {
          set({ isLoading: false })
        }
      }
    },

    fetchConfig: async () => {
      try {
        const response = await fetch('/v1/config/config')
        const data = await response.json()
        if (data.success) {
          set((state) => ({
            ...state,
            config: {
              ...data.config,
            },
            rssFeeds: {
              selfRss: data.config.selfRss || null,
              friendsRss: data.config.friendsRss || null,
            },
            error: null,
          }))
        } else {
          throw new Error('Failed to fetch config')
        }
      } catch (err) {
        set({ error: 'Failed to load Plex configuration' })
        console.error('Config fetch error:', err)
      }
    },

    updateConfig: async (updates: Partial<Config>) => {
      set({ isLoading: true })
      try {
        const response = await fetch('/v1/config/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
        const data = await response.json()
        if (data.success) {
          set((state) => ({
            config: {
              ...state.config,
              ...data.config,
            },
            rssFeeds: {
              selfRss: data.config.selfRss || state.rssFeeds.selfRss,
              friendsRss: data.config.friendsRss || state.rssFeeds.friendsRss,
            },
          }))
        } else {
          throw new Error('Failed to update config')
        }
      } catch (err) {
        set({ error: 'Failed to update Plex configuration' })
        console.error('Config update error:', err)
        throw err
      } finally {
        set({ isLoading: false })
      }
    },

    fetchUserData: async () => {
      set({ isLoading: true })
      try {
        const response = await fetch('/v1/users/users/list/with-counts')
        const data = await response.json()

        if (data.success && data.users) {
          const users = data.users
          const selfUser = users.find((user: PlexUserType) => user.can_sync)
          const otherUsers = users.filter((user: PlexUserType) => !user.can_sync)

          set({
            users,
            selfWatchlistInfo: selfUser || null,
            othersWatchlistInfo:
              otherUsers.length > 0
                ? {
                    users: otherUsers,
                    totalCount: otherUsers.reduce(
                      (acc: number, user: PlexUserType) => acc + user.watchlist_count,
                      0,
                    ),
                  }
                : null,
          })
        } else {
          throw new Error('Failed to fetch user data')
        }
      } catch (err) {
        set({ error: 'Failed to fetch Plex user data' })
        console.error('User data fetch error:', err)
      } finally {
        set({ isLoading: false })
      }
    },

    updateUser: async (userId: number, updates: Partial<PlexUserType>) => {
      set({ isLoading: true })
      try {
        const response = await fetch(`/v1/users/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: updates.name,
            email: updates.email,
            alias: updates.alias,
            discord_id: updates.discord_id,
            notify_email: updates.notify_email,
            notify_discord: updates.notify_discord,
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
      } finally {
        set({ isLoading: false })
      }
    },

    refreshSelfWatchlist: async () => {
      set({ isLoading: true })
      try {
        const response = await fetch('/v1/plex/self-watchlist-token', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        })

        if (!response.ok) {
          throw new Error('Failed to sync self watchlist')
        }

        await get().fetchUserData()
      } catch (error) {
        console.error('Self watchlist sync error:', error)
        throw error
      } finally {
        set({ isLoading: false })
      }
    },

    refreshOthersWatchlist: async () => {
      set({ isLoading: true })
      try {
        const response = await fetch('/v1/plex/others-watchlist-token', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        })

        if (!response.ok) {
          throw new Error('Failed to sync others watchlist')
        }

        await get().fetchUserData()
      } catch (error) {
        console.error('Others watchlist sync error:', error)
        throw error
      } finally {
        set({ isLoading: false })
      }
    },

    refreshAllWatchlists: async () => {
      set({ isLoading: true })
      try {
        await Promise.all([
          get().refreshSelfWatchlist(),
          get().refreshOthersWatchlist(),
        ])
      } catch (error) {
        console.error('Watchlist refresh error:', error)
        throw error
      } finally {
        set({ isLoading: false })
      }
    },

    refreshRssFeeds: async () => {
      set({ isLoading: true })
      try {
        const response = await fetch('/v1/plex/generate-rss-feeds')
        const result = await response.json()

        if (response.ok && result.self && result.friends) {
          set({
            rssFeeds: {
              selfRss: result.self,
              friendsRss: result.friends,
            },
          })

          await get().updateConfig({
            selfRss: result.self,
            friendsRss: result.friends,
          })
          
          return { selfRss: result.self, friendsRss: result.friends }
        } else {
          throw new Error('Failed to generate RSS feeds')
        }
      } catch (err) {
        console.error('RSS generation error:', err)
        throw err
      } finally {
        set({ isLoading: false })
      }
    },
  })),
)