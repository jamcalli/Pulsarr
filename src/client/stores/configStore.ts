import type {
  QuotaStatusResponse,
  UserQuotaResponse,
} from '@root/schemas/quota/quota.schema'
import type { MeResponse } from '@root/schemas/users/me.schema'
import type { UserWithCount } from '@root/schemas/users/users-list.schema'
import type { Config } from '@root/types/config.types'
import type { z } from 'zod'
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { plexUserSchema } from '@/features/plex/store/schemas'

export type UserWatchlistInfo = UserWithCount

// Type for quota with both config and status data
type QuotaWithStatus = UserQuotaResponse & {
  currentUsage?: number
  exceeded?: boolean
  resetDate?: string | null
}

// Custom type for user quotas that includes status data
export type UserQuotas = {
  userId: number
  movieQuota?: QuotaWithStatus
  showQuota?: QuotaWithStatus
}

export type UserWithQuotaInfo = UserWatchlistInfo & {
  userQuotas: UserQuotas | null
}

export type CurrentUser = MeResponse['user']

// Cache timestamps to prevent unnecessary refetches
let lastUserDataFetch = 0
let lastQuotaDataFetch = 0
let lastCurrentUserFetch = 0
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

type CurrentUserResponse = MeResponse

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
  currentUser: CurrentUser | null
  currentUserLoading: boolean
  currentUserError: string | null

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
    updates: z.input<typeof plexUserSchema>,
  ) => Promise<void>
  fetchCurrentUser: () => Promise<void>
  refreshCurrentUser: () => Promise<void>
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
        currentUser: null,
        currentUserLoading: false,
        currentUserError: null,

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

            // Fetch all quota data in parallel for maximum performance
            const [quotaConfigsResult, movieStatusResult, showStatusResult] =
              await Promise.allSettled([
                // 1. Fetch all quota configurations
                fetch('/v1/quota/users'),

                // 2. Fetch all movie quota statuses
                fetch('/v1/quota/users/status/bulk', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userIds, contentType: 'movie' }),
                }),

                // 3. Fetch all show quota statuses
                fetch('/v1/quota/users/status/bulk', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userIds, contentType: 'show' }),
                }),
              ])

            // Process quota configurations - group by user
            const quotaConfigsByUser = new Map<
              number,
              {
                movieQuota?: QuotaWithStatus
                showQuota?: QuotaWithStatus
              }
            >()
            if (
              quotaConfigsResult.status === 'fulfilled' &&
              quotaConfigsResult.value.ok
            ) {
              try {
                const quotaConfigsData = await quotaConfigsResult.value.json()
                if (quotaConfigsData.success && quotaConfigsData.userQuotas) {
                  // Group flat configs by user and content type
                  for (const config of quotaConfigsData.userQuotas) {
                    if (!quotaConfigsByUser.has(config.userId)) {
                      quotaConfigsByUser.set(config.userId, {})
                    }
                    const userConfigs = quotaConfigsByUser.get(config.userId)
                    if (!userConfigs) continue

                    if (config.contentType === 'movie') {
                      userConfigs.movieQuota = {
                        userId: config.userId,
                        contentType: config.contentType,
                        quotaType: config.quotaType,
                        quotaLimit: config.quotaLimit,
                        bypassApproval: config.bypassApproval,
                      }
                    } else if (config.contentType === 'show') {
                      userConfigs.showQuota = {
                        userId: config.userId,
                        contentType: config.contentType,
                        quotaType: config.quotaType,
                        quotaLimit: config.quotaLimit,
                        bypassApproval: config.bypassApproval,
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn('Failed to parse quota configurations:', e)
              }
            }

            // Process movie quota statuses
            let movieStatuses: Record<number, QuotaStatusResponse> = {}
            if (
              movieStatusResult.status === 'fulfilled' &&
              movieStatusResult.value.ok
            ) {
              try {
                const movieStatusData = await movieStatusResult.value.json()
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
              } catch (e) {
                console.warn('Failed to parse movie quota statuses:', e)
              }
            } else if (movieStatusResult.status === 'rejected') {
              console.warn(
                'Failed to fetch bulk movie quota statuses:',
                movieStatusResult.reason,
              )
            }

            // Process show quota statuses
            let showStatuses: Record<number, QuotaStatusResponse> = {}
            if (
              showStatusResult.status === 'fulfilled' &&
              showStatusResult.value.ok
            ) {
              try {
                const showStatusData = await showStatusResult.value.json()
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
              } catch (e) {
                console.warn('Failed to parse show quota statuses:', e)
              }
            } else if (showStatusResult.status === 'rejected') {
              console.warn(
                'Failed to fetch bulk show quota statuses:',
                showStatusResult.reason,
              )
            }

            // 4. Combine configurations with statuses
            for (const user of state.users) {
              const userQuotaConfig = quotaConfigsByUser.get(user.id)

              if (userQuotaConfig) {
                const userQuotas: UserQuotas = {
                  userId: user.id,
                  movieQuota: userQuotaConfig.movieQuota,
                  showQuota: userQuotaConfig.showQuota,
                }

                // Merge movie quota status into movieQuota object (like develop branch)
                if (userQuotas.movieQuota && movieStatuses[user.id]) {
                  const movieStatus = movieStatuses[user.id]
                  userQuotas.movieQuota.currentUsage = movieStatus.currentUsage
                  userQuotas.movieQuota.exceeded = movieStatus.exceeded
                  userQuotas.movieQuota.resetDate = movieStatus.resetDate
                }

                // Merge show quota status into showQuota object (like develop branch)
                if (userQuotas.showQuota && showStatuses[user.id]) {
                  const showStatus = showStatuses[user.id]
                  userQuotas.showQuota.currentUsage = showStatus.currentUsage
                  userQuotas.showQuota.exceeded = showStatus.exceeded
                  userQuotas.showQuota.resetDate = showStatus.resetDate
                }

                userQuotasMap.set(user.id, userQuotas)
              } else {
                userQuotasMap.set(user.id, null)
              }
            }

            // Create users with quota data (status is now merged into quota objects)
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
          updates: z.input<typeof plexUserSchema>,
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

        fetchCurrentUser: async () => {
          // Check if we've fetched recently
          const now = Date.now()
          if (now - lastCurrentUserFetch < CACHE_DURATION) {
            return
          }

          lastCurrentUserFetch = now
          set({ currentUserLoading: true, currentUserError: null })

          try {
            const response = await fetch('/v1/users/me', {
              credentials: 'include',
            })

            if (!response.ok) {
              if (response.status === 401) {
                throw new Error('Authentication required')
              }
              throw new Error('Failed to fetch current user')
            }

            const data: CurrentUserResponse = await response.json()

            if (data.success) {
              set({
                currentUser: data.user,
                currentUserLoading: false,
                currentUserError: null,
              })
            } else {
              throw new Error(data.message || 'Failed to fetch current user')
            }
          } catch (err) {
            const errorMessage =
              err instanceof Error
                ? err.message
                : 'Failed to fetch current user'
            set({
              currentUser: null,
              currentUserLoading: false,
              currentUserError: errorMessage,
            })
            console.error('Current user fetch error:', err)
          }
        },

        refreshCurrentUser: async () => {
          lastCurrentUserFetch = 0 // Reset cache
          await get().fetchCurrentUser()
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
        partialize: () => ({}),
      },
    ),
  ),
)
