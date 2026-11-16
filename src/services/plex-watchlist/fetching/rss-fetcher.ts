import type {
  Item,
  PlexApiResponse,
  PlexWatchlistUrls,
  RawRssFetchResult,
  RssResponse,
  RssWatchlistItem,
} from '@root/types/plex.types.js'
import { errorMessage } from '@utils/error-message.js'
import {
  normalizeGenre,
  normalizeGuid,
  parseGenres,
  parseGuids,
} from '@utils/guid-handler.js'
import { normalizePosterPath } from '@utils/poster-url.js'
import { PLEX_CLIENT_IDENTIFIER, USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from '../api/helpers.js'

export function generateStableKey(guids: string[]): string {
  const normalized = guids.map((g) => g.toLowerCase().trim()).filter(Boolean)

  return Array.from(new Set(normalized)).sort().join('|')
}

export const getPlexWatchlistUrls = async (
  tokens: Set<string>,
  skipFriendSync: boolean,
  log: FastifyBaseLogger,
): Promise<PlexWatchlistUrls> => {
  const token = tokens.values().next().value as string | undefined
  if (!token) {
    log.warn('No Plex token provided')
    return { selfRss: null, friendsRss: null }
  }

  const selfRss = await getRssFromPlexToken(token, 'watchlist', log)
  log.debug(
    `Generated watchlist RSS feed for self: ${selfRss ? 'Success' : 'None'}`,
  )
  log.debug('Self watchlist RSS URL obtained')

  const friendsRss = skipFriendSync
    ? null
    : await getRssFromPlexToken(token, 'friendsWatchlist', log)
  log.debug(
    `Generated watchlist RSS feed for friends: ${friendsRss ? 'Success' : 'None'}`,
  )
  log.debug('Friends watchlist RSS URL obtained')

  if (!selfRss && !friendsRss) {
    log.warn('Missing RSS URL. Are you an active Plex Pass user?')
    log.warn('Real-time RSS sync disabled')
  }

  return { selfRss, friendsRss }
}

export const getRssFromPlexToken = async (
  token: string,
  rssType: string,
  log: FastifyBaseLogger,
): Promise<string | null> => {
  const url = new URL('https://discover.provider.plex.tv/rss')
  url.searchParams.append('X-Plex-Client-Identifier', PLEX_CLIENT_IDENTIFIER)
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

export const fetchWatchlistFromRss = async (
  url: string,
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
      log.warn(`Unable to fetch watchlist from Plex: ${response.statusText}`)
      return items
    }

    const json = (await response.json()) as RssResponse
    log.debug('Found Json from Plex watchlist, attempting to process')

    if (json?.items && Array.isArray(json.items)) {
      for (const metadata of json.items) {
        try {
          const normalizedGuids = parseGuids(metadata.guids)

          const item: Item = {
            title: metadata.title || 'Unknown Title',
            // Placeholder key from the GUIDs until enrichment swaps in the real Plex ratingKey
            key: generateStableKey(normalizedGuids) || metadata.title || '',
            type: (metadata.category || 'unknown').toUpperCase(),
            thumb: normalizePosterPath(metadata.thumbnail?.url) || '',
            guids: normalizedGuids,
            genres: parseGenres(metadata.keywords)
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

/** Sends If-None-Match when etag is given, and a 304 comes back as success with notModified and no items. */
export async function fetchRawRssFeed(
  url: string,
  _token: string,
  log: FastifyBaseLogger,
  etag?: string,
): Promise<RawRssFetchResult> {
  try {
    const urlObj = new URL(url)
    urlObj.searchParams.set('format', 'json')

    // The feed URL is a capability on its own, and the 302 to S3 would forward any token header
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    }
    if (etag) {
      headers['If-None-Match'] = etag
    }

    const response = await fetch(urlObj.toString(), {
      headers,
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (response.status === 304) {
      return { success: true, items: [], notModified: true, etag }
    }

    if (response.status === 401 || response.status === 403) {
      log.warn('RSS feed auth error - user may lack RSS access')
      return { success: false, items: [], authError: true }
    }

    if (response.status === 404) {
      log.warn('RSS feed not found')
      return { success: false, items: [], notFound: true }
    }

    if (!response.ok) {
      return {
        success: false,
        items: [],
        error: `Request failed: HTTP ${response.status}`,
      }
    }

    const json = (await response.json()) as RssResponse
    const items: RssWatchlistItem[] = []

    if (json?.items && Array.isArray(json.items)) {
      for (const rawItem of json.items) {
        if (
          !rawItem.title ||
          !rawItem.category ||
          !Array.isArray(rawItem.guids) ||
          rawItem.guids.length === 0
        ) {
          log.debug({ title: rawItem.title }, 'Skipping malformed RSS item')
          continue
        }

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
        })
      }
    }

    log.debug({ itemCount: items.length }, 'RSS feed fetched')
    return {
      success: true,
      items,
      etag: response.headers.get('etag') ?? undefined,
    }
  } catch (error) {
    const message = errorMessage(error)
    log.error({ error: message }, 'Failed to fetch RSS feed')
    return { success: false, items: [], error: message }
  }
}
