import type { ItemRatings, PlexRating } from '@root/types/plex.types.js'
import {
  collectGuidsFromMetadata,
  extractTypedGuid,
} from '@utils/guid-handler.js'
import { normalizePosterPath } from '@utils/poster-url.js'
import { PLEX_CLIENT_IDENTIFIER, USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from '../api/helpers.js'
import { PlexRateLimiter } from '../api/rate-limiter.js'
import { parseRatings } from './rating-parser.js'

export interface EnrichedRssMetadata {
  ratingKey: string
  title: string
  type: 'movie' | 'show'
  thumb?: string
  guids: string[]
  genres: string[]
  ratings?: ItemRatings
}

export interface GuidLookupConfig {
  token: string
  timeout?: number
}

/** Returns a normalized guid like "tmdb:123", preferring tmdb for movies and tvdb for shows. */
export function selectPrimaryGuid(
  guids: string[],
  category: 'movie' | 'show',
): string | null {
  if (category === 'movie') {
    return (
      extractTypedGuid(guids, 'tmdb:') ??
      extractTypedGuid(guids, 'imdb:') ??
      extractTypedGuid(guids, 'tvdb:') ??
      null
    )
  }
  return (
    extractTypedGuid(guids, 'tvdb:') ??
    extractTypedGuid(guids, 'imdb:') ??
    extractTypedGuid(guids, 'tmdb:') ??
    null
  )
}

/** Takes the tmdb://123 guid form; returns null on no match or any failure, never throws. */
export async function lookupByGuid(
  config: GuidLookupConfig,
  log: FastifyBaseLogger,
  guid: string,
  contentType: 'movie' | 'show',
  retryCount = 0,
  maxRetries = 3,
): Promise<EnrichedRssMetadata | null> {
  const rateLimiter = PlexRateLimiter.getInstance()

  try {
    await rateLimiter.waitIfLimited(log)

    const typeParam = contentType === 'movie' ? 1 : 2
    const url = `https://discover.provider.plex.tv/library/metadata/matches?type=${typeParam}&guid=${encodeURIComponent(guid)}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'X-Plex-Token': config.token,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(config.timeout ?? PLEX_API_TIMEOUT_MS),
    })

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      rateLimiter.setRateLimited(
        retryAfter ? Number.parseInt(retryAfter, 10) : undefined,
        log,
      )

      if (retryCount < maxRetries) {
        await rateLimiter.waitIfLimited(log)
        return lookupByGuid(
          config,
          log,
          guid,
          contentType,
          retryCount + 1,
          maxRetries,
        )
      }
      log.warn({ guid, retryCount }, 'Max retries exceeded for GUID lookup')
      return null
    }

    if (response.status === 404) {
      log.debug({ guid }, 'GUID not found in Plex catalog')
      return null
    }

    if (!response.ok) {
      throw new Error(`Plex API error: HTTP ${response.status}`)
    }

    const json = (await response.json()) as {
      MediaContainer?: {
        Metadata?: Array<{
          ratingKey?: string
          title?: string
          thumb?: string
          Guid?: Array<{ id: string }>
          Genre?: Array<{ tag: string }>
          Rating?: PlexRating[]
          imdbRatingCount?: number
        }>
        imdbRatingCount?: number
      }
    }

    const metadata = json.MediaContainer?.Metadata?.[0]

    if (!metadata?.ratingKey) {
      log.debug({ guid }, 'No metadata found for GUID')
      return null
    }

    const imdbVotes =
      metadata.imdbRatingCount ?? json.MediaContainer?.imdbRatingCount
    const ratings = parseRatings(metadata.Rating, imdbVotes)

    return {
      ratingKey: metadata.ratingKey,
      title: metadata.title ?? '',
      type: contentType,
      thumb: normalizePosterPath(metadata.thumb) ?? undefined,
      guids: collectGuidsFromMetadata(metadata),
      genres: metadata.Genre?.map((g) => g.tag).filter(Boolean) ?? [],
      ratings,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      log.warn({ guid }, 'GUID lookup timed out')
    } else {
      log.warn({ error, guid }, 'Failed to lookup GUID')
    }
    return null
  }
}

/** Keyed by the normalized primary guid; items with no usable guid or no match are absent. */
export async function batchLookupByGuid(
  config: GuidLookupConfig,
  log: FastifyBaseLogger,
  items: Array<{ guids: string[]; category: 'movie' | 'show' }>,
): Promise<Map<string, EnrichedRssMetadata>> {
  const results = new Map<string, EnrichedRssMetadata>()

  for (const item of items) {
    const primaryGuid = selectPrimaryGuid(item.guids, item.category)
    if (!primaryGuid) {
      log.debug({ guids: item.guids }, 'No usable GUID found for item')
      continue
    }

    // Convert normalized GUID (tmdb:123) back to Plex format (tmdb://123) for API lookup
    const plexGuid = primaryGuid.replace(/^(tmdb|imdb|tvdb):/, '$1://')
    const metadata = await lookupByGuid(config, log, plexGuid, item.category)
    if (metadata) {
      results.set(primaryGuid, metadata)
    }
  }

  return results
}
