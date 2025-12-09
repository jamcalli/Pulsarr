/**
 * RSS Item Enricher
 *
 * Provides GUID lookup and enrichment for RSS items that lack the Plex rating key.
 * RSS feeds contain GUIDs (tmdb://, tvdb://, imdb://) but not the Plex key needed
 * for label sync and content matching.
 *
 * Uses the /library/metadata/matches API to resolve GUIDs to full Plex metadata.
 */

import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS, PlexRateLimiter } from '../api/index.js'

/**
 * Enriched metadata returned from GUID lookup
 */
export interface EnrichedRssMetadata {
  ratingKey: string
  title: string
  type: 'movie' | 'show'
  thumb?: string
  guids: string[]
  genres: string[]
}

/**
 * Configuration for GUID lookup
 */
export interface GuidLookupConfig {
  token: string
  timeout?: number
}

/**
 * Select the primary GUID for lookup based on content type.
 *
 * Priority order:
 * - Movies: TMDB (Radarr uses this) > IMDB > TVDB
 * - Shows: TVDB (Sonarr uses this) > IMDB > TMDB
 *
 * @param guids - Array of GUID strings (e.g., ['tmdb://123', 'imdb://tt456'])
 * @param category - Content type ('movie' or 'show')
 * @returns The selected GUID or null if none found
 */
export function selectPrimaryGuid(
  guids: string[],
  category: 'movie' | 'show',
): string | null {
  const guidMap = new Map<string, string>()

  for (const guid of guids) {
    const match = guid.match(/^(imdb|tmdb|tvdb):\/\/(.+)$/)
    if (match) {
      guidMap.set(match[1], guid)
    }
  }

  if (category === 'movie') {
    // Priority: TMDB (Radarr uses this) > IMDB > TVDB
    return (
      guidMap.get('tmdb') ?? guidMap.get('imdb') ?? guidMap.get('tvdb') ?? null
    )
  }
  // Priority: TVDB (Sonarr uses this) > IMDB > TMDB
  return (
    guidMap.get('tvdb') ?? guidMap.get('imdb') ?? guidMap.get('tmdb') ?? null
  )
}

/**
 * Lookup Plex metadata by GUID via /library/metadata/matches API.
 *
 * This API resolves external GUIDs (tmdb://, tvdb://, imdb://) to full Plex
 * metadata including the rating key needed for label sync.
 *
 * @param config - Token and optional timeout configuration
 * @param log - Logger instance
 * @param guid - The GUID to look up (e.g., 'tmdb://550')
 * @param contentType - 'movie' or 'show'
 * @param retryCount - Current retry attempt (internal use)
 * @param maxRetries - Maximum retry attempts for rate limiting
 * @returns Enriched metadata or null if not found/error
 */
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
        'X-Plex-Client-Identifier': 'pulsarr',
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
        }>
      }
    }

    const metadata = json.MediaContainer?.Metadata?.[0]

    if (!metadata?.ratingKey) {
      log.debug({ guid }, 'No metadata found for GUID')
      return null
    }

    return {
      ratingKey: metadata.ratingKey,
      title: metadata.title ?? '',
      type: contentType,
      thumb: metadata.thumb,
      guids: metadata.Guid?.map((g) => g.id).filter(Boolean) ?? [],
      genres: metadata.Genre?.map((g) => g.tag).filter(Boolean) ?? [],
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

/**
 * Batch lookup multiple GUIDs with rate limiting.
 *
 * Processes GUIDs sequentially to respect rate limits.
 * Returns a map of GUID -> metadata for successful lookups.
 *
 * @param config - Token and optional timeout configuration
 * @param log - Logger instance
 * @param items - Array of items with guids and category
 * @returns Map of original GUID to enriched metadata
 */
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

    const metadata = await lookupByGuid(config, log, primaryGuid, item.category)
    if (metadata) {
      // Store by the primary GUID we looked up
      results.set(primaryGuid, metadata)
    }
  }

  return results
}
