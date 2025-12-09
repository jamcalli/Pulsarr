import type {
  Item,
  PlexApiResponse,
  RssResponse,
  RssWatchlistItem,
} from '@root/types/plex.types.js'
import { normalizeGenre, normalizeGuid } from '@utils/guid-handler.js'
import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from '../api/helpers.js'

/**
 * Generate a stable cache key from GUIDs.
 * Used for RSS feed diffing to detect new items consistently.
 *
 * @param guids - Array of GUID strings
 * @returns Stable key string (sorted, normalized, deduplicated, joined)
 */
export function generateStableKey(guids: string[]): string {
  const normalized = guids.map((g) => g.toLowerCase().trim()).filter(Boolean)

  // Deduplicate after normalization to keep keys stable
  return Array.from(new Set(normalized)).sort().join('|')
}

/**
 * Generates RSS feed URLs for the given Plex tokens.
 *
 * @param tokens - Set of Plex authentication tokens
 * @param skipFriendSync - Whether to skip generating friend watchlist RSS feeds
 * @param log - Fastify logger instance
 * @returns Promise resolving to a Set of RSS feed URLs
 */
export const getPlexWatchlistUrls = async (
  tokens: Set<string>,
  skipFriendSync: boolean,
  log: FastifyBaseLogger,
): Promise<Set<string>> => {
  const watchlistsFromTokenIo = await Promise.all(
    Array.from(tokens).map(async (token) => {
      const selfWatchlist = await getRssFromPlexToken(token, 'watchlist', log)
      log.info(
        `Generated watchlist RSS feed for self: ${selfWatchlist ? 'Success' : 'None'}`,
      )
      log.debug(`Self watchlist RSS URL: ${selfWatchlist}`)
      const friendsWatchlist = skipFriendSync
        ? null
        : await getRssFromPlexToken(token, 'friendsWatchlist', log)
      log.info(
        `Generated watchlist RSS feed for friends: ${friendsWatchlist ? 'Success' : 'None'}`,
      )
      log.debug(`Friends watchlist RSS URL: ${friendsWatchlist}`)
      return [selfWatchlist, friendsWatchlist].filter(Boolean) as string[]
    }),
  )

  const watchlistsFromToken = new Set<string>(watchlistsFromTokenIo.flat())

  if (watchlistsFromToken.size === 0) {
    log.warn('Missing RSS URL. Are you an active Plex Pass user?')
    log.warn('Real-time RSS sync disabled')
  }

  return watchlistsFromToken
}

/**
 * Generates an RSS feed URL for a specific Plex token and feed type.
 *
 * @param token - The Plex authentication token
 * @param rssType - Type of RSS feed ('watchlist' or 'friendsWatchlist')
 * @param log - Fastify logger instance
 * @returns Promise resolving to the RSS feed URL or null on failure
 */
export const getRssFromPlexToken = async (
  token: string,
  rssType: string,
  log: FastifyBaseLogger,
): Promise<string | null> => {
  const url = new URL('https://discover.provider.plex.tv/rss')
  url.searchParams.append('X-Plex-Client-Identifier', 'pulsarr')
  url.searchParams.append('format', 'json')

  const body = JSON.stringify({ feedType: rssType })

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        'X-Plex-Token': token,
      },
      body,
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (!response.ok) {
      log.warn(`Unable to generate an RSS feed: ${response.statusText}`)
      return null
    }

    const json = (await response.json()) as PlexApiResponse
    log.debug(
      'Got a result from Plex when generating RSS feed, attempting to decode',
    )
    return json.RSSInfo?.[0]?.url || null
  } catch (err) {
    log.warn(`Unable to generate an RSS feed: ${err}`)
    return null
  }
}

/**
 * Fetches and parses a watchlist from a Plex RSS feed.
 *
 * @param url - The RSS feed URL
 * @param prefix - Prefix for item keys ('selfRSS' or 'friendsRSS')
 * @param userId - Internal user ID
 * @param log - Fastify logger instance
 * @returns Promise resolving to a Set of Items from the RSS feed
 */
export const fetchWatchlistFromRss = async (
  url: string,
  prefix: 'selfRSS' | 'friendsRSS',
  userId: number,
  log: FastifyBaseLogger,
): Promise<Set<Item>> => {
  const items = new Set<Item>()

  try {
    const urlObj = new URL(url)
    urlObj.searchParams.append('format', 'json')

    const response = await fetch(urlObj.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (!response.ok) {
      if (response.status === 500) {
        log.debug(
          'Unable to fetch watchlist from Plex, see https://github.com/nylonee/watchlistarr/issues/161',
        )
        return items
      }
      log.warn(`Unable to fetch watchlist from Plex: ${response.statusText}`)
      return items
    }

    const json = (await response.json()) as RssResponse
    log.debug('Found Json from Plex watchlist, attempting to process')

    if (json?.items && Array.isArray(json.items)) {
      for (const metadata of json.items) {
        try {
          const item: Item = {
            title: metadata.title || 'Unknown Title',
            key: `${prefix}_${Math.random().toString(36).substring(2, 15)}`,
            type: (metadata.category || 'unknown').toUpperCase(),
            thumb: metadata.thumbnail?.url || '',
            guids: (metadata.guids ?? [])
              .filter(
                (guid): guid is string =>
                  typeof guid === 'string' && guid.trim().length > 0,
              )
              .map((guid) => normalizeGuid(guid)),
            genres: (Array.isArray(metadata.keywords) ? metadata.keywords : [])
              .filter(
                (genre): genre is string =>
                  typeof genre === 'string' && genre.trim().length > 0,
              )
              .map(normalizeGenre)
              .filter(Boolean),
            user_id: userId,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          items.add(item)
        } catch (err) {
          log.warn(`Failed to process item ${metadata.title}: ${err}`)
        }
      }
    }
  } catch (err) {
    log.warn(`Unable to fetch watchlist from Plex: ${err}`)
  }

  log.debug(`Successfully processed ${items.size} items from RSS feed`)
  return items
}

/**
 * Result of fetching raw RSS feed content
 */
export interface RawRssFetchResult {
  success: boolean
  items: RssWatchlistItem[]
  etag: string | null
  /** Explicit flag for HTTP 304 Not Modified response */
  notModified?: boolean
  authError?: boolean
  notFound?: boolean
  error?: string
}

/**
 * Fetch raw RSS feed content with ETag support.
 * Used by the RSS feed cache for efficient polling.
 *
 * @param url - The RSS feed URL
 * @param token - Plex authentication token
 * @param log - Logger instance
 * @param previousEtag - Previous ETag for conditional request (optional)
 * @returns Raw RSS items with metadata
 */
export async function fetchRawRssFeed(
  url: string,
  token: string,
  log: FastifyBaseLogger,
  previousEtag?: string,
): Promise<RawRssFetchResult> {
  try {
    const urlObj = new URL(url)
    urlObj.searchParams.set('format', 'json')

    // Single GET request with conditional ETag - server returns 304 with no body if unchanged
    const response = await fetch(urlObj.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': 'pulsarr',
        Accept: 'application/json',
        ...(previousEtag && { 'If-None-Match': previousEtag }),
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    // Not modified - content unchanged
    if (response.status === 304) {
      log.debug('RSS feed unchanged (304 Not Modified)')
      return {
        success: true,
        items: [],
        etag: previousEtag ?? null,
        notModified: true,
      }
    }

    // Auth errors
    if (response.status === 401 || response.status === 403) {
      log.warn('RSS feed auth error - user may lack RSS access')
      return { success: false, items: [], etag: null, authError: true }
    }

    // Not found
    if (response.status === 404) {
      log.warn('RSS feed not found')
      return { success: false, items: [], etag: null, notFound: true }
    }

    if (!response.ok) {
      return {
        success: false,
        items: [],
        etag: null,
        error: `Request failed: HTTP ${response.status}`,
      }
    }

    // Extract ETag from response
    const newEtag = response.headers.get('ETag')

    const json = (await response.json()) as RssResponse
    const items: RssWatchlistItem[] = []

    if (json?.items && Array.isArray(json.items)) {
      for (const rawItem of json.items) {
        // Validate required fields
        if (
          !rawItem.title ||
          !rawItem.category ||
          !Array.isArray(rawItem.guids) ||
          rawItem.guids.length === 0
        ) {
          log.debug({ title: rawItem.title }, 'Skipping malformed RSS item')
          continue
        }

        // Normalize GUIDs
        const normalizedGuids = rawItem.guids
          .filter(
            (guid): guid is string =>
              typeof guid === 'string' && guid.trim().length > 0,
          )
          .map((guid) => normalizeGuid(guid))

        if (normalizedGuids.length === 0) {
          log.debug(
            { title: rawItem.title },
            'Skipping item with no valid GUIDs',
          )
          continue
        }

        items.push({
          ...rawItem,
          guids: normalizedGuids,
          // Extract author field (Plex user UUID)
          author: rawItem.author,
        })
      }
    }

    log.debug({ itemCount: items.length, etag: newEtag }, 'RSS feed fetched')
    return { success: true, items, etag: newEtag }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error({ error: errorMessage }, 'Failed to fetch RSS feed')
    return { success: false, items: [], etag: null, error: errorMessage }
  }
}
