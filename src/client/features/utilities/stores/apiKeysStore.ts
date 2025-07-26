import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { z } from 'zod'
import {
  CreateApiKeyResponseSchema,
  GetApiKeysResponseSchema,
  type CreateApiKey,
  type CreateApiKeyResponse,
  type GetApiKeysResponse,
} from '@root/schemas/api-keys/api-keys.schema'
import type { ApiKey } from '@root/types/api-key.types'
import { MIN_LOADING_DELAY } from '@root/client/features/plex/store/constants'

export interface ApiKeysState {
  apiKeys: ApiKey[]
  visibleKeys: Record<number, boolean>
  showDeleteConfirmation: number | null
  hasLoadedApiKeys: boolean
  loading: {
    fetch: boolean
    create: boolean
    revoke: Record<number, boolean>
  }
  error: {
    fetch: string | null
    create: string | null
    revoke: string | null
  }

  // Actions
  fetchApiKeys: (isRefresh?: boolean) => Promise<void>
  createApiKey: (data: CreateApiKey) => Promise<CreateApiKeyResponse>
  revokeApiKey: (id: number) => Promise<void>
  toggleKeyVisibility: (id: number) => void
  setShowDeleteConfirmation: (id: number | null) => void
  resetErrors: () => void
}

// Enhanced helper function to handle API responses with Zod schema validation
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

  // Handle 204 No Content responses (typically for DELETE operations)
  if (response.status === 204) {
    // Only return undefined for void operations (no schema expected)
    if (!schema) {
      return undefined as T
    }
    throw new Error(
      `${defaultErrorMessage}: Unexpected 204 response for operation expecting data`,
    )
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

export const useApiKeysStore = create<ApiKeysState>()(
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
      loadingKey: keyof ApiKeysState['loading'] | string
      errorKey: keyof ApiKeysState['error']
      defaultErrorMessage: string
      onSuccess?: (data: T) => void
      itemId?: number // For per-item loading states like revoke/toggleStatus
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
        itemId,
      } = options

      // Update loading and error state
      set((state) => {
        const newState = { ...state }

        // Handle per-item loading states
        if (itemId !== undefined && loadingKey === 'revoke') {
          newState.loading = {
            ...state.loading,
            [loadingKey]: { ...state.loading.revoke, [itemId]: true },
          }
        } else {
          newState.loading = {
            ...state.loading,
            [loadingKey]: true,
          }
        }

        newState.error = { ...state.error, [errorKey]: null }
        return newState
      })

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
        set((state) => {
          const newState = { ...state }

          // Handle per-item loading states
          if (itemId !== undefined && loadingKey === 'revoke') {
            newState.loading = {
              ...state.loading,
              [loadingKey]: { ...state.loading.revoke, [itemId]: false },
            }
          } else {
            newState.loading = {
              ...state.loading,
              [loadingKey]: false,
            }
          }

          return newState
        })

        // Call onSuccess callback if provided
        if (onSuccess) {
          onSuccess(data)
        }

        return data
      } catch (err) {
        console.error(`Error during API request to ${url}:`, err)

        // Update error state
        set((state) => {
          const newState = { ...state }

          // Handle per-item loading states
          if (itemId !== undefined && loadingKey === 'revoke') {
            newState.loading = {
              ...state.loading,
              [loadingKey]: { ...state.loading.revoke, [itemId]: false },
            }
          } else {
            newState.loading = {
              ...state.loading,
              [loadingKey]: false,
            }
          }

          newState.error = {
            ...state.error,
            [errorKey]:
              err instanceof Error ? err.message : defaultErrorMessage,
          }

          return newState
        })

        throw err
      }
    }

    return {
      apiKeys: [],
      visibleKeys: {},
      showDeleteConfirmation: null,
      hasLoadedApiKeys: false,
      loading: {
        fetch: false,
        create: false,
        revoke: {},
      },
      error: {
        fetch: null,
        create: null,
        revoke: null,
      },

      fetchApiKeys: async (isRefresh = false) => {
        // If we've already loaded API keys once and they're in memory,
        // don't show loading state on subsequent navigations
        const isInitialLoad = !get().hasLoadedApiKeys

        if (isInitialLoad || isRefresh) {
          set((state) => ({
            ...state,
            loading: { ...state.loading, fetch: true },
            error: { ...state.error, fetch: null },
          }))
        }

        try {
          // For initial loads or refresh, set up a minimum loading time
          const minimumLoadingTime =
            isInitialLoad || isRefresh
              ? new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
              : Promise.resolve()

          // Fetch data
          const responsePromise = fetch('/v1/api-keys/api-keys')

          // Wait for both the response and (if initial load) the minimum time
          const [response] = await Promise.all([
            responsePromise,
            minimumLoadingTime,
          ])

          const data = await handleApiResponse<GetApiKeysResponse>(
            response,
            GetApiKeysResponseSchema,
            'Failed to fetch API keys',
          )

          if (data.success) {
            set((state) => ({
              ...state,
              apiKeys: data.apiKeys,
              hasLoadedApiKeys: true,
              loading: { ...state.loading, fetch: false },
            }))
          } else {
            throw new Error(data.message)
          }
        } catch (err) {
          console.error('Error fetching API keys:', err)
          set((state) => ({
            ...state,
            loading: { ...state.loading, fetch: false },
            error: {
              ...state.error,
              fetch:
                err instanceof Error ? err.message : 'Failed to fetch API keys',
            },
          }))
          throw err
        }
      },

      createApiKey: async (data: CreateApiKey) => {
        return apiRequest<CreateApiKeyResponse, CreateApiKey>({
          url: '/v1/api-keys/api-keys',
          method: 'POST',
          body: data,
          schema: CreateApiKeyResponseSchema,
          loadingKey: 'create',
          errorKey: 'create',
          defaultErrorMessage: 'Failed to create API key',
          onSuccess: (response) => {
            if (response.success && response.apiKey) {
              set((state) => ({
                ...state,
                apiKeys: [...state.apiKeys, response.apiKey],
                // Show the newly created key by default
                visibleKeys: {
                  ...state.visibleKeys,
                  [response.apiKey.id]: true,
                },
              }))
            }
          },
        })
      },

      revokeApiKey: async (id: number) => {
        return apiRequest<void>({
          url: `/v1/api-keys/api-keys/${id}`,
          method: 'DELETE',
          loadingKey: 'revoke',
          errorKey: 'revoke',
          defaultErrorMessage: 'Failed to revoke API key',
          itemId: id,
          onSuccess: () => {
            set((state) => ({
              ...state,
              apiKeys: state.apiKeys.filter((key) => key.id !== id),
              visibleKeys: Object.fromEntries(
                Object.entries(state.visibleKeys).filter(
                  ([keyId]) => Number(keyId) !== id,
                ),
              ),
              showDeleteConfirmation: null,
            }))
          },
        })
      },

      toggleKeyVisibility: (id: number) => {
        set((state) => ({
          ...state,
          visibleKeys: { ...state.visibleKeys, [id]: !state.visibleKeys[id] },
        }))
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
            revoke: null,
          },
        }))
      },
    }
  }),
)
