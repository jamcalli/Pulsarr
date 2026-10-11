/**
 * Metadata Operations Module
 *
 * Provides functions for searching and retrieving metadata from Plex Media Server.
 * All operations require a valid server URL and authentication token.
 */

import type {
  PlexMetadata,
  PlexSearchResponse,
} from '@root/types/plex-server.types.js'
import type {
  PlexChildrenResponse,
  PlexShowMetadata,
  PlexShowMetadataResponse,
} from '@root/types/plex-session.types.js'
import { normalizeGuid } from '@utils/guid-handler.js'
import { PLEX_CLIENT_IDENTIFIER } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import { fetchPlex } from '../plex-fetch.js'

const PLEX_API_TIMEOUT = 30000 // 30 seconds

/**
 * Searches for content in the Plex library by GUID
 *
 * Normalizes external provider GUIDs (tmdb://, tvdb://, etc.) but preserves
 * internal plex:// GUIDs unchanged.
 *
 * @param guid - The GUID to search for
 * @param serverUrl - The Plex server base URL
 * @param token - Authentication token for API access
 * @param log - Logger instance for operation tracking
 * @returns Promise resolving to array of matching metadata items
 */
export type GuidLookup =
  | { status: 'found'; items: PlexMetadata[] }
  | { status: 'none' }
  | { status: 'error' }

/** `none` is Plex answering 200 with no items, every other failure is `error`, including 401 and 404. */
export async function lookupByGuid(
  guid: string,
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<GuidLookup> {
  if (!token) {
    log.warn('No Plex token provided for library search')
    return { status: 'error' }
  }
  // An empty guid filter makes Plex list the whole library and hang
  if (!guid.trim()) {
    log.warn('Refusing to search the Plex library with an empty guid')
    return { status: 'error' }
  }

  const normalizedGuid = guid.startsWith('plex://') ? guid : normalizeGuid(guid)
  const url = new URL('/library/all', serverUrl)
  url.searchParams.append('guid', normalizedGuid)

  try {
    const response = await fetchPlex(url, {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
      },
    })
    if (!response.ok) {
      log.error(
        { status: response.status, guid: normalizedGuid },
        `Plex library search failed: ${response.status} ${response.statusText}`,
      )
      return { status: 'error' }
    }
    const data = (await response.json()) as PlexSearchResponse
    const items = data.MediaContainer.Metadata ?? []
    log.debug(
      { normalizedGuid, count: items.length },
      `Found ${items.length} results for GUID: ${normalizedGuid}`,
    )
    return items.length > 0 ? { status: 'found', items } : { status: 'none' }
  } catch (error) {
    log.error({ error }, `Error searching library by GUID "${guid}":`)
    return { status: 'error' }
  }
}

export async function searchByGuid(
  guid: string,
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<PlexMetadata[]> {
  const lookup = await lookupByGuid(guid, serverUrl, token, log)
  return lookup.status === 'found' ? lookup.items : []
}

/**
 * Retrieves show metadata from Plex, with optional season/episode details
 *
 * @param ratingKey - The show's rating key
 * @param includeChildren - Whether to include season/episode details
 * @param serverUrl - The Plex server base URL
 * @param token - Authentication token for API access
 * @param log - Logger instance for operation tracking
 * @returns Promise resolving to show metadata or null if not found
 */
export async function getShowMetadata(
  ratingKey: string,
  includeChildren: boolean,
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<PlexShowMetadata | PlexShowMetadataResponse | null> {
  try {
    if (!token) {
      log.warn('No Plex token provided for metadata retrieval')
      return null
    }

    const url = new URL(`/library/metadata/${ratingKey}`, serverUrl)
    if (includeChildren) {
      url.searchParams.append('includeChildren', '1')
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to fetch show metadata: ${response.status} ${response.statusText}`,
      )
    }

    const data = (await response.json()) as PlexShowMetadata
    return data
  } catch (error) {
    log.error({ error }, `Error fetching show metadata for key ${ratingKey}:`)
    return null
  }
}

/**
 * Retrieves direct children of a Plex library item via /library/metadata/{id}/children
 *
 * For a show, returns seasons. For a season, returns episodes.
 * This is the reliable way to get children — includeChildren=1 only works
 * on the show-level metadata endpoint, not on seasons.
 */
export async function getMetadataChildren(
  ratingKey: string,
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<PlexChildrenResponse | null> {
  try {
    if (!token) {
      log.warn('No Plex token provided for children retrieval')
      return null
    }

    const url = new URL(`/library/metadata/${ratingKey}/children`, serverUrl)

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to fetch metadata children: ${response.status} ${response.statusText}`,
      )
    }

    return (await response.json()) as PlexChildrenResponse
  } catch (error) {
    log.error({ error }, `Error fetching children for key ${ratingKey}:`)
    return null
  }
}
