import {
  CleanupPlexLabelsResponseSchema,
  RemovePlexLabelsResponseSchema,
  SyncPlexLabelsResponseSchema,
} from '@root/schemas/labels/plex-labels.schema'
import type {
  DeleteSyncResult,
  JobStatus,
  ScheduleUpdate,
} from '@root/schemas/scheduler/scheduler.schema'
import type {
  RollingMonitoredShow,
  SessionMonitoringResult,
} from '@root/schemas/session-monitoring/session-monitoring.schema'
import {
  CleanupResponseSchema,
  CreateTaggingResponseSchema,
  RemoveTagsResponseSchema,
  SyncTaggingResponseSchema,
} from '@root/schemas/tags/user-tags.schema'
import { z } from 'zod'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// Use the existing schema type for the return type
export type TagRemovalResult = z.infer<typeof RemoveTagsResponseSchema>
export type PlexLabelRemovalResult = z.infer<
  typeof RemovePlexLabelsResponseSchema
>

// Minimum loading delay for consistent UX
const MIN_LOADING_DELAY = 500

export interface UtilitiesState {
  schedules: JobStatus[] | null
  deleteSyncDryRunResults: DeleteSyncResult | null
  isLoadingRef: boolean
  removeTagsResults: TagRemovalResult | null
  showDeleteTagsConfirmation: boolean
  removePlexLabelsResults: PlexLabelRemovalResult | null
  showDeletePlexLabelsConfirmation: boolean
  rollingShows: RollingMonitoredShow[] | null
  inactiveShows: RollingMonitoredShow[] | null
  sessionMonitoringResults: SessionMonitoringResult | null
  loading: {
    schedules: boolean
    deleteSyncDryRun: boolean
    runSchedule: boolean
    toggleSchedule: boolean
    saveSettings: boolean
    userTags: boolean
    createUserTags: boolean
    syncUserTags: boolean
    cleanupUserTags: boolean
    removeUserTags: boolean
    plexLabels: boolean
    syncPlexLabels: boolean
    cleanupPlexLabels: boolean
    removePlexLabels: boolean
    rollingShows: boolean
    inactiveShows: boolean
    sessionMonitor: boolean
    resetShow: boolean
    deleteShow: boolean
    resetInactiveShows: boolean
    updateSchedule: boolean
  }
  error: {
    schedules: string | null
    deleteSyncDryRun: string | null
    runSchedule: string | null
    toggleSchedule: string | null
    saveSettings: string | null
    userTags: string | null
    createUserTags: string | null
    syncUserTags: string | null
    cleanupUserTags: string | null
    removeUserTags: string | null
    plexLabels: string | null
    syncPlexLabels: string | null
    cleanupPlexLabels: string | null
    removePlexLabels: string | null
    rollingShows: string | null
    inactiveShows: string | null
    sessionMonitor: string | null
    resetShow: string | null
    deleteShow: string | null
    resetInactiveShows: string | null
    updateSchedule: string | null
  }
  hasLoadedSchedules: boolean

  // Loading state management
  setLoadingWithMinDuration: (loading: boolean) => void

  // Fetch functions
  fetchSchedules: () => Promise<void>
  runDryDeleteSync: () => Promise<void>
  runScheduleNow: (name: string) => Promise<boolean>
  toggleScheduleStatus: (name: string, enabled: boolean) => Promise<boolean>
  updateSchedule: (
    name: string,
    scheduleUpdate: ScheduleUpdate,
  ) => Promise<boolean>
  resetErrors: () => void

  // User tags functions
  createUserTags: () => Promise<z.infer<typeof CreateTaggingResponseSchema>>
  syncUserTags: () => Promise<z.infer<typeof SyncTaggingResponseSchema>>
  cleanupUserTags: () => Promise<z.infer<typeof CleanupResponseSchema>>
  setShowDeleteTagsConfirmation: (show: boolean) => void
  removeUserTags: (deleteTagDefinitions: boolean) => Promise<TagRemovalResult>

  // Plex labels functions
  syncPlexLabels: () => Promise<z.infer<typeof SyncPlexLabelsResponseSchema>>
  cleanupPlexLabels: () => Promise<
    z.infer<typeof CleanupPlexLabelsResponseSchema>
  >
  setShowDeletePlexLabelsConfirmation: (show: boolean) => void
  removePlexLabels: () => Promise<PlexLabelRemovalResult>

  // Session monitoring functions
  updateSessionMonitorSchedule: (
    scheduleName: string,
    intervalMinutes: number,
  ) => Promise<boolean>
  updateAutoResetSchedule: (
    scheduleName: string,
    intervalHours: number,
  ) => Promise<boolean>
  fetchRollingShows: () => Promise<void>
  fetchInactiveShows: (inactivityDays: number) => Promise<void>
  runSessionMonitor: () => Promise<SessionMonitoringResult>
  resetShow: (id: number) => Promise<{ success: boolean; message: string }>
  deleteShow: (id: number) => Promise<{ success: boolean; message: string }>
  resetInactiveShows: (
    inactivityDays: number,
  ) => Promise<{ success: boolean; message: string; resetCount: number }>
}

// Enhanced helper function to handle API responses with Zod schema validation
const handleApiResponse = async <T>(
  response: Response,
  schema: z.ZodType<T> | null, // Allow passing schema for validation
  defaultErrorMessage: string,
): Promise<T> => {
  if (!response.ok) {
    let errorMessage = defaultErrorMessage
    try {
      const errorData = await response.json()
      errorMessage = errorData.message || errorData.error || errorMessage
    } catch (_) {
      // If JSON parsing fails, try to get the response text
      try {
        const textError = await response.text()
        if (textError) {
          errorMessage = textError
        }
      } catch (_) {
        // Use default error message if both JSON and text extraction fail
      }
    }
    throw new Error(errorMessage)
  }

  if (response.status === 204) {
    // No content to parse, assume caller only cares about ok/error status
    // Cast to unknown as caller decides the expected void type
    return undefined as unknown as T
  }

  try {
    const json = await response.json()

    // Validate against schema if provided
    if (schema) {
      return schema.parse(json)
    }

    return json as T
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('API response failed schema validation:', error.errors)
      throw new Error(`${defaultErrorMessage}: Invalid response format`)
    }

    throw new Error(
      `${defaultErrorMessage}: ${error instanceof Error ? error.message : 'JSON parsing failed'}`,
    )
  }
}

export const useUtilitiesStore = create<UtilitiesState>()(
  devtools((set, get) => {
    // Generic API request function with loading states
    const apiRequest = async <
      T,
      B extends Record<string, unknown> = Record<string, unknown>,
    >(options: {
      url: string
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
      body?: B
      schema?: z.ZodType<T> | null
      loadingKey: keyof UtilitiesState['loading']
      errorKey: keyof UtilitiesState['error']
      defaultErrorMessage: string
      onSuccess?: (data: T) => void // Optional callback for successful requests
    }): Promise<T> => {
      const {
        url,
        method = 'GET',
        body,
        schema = null,
        loadingKey,
        errorKey,
        defaultErrorMessage,
        onSuccess,
      } = options

      // Update loading and error state
      set((state) => ({
        ...state,
        loading: { ...state.loading, [loadingKey]: true },
        error: { ...state.error, [errorKey]: null },
      }))

      try {
        // Create minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Configure fetch options
        const fetchOptions: RequestInit = {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        }

        // Execute fetch
        const [response] = await Promise.all([
          fetch(url, fetchOptions),
          minimumLoadingTime,
        ])

        // Process response with schema validation
        const data = await handleApiResponse<T>(
          response,
          schema,
          defaultErrorMessage,
        )

        // Reset loading state
        set((state) => ({
          ...state,
          loading: { ...state.loading, [loadingKey]: false },
        }))

        // Call onSuccess callback if provided
        if (onSuccess) {
          onSuccess(data)
        }

        return data
      } catch (err) {
        console.error(`Error during API request to ${url}:`, err)

        // Update error state
        set((state) => ({
          ...state,
          loading: { ...state.loading, [loadingKey]: false },
          error: {
            ...state.error,
            [errorKey]:
              err instanceof Error ? err.message : defaultErrorMessage,
          },
        }))

        throw err
      }
    }

    return {
      schedules: null,
      deleteSyncDryRunResults: null,
      hasLoadedSchedules: false,
      isLoadingRef: false,
      removeTagsResults: null,
      showDeleteTagsConfirmation: false,
      removePlexLabelsResults: null,
      showDeletePlexLabelsConfirmation: false,
      rollingShows: null,
      inactiveShows: null,
      sessionMonitoringResults: null,
      loading: {
        schedules: false,
        deleteSyncDryRun: false,
        runSchedule: false,
        toggleSchedule: false,
        saveSettings: false,
        userTags: false,
        createUserTags: false,
        syncUserTags: false,
        cleanupUserTags: false,
        removeUserTags: false,
        plexLabels: false,
        syncPlexLabels: false,
        cleanupPlexLabels: false,
        removePlexLabels: false,
        rollingShows: false,
        inactiveShows: false,
        sessionMonitor: false,
        resetShow: false,
        deleteShow: false,
        resetInactiveShows: false,
        updateSchedule: false,
      },
      error: {
        schedules: null,
        deleteSyncDryRun: null,
        runSchedule: null,
        toggleSchedule: null,
        saveSettings: null,
        userTags: null,
        createUserTags: null,
        syncUserTags: null,
        cleanupUserTags: null,
        removeUserTags: null,
        plexLabels: null,
        syncPlexLabels: null,
        cleanupPlexLabels: null,
        removePlexLabels: null,
        rollingShows: null,
        inactiveShows: null,
        sessionMonitor: null,
        resetShow: null,
        deleteShow: null,
        resetInactiveShows: null,
        updateSchedule: null,
      },

      // Loading state management that mimics your pattern in other components
      setLoadingWithMinDuration: (loading) => {
        const state = get()

        if (loading) {
          if (!state.isLoadingRef) {
            set({
              isLoadingRef: true,
              loading: { ...state.loading, saveSettings: true },
            })
          }
        } else {
          setTimeout(() => {
            set({
              isLoadingRef: false,
              loading: { ...state.loading, saveSettings: false },
            })
          }, 500)
        }
      },

      resetErrors: () => {
        set((state) => ({
          ...state,
          error: {
            schedules: null,
            deleteSyncDryRun: null,
            runSchedule: null,
            toggleSchedule: null,
            saveSettings: null,
            userTags: null,
            createUserTags: null,
            syncUserTags: null,
            cleanupUserTags: null,
            removeUserTags: null,
            plexLabels: null,
            syncPlexLabels: null,
            cleanupPlexLabels: null,
            removePlexLabels: null,
            rollingShows: null,
            inactiveShows: null,
            sessionMonitor: null,
            resetShow: null,
            deleteShow: null,
            resetInactiveShows: null,
            updateSchedule: null,
          },
        }))
      },

      fetchSchedules: async () => {
        // If we've already loaded schedules once and they're in memory,
        // don't show loading state on subsequent navigations
        const isInitialLoad = !get().hasLoadedSchedules

        if (isInitialLoad) {
          set((state) => ({
            ...state,
            loading: { ...state.loading, schedules: true },
            error: { ...state.error, schedules: null },
          }))
        }

        try {
          // For initial loads, set up a minimum loading time
          const minimumLoadingTime = isInitialLoad
            ? new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
            : Promise.resolve()

          // Fetch data
          const responsePromise = fetch('/v1/scheduler/schedules')

          // Wait for both the response and (if initial load) the minimum time
          const [response] = await Promise.all([
            responsePromise,
            minimumLoadingTime,
          ])

          const data = await handleApiResponse<JobStatus[]>(
            response,
            null, // No schema validation for now
            'Failed to fetch schedules',
          )

          set((state) => ({
            ...state,
            schedules: data,
            hasLoadedSchedules: true,
            loading: { ...state.loading, schedules: false },
          }))
        } catch (err) {
          console.error('Error fetching schedules:', err)
          set((state) => ({
            ...state,
            loading: { ...state.loading, schedules: false },
            error: {
              ...state.error,
              schedules: err instanceof Error ? err.message : 'Unknown error',
            },
          }))
        }
      },

      setShowDeleteTagsConfirmation: (show: boolean) => {
        set({ showDeleteTagsConfirmation: show })
      },

      // Remove user tags with proper typing using the imported schema
      removeUserTags: async (deleteTagDefinitions: boolean) => {
        return apiRequest<TagRemovalResult, { deleteTagDefinitions: boolean }>({
          url: '/v1/tags/remove',
          method: 'POST',
          body: { deleteTagDefinitions },
          schema: RemoveTagsResponseSchema,
          loadingKey: 'removeUserTags',
          errorKey: 'removeUserTags',
          defaultErrorMessage: 'Failed to remove user tags',
          onSuccess: (data) => {
            set((state) => ({
              ...state,
              removeTagsResults: data,
            }))
          },
        })
      },

      runDryDeleteSync: async () => {
        return apiRequest<{ results: DeleteSyncResult }>({
          url: '/v1/scheduler/schedules/delete-sync/dry-run',
          method: 'POST',
          loadingKey: 'deleteSyncDryRun',
          errorKey: 'deleteSyncDryRun',
          defaultErrorMessage: 'Failed to run delete sync dry run',
          onSuccess: (data) => {
            set((state) => ({
              ...state,
              deleteSyncDryRunResults: data.results,
            }))
          },
        })
      },

      runScheduleNow: async (name: string) => {
        try {
          const data = await apiRequest<{ success: boolean }>({
            url: `/v1/scheduler/schedules/${name}/run`,
            method: 'POST',
            loadingKey: 'runSchedule',
            errorKey: 'runSchedule',
            defaultErrorMessage: `Failed to run schedule ${name}`,
          })

          // Refresh schedules after running a job
          await get().fetchSchedules()

          return data.success
        } catch (_err) {
          return false
        }
      },

      toggleScheduleStatus: async (name: string, enabled: boolean) => {
        try {
          const data = await apiRequest<
            { success: boolean },
            { enabled: boolean }
          >({
            url: `/v1/scheduler/schedules/${name}/toggle`,
            method: 'PATCH',
            body: { enabled },
            loadingKey: 'toggleSchedule',
            errorKey: 'toggleSchedule',
            defaultErrorMessage: `Failed to toggle schedule ${name}`,
          })

          // Refresh schedules after toggling
          await get().fetchSchedules()

          return data.success
        } catch (_err) {
          return false
        }
      },

      updateSchedule: async (name: string, scheduleUpdate: ScheduleUpdate) => {
        try {
          const data = await apiRequest<{ success: boolean }, ScheduleUpdate>({
            url: `/v1/scheduler/schedules/${name}`,
            method: 'PUT',
            body: scheduleUpdate,
            schema: null, // No schema validation needed for response
            loadingKey: 'updateSchedule',
            errorKey: 'updateSchedule',
            defaultErrorMessage: `Failed to update schedule ${name}`,
          })

          // Refresh schedules after updating
          await get().fetchSchedules()

          return data.success
        } catch (_err) {
          return false
        }
      },

      // User Tags methods

      createUserTags: async () => {
        return apiRequest<z.infer<typeof CreateTaggingResponseSchema>>({
          url: '/v1/tags/create',
          method: 'POST',
          schema: CreateTaggingResponseSchema,
          loadingKey: 'createUserTags',
          errorKey: 'createUserTags',
          defaultErrorMessage: 'Failed to create user tags',
        })
      },

      syncUserTags: async () => {
        return apiRequest<z.infer<typeof SyncTaggingResponseSchema>>({
          url: '/v1/tags/sync',
          method: 'POST',
          schema: SyncTaggingResponseSchema,
          loadingKey: 'syncUserTags',
          errorKey: 'syncUserTags',
          defaultErrorMessage: 'Failed to sync user tags',
        })
      },

      cleanupUserTags: async () => {
        return apiRequest<z.infer<typeof CleanupResponseSchema>>({
          url: '/v1/tags/cleanup',
          method: 'POST',
          schema: CleanupResponseSchema,
          loadingKey: 'cleanupUserTags',
          errorKey: 'cleanupUserTags',
          defaultErrorMessage: 'Failed to clean up user tags',
        })
      },

      setShowDeletePlexLabelsConfirmation: (show: boolean) => {
        set({ showDeletePlexLabelsConfirmation: show })
      },

      // Plex Labels methods

      syncPlexLabels: async () => {
        return apiRequest<z.infer<typeof SyncPlexLabelsResponseSchema>>({
          url: '/v1/labels/sync',
          method: 'POST',
          schema: SyncPlexLabelsResponseSchema,
          loadingKey: 'syncPlexLabels',
          errorKey: 'syncPlexLabels',
          defaultErrorMessage: 'Failed to sync plex labels',
        })
      },

      cleanupPlexLabels: async () => {
        return apiRequest<z.infer<typeof CleanupPlexLabelsResponseSchema>>({
          url: '/v1/labels/cleanup',
          method: 'POST',
          schema: CleanupPlexLabelsResponseSchema,
          loadingKey: 'cleanupPlexLabels',
          errorKey: 'cleanupPlexLabels',
          defaultErrorMessage: 'Failed to clean up plex labels',
        })
      },

      removePlexLabels: async () => {
        return apiRequest<PlexLabelRemovalResult>({
          url: '/v1/labels/remove',
          method: 'DELETE',
          schema: RemovePlexLabelsResponseSchema,
          loadingKey: 'removePlexLabels',
          errorKey: 'removePlexLabels',
          defaultErrorMessage: 'Failed to remove Pulsarr labels',
          onSuccess: (data) => {
            set((state) => ({
              ...state,
              removePlexLabelsResults: data,
            }))
          },
        })
      },

      // Session Monitoring methods

      updateSessionMonitorSchedule: async (
        scheduleName: string,
        intervalMinutes: number,
      ) =>
        get().updateSchedule(scheduleName, {
          type: 'interval',
          config: { minutes: intervalMinutes },
        }),

      updateAutoResetSchedule: async (
        scheduleName: string,
        intervalHours: number,
      ) =>
        get().updateSchedule(scheduleName, {
          type: 'interval',
          config: { hours: intervalHours },
        }),

      fetchRollingShows: async () => {
        return apiRequest<{ success: boolean; shows: RollingMonitoredShow[] }>({
          url: '/v1/session-monitoring/rolling-monitored',
          method: 'GET',
          loadingKey: 'rollingShows',
          errorKey: 'rollingShows',
          defaultErrorMessage: 'Failed to fetch rolling shows',
          onSuccess: (data) => {
            set((state) => ({
              ...state,
              rollingShows: data.shows,
            }))
          },
        })
      },

      fetchInactiveShows: async (inactivityDays: number) => {
        return apiRequest<{
          success: boolean
          shows: RollingMonitoredShow[]
          inactivityDays: number
        }>({
          url: `/v1/session-monitoring/rolling-monitored/inactive?inactivityDays=${inactivityDays}`,
          method: 'GET',
          loadingKey: 'inactiveShows',
          errorKey: 'inactiveShows',
          defaultErrorMessage: 'Failed to fetch inactive shows',
          onSuccess: (data) => {
            set((state) => ({
              ...state,
              inactiveShows: data.shows,
            }))
          },
        })
      },

      runSessionMonitor: async () => {
        return apiRequest<{
          success: boolean
          result: SessionMonitoringResult
        }>({
          url: '/v1/session-monitoring/run',
          method: 'POST',
          loadingKey: 'sessionMonitor',
          errorKey: 'sessionMonitor',
          defaultErrorMessage: 'Failed to run session monitor',
          onSuccess: (data) => {
            set((state) => ({
              ...state,
              sessionMonitoringResults: data.result,
            }))
          },
        }).then((response) => response.result)
      },

      resetShow: async (id: number) => {
        return apiRequest<{ success: boolean; message: string }>({
          url: `/v1/session-monitoring/rolling-monitored/${id}/reset`,
          method: 'POST',
          loadingKey: 'resetShow',
          errorKey: 'resetShow',
          defaultErrorMessage: 'Failed to reset show',
          onSuccess: () => {
            // Refresh rolling shows after reset
            get().fetchRollingShows()
          },
        })
      },

      deleteShow: async (id: number) => {
        return apiRequest<{ success: boolean; message: string }>({
          url: `/v1/session-monitoring/rolling-monitored/${id}`,
          method: 'DELETE',
          loadingKey: 'deleteShow',
          errorKey: 'deleteShow',
          defaultErrorMessage: 'Failed to delete show',
          onSuccess: () => {
            // Refresh rolling shows after deletion
            get().fetchRollingShows()
          },
        })
      },

      resetInactiveShows: async (inactivityDays: number) => {
        return apiRequest<
          { success: boolean; message: string; resetCount: number },
          { inactivityDays: number }
        >({
          url: '/v1/session-monitoring/rolling-monitored/reset-inactive',
          method: 'POST',
          body: { inactivityDays },
          loadingKey: 'resetInactiveShows',
          errorKey: 'resetInactiveShows',
          defaultErrorMessage: 'Failed to reset inactive shows',
          onSuccess: () => {
            // Refresh both rolling and inactive shows after reset
            get().fetchRollingShows()
            get().fetchInactiveShows(inactivityDays)
          },
        })
      },
    }
  }),
)
