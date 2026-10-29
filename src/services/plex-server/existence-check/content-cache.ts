import type { PlexSearchResponse } from '@root/types/plex-server.types.js'
import type { CacheRegistry } from '@services/cache-registry.service.js'
import { extractPlexKey } from '@utils/guid-handler.js'
import { PLEX_CLIENT_IDENTIFIER } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import type { LRUCache } from 'lru-cache'
import {
  invalidateServerConnection,
  type ServerConnectionCache,
} from './connection-cache.js'

const CONTENT_CHECK_TIMEOUT_MS = 5000

const CONTENT_CACHE_MAX = 10_000

export interface ContentCheckRequest {
  serverClientId: string
  serverName: string
  serverUri: string
  accessToken: string
  contentType: 'movie' | 'show'
  plexGuid: string
  /** Aborting cancels a Plex request this caller started, which then stores nothing. */
  signal?: AbortSignal
}

/** Whether a server has the content, keyed by server, content type and Plex key. Lives for one reconciliation. */
export type ContentAvailabilityCache = LRUCache<
  string,
  boolean,
  ContentCheckRequest
>

function contentCacheKey({
  serverClientId,
  contentType,
  plexGuid,
}: ContentCheckRequest): string {
  const plexKey = extractPlexKey(plexGuid)
  if (!plexKey) {
    throw new Error(`Invalid plexGuid: ${plexGuid}`)
  }
  return `${serverClientId}:${contentType}:${plexKey}`
}

/** Resolves undefined for a failure that must not be cached, and rejects when the caller aborted. */
async function fetchContentAvailability(
  request: ContentCheckRequest,
  connectionCache: ServerConnectionCache,
  logger: FastifyBaseLogger,
): Promise<boolean | undefined> {
  const { serverClientId, serverName, signal } = request
  try {
    const url = new URL('/library/all', request.serverUri)
    url.searchParams.append('guid', request.plexGuid)

    const timeout = AbortSignal.timeout(CONTENT_CHECK_TIMEOUT_MS)
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': request.accessToken,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
      },
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    })

    if (!response.ok) {
      if (response.status >= 500) {
        invalidateServerConnection(serverClientId, connectionCache, logger)
      }
      return undefined
    }

    const data = (await response.json()) as PlexSearchResponse
    const exists = (data.MediaContainer.Metadata?.length ?? 0) > 0
    if (exists) {
      logger.debug(`Content found on Plex server "${serverName}"`)
    }
    return exists
  } catch (error) {
    if (signal?.aborted) {
      logger.debug(
        `Content check aborted for server "${serverName}" (found elsewhere)`,
      )
      throw error
    }
    logger.debug(
      { error, server: serverName },
      'Error checking content on server',
    )
    invalidateServerConnection(serverClientId, connectionCache, logger)
    return undefined
  }
}

export function createContentAvailabilityCache(
  registry: CacheRegistry,
  connectionCache: ServerConnectionCache,
  logger: FastifyBaseLogger,
): ContentAvailabilityCache {
  return registry.create({
    max: CONTENT_CACHE_MAX,
    // A clear mid-check still answers its waiting callers but is not written back
    ignoreFetchAbort: true,
    fetchMethod: (_key, _stale, { context }) =>
      fetchContentAvailability(context, connectionCache, logger),
  })
}

/** False for a failed or aborted check. Concurrent checks of one server and item share a request. */
export async function checkContentOnServer(
  cache: ContentAvailabilityCache,
  request: ContentCheckRequest,
): Promise<boolean> {
  const key = contentCacheKey(request)
  for (;;) {
    try {
      return (await cache.fetch(key, { context: request })) ?? false
    } catch (error) {
      // A request another caller aborted fails here too, so retry it unless this caller aborted
      const aborted = error instanceof Error && error.name === 'AbortError'
      if (request.signal?.aborted || !aborted) return false
    }
  }
}
