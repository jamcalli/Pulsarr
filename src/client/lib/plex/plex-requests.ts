import type { WatchlistSyncType } from '@root/types/progress.types'
import { invalidateConfig } from '@/hooks/useConfig'
import {
  isRunSettled,
  requireRunDone,
  startAndAwaitStatus,
} from '@/lib/background-job'
import { plexConnectionKeys, usersKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, apiFetch } from '@/lib/tanstackApi'

const TOKEN_REJECTED_STATUS = 401
const TOKEN_SAVE_REJECTED_STATUS = 409
const TOKEN_SAVE_UNREACHABLE_STATUS = 502

export type TokenFailure = 'rejected' | 'unreachable'

export const TOKEN_FAILURE_MESSAGES: Record<TokenFailure, string> = {
  rejected: "Plex didn't accept the token.",
  unreachable: "Plex couldn't be reached. Try again in a moment.",
}

/** Null when Plex accepts the configured token. */
async function checkToken(): Promise<TokenFailure | null> {
  try {
    const { error } = await apiFetch.GET('/v1/plex/ping')
    if (!error) return null
    return error.statusCode === TOKEN_REJECTED_STATUS
      ? 'rejected'
      : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

/** Why the config save refused a new token, or null when the error is something else. */
export function tokenSaveFailure(error: unknown): TokenFailure | null {
  const status =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
      ? error.statusCode
      : null
  if (status === TOKEN_SAVE_REJECTED_STATUS) return 'rejected'
  if (status === TOKEN_SAVE_UNREACHABLE_STATUS) return 'unreachable'
  return null
}

/** Throws with the failure's message when Plex does not accept the configured token. */
export async function verifyToken(): Promise<void> {
  const failure = await checkToken()
  if (failure) throw new Error(TOKEN_FAILURE_MESSAGES[failure])
}

export async function testServerConnection() {
  const { data, error } = await apiFetch.GET('/v1/plex/test-connection')
  if (error) throw error
  return data
}

/** The server saves both URLs itself, so this only refreshes the cached config. */
export async function generateFeeds(): Promise<void> {
  const { error } = await apiFetch.GET('/v1/plex/generate-rss-feeds')
  if (error) throw error
  await invalidateConfig()
}

/** Starts a sync in the background and resolves with its status once it finishes, throwing when it failed. */
export async function syncWatchlist(type: WatchlistSyncType) {
  const params = { path: { type } }
  const status = await startAndAwaitStatus({
    eventType: type,
    start: async () => {
      const { error } = await apiFetch.POST(
        '/v1/plex/watchlist-sync/{type}/start',
        { params },
      )
      if (error) throw error
    },
    readStatus: () =>
      queryClient.fetchQuery({
        ...$api.queryOptions('get', '/v1/plex/watchlist-sync/{type}/status', {
          params,
        }),
        staleTime: 0,
      }),
    isSettled: isRunSettled,
  })
  return requireRunDone(status, 'The sync failed. Try again.')
}

export async function fetchHasPlexPass(): Promise<boolean> {
  const data = await queryClient.fetchQuery({
    ...$api.queryOptions('get', '/v1/plex/plex-pass-status'),
    staleTime: 0,
    retry: 1,
  })
  return data.hasPlexPass
}

export function invalidateAccount() {
  return Promise.all([
    invalidateConfig(),
    queryClient.invalidateQueries({ queryKey: usersKeys.list }),
    queryClient.invalidateQueries({ queryKey: usersKeys.withCounts }),
    queryClient.invalidateQueries({ queryKey: plexConnectionKeys.passStatus }),
  ])
}
