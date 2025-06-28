import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { Config } from '@root/types/config.types'
import type { UserWithCount } from '@root/schemas/users/users-list.schema'
import type {
  UserQuotasResponseSchema,
  QuotaStatusResponseSchema,
} from '@root/schemas/quota/quota.schema'
import type { z } from 'zod'

export type UserWatchlistInfo = UserWithCount

export type UserQuotas = z.infer<typeof UserQuotasResponseSchema>
export type QuotaStatusResponse = z.infer<typeof QuotaStatusResponseSchema>

export type UserWithQuotaInfo = UserWatchlistInfo & {
  userQuotas: UserQuotas | null
}

// Cache timestamps to prevent unnecessary refetches
let lastUserDataFetch = 0
let lastQuotaDataFetch = 0
const CACHE_DURATION = 5000 // 5 seconds

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
  usersWithQuota: UserWithQuotaInfo[] | null
  userQuotasMap: Map<number, UserQuotas | null>
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
  fetchQuotaData: () => Promise<void>
  refreshQuotaData: () => Promise<void>
  getSelfWatchlistInfo: () => UserWatchlistInfo | null
  getOthersWatchlistInfo: () => {
    users: UserWatchlistInfo[]
    totalCount: number
  } | null
  updateUser: (
    userId: number,
    updates: Partial<UserWatchlistInfo>,
  ) => Promise<void>
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
        usersWithQuota: null,
        userQuotasMap: new Map(),
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
          // Check if we've fetched recently
          const now = Date.now()
          if (now - lastUserDataFetch < CACHE_DURATION) {
            return
          }

          lastUserDataFetch = now
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

              // Fetch quota data after user data is loaded
              await get().fetchQuotaData()
            } else {
              throw new Error('Failed to fetch user data')
            }
          } catch (err) {
            set({ error: 'Failed to fetch user data' })
            console.error('User data fetch error:', err)
          }
        },

        fetchQuotaData: async () => {
          const state = get()
          if (!state.users || state.users.length === 0) {
            return
          }

          // Check if we've fetched recently
          const now = Date.now()
          if (now - lastQuotaDataFetch < CACHE_DURATION) {
            return
          }

          lastQuotaDataFetch = now
          try {
            // Use bulk endpoints instead of individual calls
            const userQuotasMap = new Map<number, UserQuotas | null>()
            const userIds = state.users.map((user) => user.id)

            // 1. Fetch all quota configurations in one call
            const quotaConfigsResponse = await fetch('/v1/quota/users')
            let quotaConfigs: UserQuotas[] = []
            if (quotaConfigsResponse.ok) {
              const quotaConfigsData = await quotaConfigsResponse.json()
              if (quotaConfigsData.success && quotaConfigsData.userQuotas) {
                quotaConfigs = quotaConfigsData.userQuotas
              }
            }

            // 2. Fetch all movie quota statuses in one call
            let movieStatuses: Record<number, QuotaStatusResponse> = {}
            try {
              const movieStatusResponse = await fetch(
                '/v1/quota/users/status/bulk',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userIds, contentType: 'movie' }),
                },
              )
              if (movieStatusResponse.ok) {
                const movieStatusData = await movieStatusResponse.json()
                if (movieStatusData.success && movieStatusData.quotaStatuses) {
                  // Convert array response to object mapping userId to quotaStatus
                  movieStatuses = movieStatusData.quotaStatuses.reduce(
                    (
                      acc: Record<number, QuotaStatusResponse>,
                      item: {
                        userId: number
                        quotaStatus: QuotaStatusResponse | null
                      },
                    ) => {
                      if (item.quotaStatus) {
                        acc[item.userId] = item.quotaStatus
                      }
                      return acc
                    },
                    {},
                  )
                }
              }
            } catch (e) {
              console.warn('Failed to fetch bulk movie quota statuses:', e)
            }

            // 3. Fetch all show quota statuses in one call
            let showStatuses: Record<number, QuotaStatusResponse> = {}
            try {
              const showStatusResponse = await fetch(
                '/v1/quota/users/status/bulk',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userIds, contentType: 'show' }),
                },
              )
              if (showStatusResponse.ok) {
                const showStatusData = await showStatusResponse.json()
                if (showStatusData.success && showStatusData.quotaStatuses) {
                  // Convert array response to object mapping userId to quotaStatus
                  showStatuses = showStatusData.quotaStatuses.reduce(
                    (
                      acc: Record<number, QuotaStatusResponse>,
                      item: {
                        userId: number
                        quotaStatus: QuotaStatusResponse | null
                      },
                    ) => {
                      if (item.quotaStatus) {
                        acc[item.userId] = item.quotaStatus
                      }
                      return acc
                    },
                    {},
                  )
                }
              }
            } catch (e) {
              console.warn('Failed to fetch bulk show quota statuses:', e)
            }

            // 4. Combine configurations with statuses
            for (const user of state.users) {
              const userQuotaConfig = quotaConfigs.find(
                (q) => q.userId === user.id,
              )

              if (userQuotaConfig) {
                const userQuotas = { ...userQuotaConfig }

                // Merge movie quota status
                if (userQuotas.movieQuota && movieStatuses[user.id]) {
                  userQuotas.movieQuota = {
                    ...userQuotas.movieQuota,
                    currentUsage: movieStatuses[user.id].currentUsage,
                    exceeded: movieStatuses[user.id].exceeded,
                    resetDate: movieStatuses[user.id].resetDate,
                  }
                }

                // Merge show quota status
                if (userQuotas.showQuota && showStatuses[user.id]) {
                  userQuotas.showQuota = {
                    ...userQuotas.showQuota,
                    currentUsage: showStatuses[user.id].currentUsage,
                    exceeded: showStatuses[user.id].exceeded,
                    resetDate: showStatuses[user.id].resetDate,
                  }
                }

                userQuotasMap.set(user.id, userQuotas)
              } else {
                userQuotasMap.set(user.id, null)
              }
            }

            // Create users with quota data
            const usersWithQuota: UserWithQuotaInfo[] = state.users.map(
              (user) => ({
                ...user,
                userQuotas: userQuotasMap.get(user.id) || null,
              }),
            )

            set({
              userQuotasMap,
              usersWithQuota,
            })
          } catch (err) {
            console.error('Quota data fetch error:', err)
            // Don't set error state for quota failures, just log
          }
        },

        refreshQuotaData: async () => {
          await get().fetchQuotaData()
        },

        updateUser: async (
          userId: number,
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
                requires_approval: updates.requires_approval,
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
      }),
      {
        name: 'config-storage',
        partialize: (state) => ({}),
      },
    ),
  ),
)
