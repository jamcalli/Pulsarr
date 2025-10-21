import type {
  Item,
  PlexApiResponse,
  RssResponse,
} from '@root/types/plex.types.js'
import { normalizeGuid } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from './helpers.js'

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
    urlObj.searchParams.append(
      'cache_buster',
      Math.random().toString(36).substring(2, 14),
    )

    const response = await fetch(urlObj.toString(), {
      headers: {
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
                  typeof guid === 'string' && guid.length > 0,
              )
              .map((guid) => normalizeGuid(guid)),
            genres: (metadata.keywords || []).map((genre) => {
              if (genre.toLowerCase() === 'sci-fi & fantasy') {
                return 'Sci-Fi & Fantasy'
              }
              return genre
                .split(' ')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
            }),
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
