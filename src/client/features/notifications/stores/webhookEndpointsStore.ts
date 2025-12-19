import { MIN_LOADING_DELAY } from '@root/client/features/plex/store/constants'
import {
  type CreateWebhookEndpoint,
  type TestWebhookEndpoint,
  type UpdateWebhookEndpoint,
  type WebhookEndpoint,
  type WebhookEndpointResponse,
  WebhookEndpointResponseSchema,
  type WebhookEndpointsListResponse,
  WebhookEndpointsListResponseSchema,
  type WebhookTestResponse,
  WebhookTestResponseSchema,
} from '@root/schemas/webhooks/webhook-endpoints.schema'
import { z } from 'zod'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { api } from '@/lib/api'

export interface WebhookEndpointsState {
  endpoints: WebhookEndpoint[]
  hasLoaded: boolean
  loading: {
    fetch: boolean
    create: boolean
    update: Record<number, boolean>
    delete: Record<number, boolean>
    test: boolean
  }
  error: {
    fetch: string | null
    create: string | null
    update: string | null
    delete: string | null
    test: string | null
  }

  // Actions
  fetchEndpoints: (isRefresh?: boolean) => Promise<void>
  createEndpoint: (
    data: CreateWebhookEndpoint,
  ) => Promise<WebhookEndpoint | null>
  updateEndpoint: (
    id: number,
    data: UpdateWebhookEndpoint,
  ) => Promise<WebhookEndpoint | null>
  deleteEndpoint: (id: number) => Promise<boolean>
  testEndpoint: (
    data: TestWebhookEndpoint,
    name?: string,
  ) => Promise<WebhookTestResponse>
  resetErrors: () => void
}

// Helper function to handle API responses with Zod schema validation
async function handleApiResponse<T>(
  response: Response,
  schema: z.ZodType<T> | null,
  defaultErrorMessage: string,
): Promise<T> {
  if (!response.ok) {
    let errorMessage = defaultErrorMessage
    try {
      const errorData = await response.json()
      errorMessage = errorData.message || errorData.error || errorMessage
    } catch {
      try {
        const textError = await response.text()
        if (textError) {
          errorMessage = textError
        }
      } catch {
        // Use default error message if both JSON and text extraction fail
      }
    }
    throw new Error(errorMessage)
  }

  // Handle 204 No Content responses (typically for DELETE operations)
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

export const useWebhookEndpointsStore = create<WebhookEndpointsState>()(
  devtools((set, get) => ({
    endpoints: [],
    hasLoaded: false,
    loading: {
      fetch: false,
      create: false,
      update: {},
      delete: {},
      test: false,
    },
    error: {
      fetch: null,
      create: null,
      update: null,
      delete: null,
      test: null,
    },

    fetchEndpoints: async (isRefresh = false) => {
      const isInitialLoad = !get().hasLoaded

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

        const [response] = await Promise.all([
          fetch(api('/v1/webhooks/endpoints')),
          minimumLoadingTime,
        ])

        const data = await handleApiResponse<WebhookEndpointsListResponse>(
          response,
          WebhookEndpointsListResponseSchema,
          'Failed to fetch webhook endpoints',
        )

        if (data.success) {
          set((state) => ({
            ...state,
            endpoints: data.data,
            hasLoaded: true,
            loading: { ...state.loading, fetch: false },
          }))
        }
      } catch (err) {
        console.error('Error fetching webhook endpoints:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, fetch: false },
          error: {
            ...state.error,
            fetch:
              err instanceof Error
                ? err.message
                : 'Failed to fetch webhook endpoints',
          },
        }))
        throw err
      }
    },

    createEndpoint: async (data: CreateWebhookEndpoint) => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, create: true },
        error: { ...state.error, create: null },
      }))

      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        const [response] = await Promise.all([
          fetch(api('/v1/webhooks/endpoints'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          }),
          minimumLoadingTime,
        ])

        const result = await handleApiResponse<WebhookEndpointResponse>(
          response,
          WebhookEndpointResponseSchema,
          'Failed to create webhook endpoint',
        )

        if (result.success) {
          set((state) => ({
            ...state,
            endpoints: [...state.endpoints, result.data],
            loading: { ...state.loading, create: false },
          }))
          return result.data
        }

        set((state) => ({
          ...state,
          loading: { ...state.loading, create: false },
        }))
        return null
      } catch (err) {
        console.error('Error creating webhook endpoint:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, create: false },
          error: {
            ...state.error,
            create:
              err instanceof Error
                ? err.message
                : 'Failed to create webhook endpoint',
          },
        }))
        throw err
      }
    },

    updateEndpoint: async (id: number, data: UpdateWebhookEndpoint) => {
      set((state) => ({
        ...state,
        loading: {
          ...state.loading,
          update: { ...state.loading.update, [id]: true },
        },
        error: { ...state.error, update: null },
      }))

      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        const [response] = await Promise.all([
          fetch(api(`/v1/webhooks/endpoints/${id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          }),
          minimumLoadingTime,
        ])

        const result = await handleApiResponse<WebhookEndpointResponse>(
          response,
          WebhookEndpointResponseSchema,
          'Failed to update webhook endpoint',
        )

        if (result.success) {
          set((state) => ({
            ...state,
            endpoints: state.endpoints.map((ep) =>
              ep.id === id ? result.data : ep,
            ),
            loading: {
              ...state.loading,
              update: { ...state.loading.update, [id]: false },
            },
          }))
          return result.data
        }

        set((state) => ({
          ...state,
          loading: {
            ...state.loading,
            update: { ...state.loading.update, [id]: false },
          },
        }))
        return null
      } catch (err) {
        console.error('Error updating webhook endpoint:', err)
        set((state) => ({
          ...state,
          loading: {
            ...state.loading,
            update: { ...state.loading.update, [id]: false },
          },
          error: {
            ...state.error,
            update:
              err instanceof Error
                ? err.message
                : 'Failed to update webhook endpoint',
          },
        }))
        throw err
      }
    },

    deleteEndpoint: async (id: number) => {
      set((state) => ({
        ...state,
        loading: {
          ...state.loading,
          delete: { ...state.loading.delete, [id]: true },
        },
        error: { ...state.error, delete: null },
      }))

      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        const [response] = await Promise.all([
          fetch(api(`/v1/webhooks/endpoints/${id}`), {
            method: 'DELETE',
          }),
          minimumLoadingTime,
        ])

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(
            errorData.message || 'Failed to delete webhook endpoint',
          )
        }

        set((state) => ({
          ...state,
          endpoints: state.endpoints.filter((ep) => ep.id !== id),
          loading: {
            ...state.loading,
            delete: { ...state.loading.delete, [id]: false },
          },
        }))
        return true
      } catch (err) {
        console.error('Error deleting webhook endpoint:', err)
        set((state) => ({
          ...state,
          loading: {
            ...state.loading,
            delete: { ...state.loading.delete, [id]: false },
          },
          error: {
            ...state.error,
            delete:
              err instanceof Error
                ? err.message
                : 'Failed to delete webhook endpoint',
          },
        }))
        throw err
      }
    },

    testEndpoint: async (
      data: TestWebhookEndpoint,
      name?: string,
    ): Promise<WebhookTestResponse> => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, test: true },
        error: { ...state.error, test: null },
      }))

      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        const [response] = await Promise.all([
          fetch(api('/v1/webhooks/endpoints/test'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, name }),
          }),
          minimumLoadingTime,
        ])

        const result = await handleApiResponse<WebhookTestResponse>(
          response,
          WebhookTestResponseSchema,
          'Failed to test webhook endpoint',
        )

        set((state) => ({
          ...state,
          loading: { ...state.loading, test: false },
        }))

        return result
      } catch (err) {
        console.error('Error testing webhook endpoint:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, test: false },
          error: {
            ...state.error,
            test:
              err instanceof Error
                ? err.message
                : 'Failed to test webhook endpoint',
          },
        }))
        // Return a failed result instead of throwing
        return {
          success: false,
          responseTime: 0,
          error: err instanceof Error ? err.message : 'Test failed',
        }
      }
    },

    resetErrors: () => {
      set((state) => ({
        ...state,
        error: {
          fetch: null,
          create: null,
          update: null,
          delete: null,
          test: null,
        },
      }))
    },
  })),
)
