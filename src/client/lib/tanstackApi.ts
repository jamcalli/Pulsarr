import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'
import { BASE_PATH } from '@/lib/basePath.js'
import {
  QUERY_RETRY_DELAY_MAX_MS,
  QUERY_RETRY_DELAY_MS,
  QUERY_RETRY_LIMIT,
} from '@/lib/constants'
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
/** A blank message counts as none, so callers' fallbacks apply. */
export function apiErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return presentMessage(error.message)
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return presentMessage(error.message)
  }
  return null
}

function presentMessage(message: string): string | null {
  return message.trim() === '' ? null : message
}

/** Retries network failures, rate limits and 5xx answers up to the limit, since other 4xx answers will not change on retry. */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= QUERY_RETRY_LIMIT) return false
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode >= 500 || error.statusCode === 429
  }
  return true
}

export function queryRetryDelay(attemptIndex: number): number {
  return Math.min(
    QUERY_RETRY_DELAY_MS * 2 ** attemptIndex,
    QUERY_RETRY_DELAY_MAX_MS,
  )
}

/** Error instances (network, parse) get a generic message, API error bodies get their own message or the fallback. */
export function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return 'An unexpected error occurred. Please try again.'
  }
  return apiErrorMessage(error) ?? fallback
}

/** Throws a `success: false` body so the mutation error shows the server's message instead of rendering results. */
export function requireSuccess<T extends { success: boolean }>(data: T): T {
  if (!data.success) throw data
  return data
}

/** True once a query has data or has failed, so a page gate stops waiting on it. */
export function isSettled<T>(query: {
  data: T | undefined
  isError: boolean
}): boolean {
  return query.data !== undefined || query.isError
}

/** Null while cached data exists, since a failed background refetch keeps the data and reports through the toast instead. */
export function loadErrorMessage(
  query: { data: unknown; isError: boolean; error: unknown },
  fallback: string,
): string | null {
  if (query.data !== undefined || !query.isError) return null
  return apiErrorMessage(query.error) ?? fallback
}

/** For a status read, where an outdated status shown as current is the bug: reports the last failure even over cached data. */
export function latestErrorMessage(
  query: { isError: boolean; error: unknown },
  fallback: string,
): string | null {
  return query.isError ? (apiErrorMessage(query.error) ?? fallback) : null
}

/** The first query that failed with no cached data, for pages that gate on several queries at once. */
export function firstLoadError(
  queries: ReadonlyArray<{ data: unknown; isError: boolean; error: unknown }>,
  fallback: string,
): string | null {
  for (const query of queries) {
    const message = loadErrorMessage(query, fallback)
    if (message !== null) return message
  }
  return null
}
