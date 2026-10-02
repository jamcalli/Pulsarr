import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'
import { BASE_PATH } from '@/lib/basePath.js'
import type { paths } from '@/types/api.js'

export const apiFetch = createFetchClient<paths>({
  baseUrl: BASE_PATH,
})

export const $api = createClient(apiFetch)

/**
 * Extracts a display message from a thrown API error. openapi-fetch throws
 * the parsed error body (a plain object), not an Error instance, so both
 * shapes need handling.
 */
export function apiErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return null
}

/** Error instances (network, parse) get a generic message, API error bodies get their own message or the fallback. */
export function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return 'An unexpected error occurred. Please try again.'
  }
  return apiErrorMessage(error) ?? fallback
}
