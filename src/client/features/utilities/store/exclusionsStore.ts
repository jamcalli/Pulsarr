import { MIN_LOADING_DELAY } from '@/lib/constants'
import {
  type CreateExclusionResponse,
  CreateExclusionResponseSchema,
  type GetExclusionsResponse,
  GetExclusionsResponseSchema,
} from '@root/schemas/exclusions/exclusions.schema'
import type { WatchlistExclusion } from '@root/types/exclusion.types'
import { z } from 'zod'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { api } from '@/lib/api'

export interface ExclusionWithUser extends WatchlistExclusion {
  username: string
}

export interface ExclusionsState {
  exclusions: ExclusionWithUser[]
  showDeleteConfirmation: number | null
  hasLoadedExclusions: boolean
  loading: {
    fetch: boolean
    create: boolean
    remove: Record<number, boolean>
  }
  error: {
    fetch: string | null
    create: string | null
    remove: string | null
  }

  // Actions
  fetchExclusions: (isRefresh?: boolean) => Promise<void>
  createExclusion: (key: string, userIds: number[]) => Promise<void>
  removeExclusion: (id: number) => Promise<void>
  setShowDeleteConfirmation: (id: number | null) => void
  resetErrors: () => void
}

const handleApiResponse = async <T>(
  response: Response,
  schema: z.ZodType<T> | null,
  defaultErrorMessage: string,
): Promise<T> => {
  if (!response.ok) {
    let errorMessage = defaultErrorMessage
    try {
      const errorData = await response.json()
      errorMessage = errorData.message || errorData.error || errorMessage
    } catch (_) {
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
    if (!schema) {
      return undefined as T
    }
    throw new Error(
      `${defaultErrorMessage}: Unexpected 204 response for operation expecting data`,
    )
  }

  try {
    const json = await response.json()

    if (schema) {
      return schema.parse(json)
    }

    return json as T
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('API response failed schema validation:', error.issues)
      throw new Error(`${defaultErrorMessage}: Invalid response format`)
    }

    throw new Error(
      `${defaultErrorMessage}: ${error instanceof Error ? error.message : 'JSON parsing failed'}`,
    )
  }
}

export const useExclusionsStore = create<ExclusionsState>()(
  devtools((set, get) => ({
    exclusions: [],
    showDeleteConfirmation: null,
    hasLoadedExclusions: false,
    loading: {
      fetch: false,
      create: false,
      remove: {},
    },
    error: {
      fetch: null,
      create: null,
      remove: null,
    },

    fetchExclusions: async (isRefresh = false) => {
      const isInitialLoad = !get().hasLoadedExclusions

      if (isInitialLoad || isRefresh) {
        set((state) => ({
          ...state,
          loading: { ...state.loading, fetch: true },
          error: { ...state.error, fetch: null },
        }))
      }

      try {
        const minimumLoadingTime =
          isInitialLoad || isRefresh
            ? new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
            : Promise.resolve()

        const responsePromise = fetch(api('/v1/exclusions/exclusions'))

        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        const data = await handleApiResponse<GetExclusionsResponse>(
          response,
          GetExclusionsResponseSchema,
          'Failed to fetch exclusions',
        )

        if (data.success) {
          set((state) => ({
            ...state,
            exclusions: data.exclusions,
            hasLoadedExclusions: true,
            loading: { ...state.loading, fetch: false },
          }))
        } else {
          throw new Error(data.message)
        }
      } catch (err) {
        console.error('Error fetching exclusions:', err)
        set((state) => ({
          ...state,
          hasLoadedExclusions: true,
          loading: { ...state.loading, fetch: false },
          error: {
            ...state.error,
            fetch:
              err instanceof Error
                ? err.message
                : 'Failed to fetch exclusions',
          },
        }))
        throw err
      }
    },

    createExclusion: async (key: string, userIds: number[]) => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, create: true },
        error: { ...state.error, create: null },
      }))

      try {
        const response = await fetch(api('/v1/exclusions/exclusions'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, userIds }),
        })

        const data = await handleApiResponse<CreateExclusionResponse>(
          response,
          CreateExclusionResponseSchema,
          'Failed to create exclusion',
        )

        if (!data.success) {
          throw new Error(data.message)
        }

        await get().fetchExclusions(true)

        set((state) => ({
          ...state,
          loading: { ...state.loading, create: false },
        }))
      } catch (err) {
        console.error('Error creating exclusion:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, create: false },
          error: {
            ...state.error,
            create:
              err instanceof Error
                ? err.message
                : 'Failed to create exclusion',
          },
        }))
        throw err
      }
    },

    removeExclusion: async (id: number) => {
      set((state) => ({
        ...state,
        loading: {
          ...state.loading,
          remove: { ...state.loading.remove, [id]: true },
        },
        error: { ...state.error, remove: null },
      }))

      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        const [response] = await Promise.all([
          fetch(api(`/v1/exclusions/exclusions/${id}`), { method: 'DELETE' }),
          minimumLoadingTime,
        ])

        await handleApiResponse<void>(
          response,
          null,
          'Failed to remove exclusion',
        )

        set((state) => ({
          ...state,
          exclusions: state.exclusions.filter((e) => e.id !== id),
          loading: {
            ...state.loading,
            remove: { ...state.loading.remove, [id]: false },
          },
          showDeleteConfirmation: null,
        }))
      } catch (err) {
        console.error('Error removing exclusion:', err)
        set((state) => ({
          ...state,
          loading: {
            ...state.loading,
            remove: { ...state.loading.remove, [id]: false },
          },
          error: {
            ...state.error,
            remove:
              err instanceof Error
                ? err.message
                : 'Failed to remove exclusion',
          },
        }))
        throw err
      }
    },

    setShowDeleteConfirmation: (id: number | null) => {
      set({ showDeleteConfirmation: id })
    },

    resetErrors: () => {
      set((state) => ({
        ...state,
        error: {
          fetch: null,
          create: null,
          remove: null,
        },
      }))
    },
  })),
)
