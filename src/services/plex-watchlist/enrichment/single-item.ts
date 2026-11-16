import type { Config } from '@root/types/config.types.js'
import type {
  Item,
  PlexApiResponse,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import { collectGuidsFromMetadata } from '@utils/guid-handler.js'
import { normalizePosterPath } from '@utils/poster-url.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  discoverHeaders,
  hasValidPlexTokens,
  isRateLimitError,
  PLEX_API_TIMEOUT_MS,
  parseRetryAfter,
  type RateLimitError,
} from '../api/helpers.js'
import { PlexRateLimiter } from '../api/rate-limiter.js'
import type { WatchlistSyncProgress } from '../progress/sync-progress.js'
import { imdbRatingCount, parseRatings } from './rating-parser.js'

async function handleRateLimitAndRetry(
  config: Config,
  log: FastifyBaseLogger,
  item: TokenWatchlistItem,
  retryCount: number,
  maxRetries: number,
  progress?: WatchlistSyncProgress,
  retryAfterSec?: number,
  fromHttp429?: boolean,
  notFoundCollector?: string[],
): Promise<Set<Item>> {
  const rateLimiter = PlexRateLimiter.getInstance()
  rateLimiter.setRateLimited(retryAfterSec, log)

  if (retryCount < maxRetries) {
    await rateLimiter.waitIfLimited(log, progress?.rateLimited)

    return toItemsSingle(
      config,
      log,
      item,
      retryCount + 1,
      maxRetries,
      progress,
      notFoundCollector,
    )
  }

  const rateLimitError = new Error(
    `Rate limit exceeded: Maximum retries (${maxRetries}) reached when processing item "${item.title}"`,
  ) as RateLimitError
  rateLimitError.isRateLimitExhausted = true

  if (!fromHttp429) {
    throw rateLimitError
  }

  log.warn(
    `Maximum retries (${maxRetries}) reached for ${item.title} due to rate limiting. Skipping item.`,
  )
  return new Set()
}

/** Resolves to an empty set when the item cannot be enriched, and may throw a RateLimitError once rate-limit retries are exhausted. */
export const toItemsSingle = async (
  config: Config,
  log: FastifyBaseLogger,
  item: TokenWatchlistItem,
  retryCount = 0,
  maxRetries = 3,
  progress?: WatchlistSyncProgress,
  notFoundCollector?: string[],
): Promise<Set<Item>> => {
  const rateLimiter = PlexRateLimiter.getInstance()

  await rateLimiter.waitIfLimited(log, progress?.rateLimited)

  if (!hasValidPlexTokens(config)) {
    log.error('No valid Plex token configured; cannot fetch metadata')
    return new Set()
  }

  try {
    const url = new URL(
      `https://discover.provider.plex.tv/library/metadata/${item.id}`,
    )

    const response = await fetch(url.toString(), {
      headers: discoverHeaders(config.plexTokens[0]),
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (response.status === 429) {
      const retryAfterSec = parseRetryAfter(response.headers.get('Retry-After'))

      return handleRateLimitAndRetry(
        config,
        log,
        item,
        retryCount,
        maxRetries,
        progress,
        retryAfterSec,
        true,
        notFoundCollector,
      )
    }

    if (!response.ok) {
      if (response.status === 404) {
        if (notFoundCollector) {
          notFoundCollector.push(item.title)
        } else {
          log.warn(
            `Item "${item.title}" not found in Plex database (HTTP 404) - skipping retries`,
          )
        }
        return new Set()
      }

      throw new Error(
        `Plex API error: HTTP ${response.status} - ${response.statusText}`,
      )
    }

    const json = (await response.json()) as PlexApiResponse
    if (!json.MediaContainer?.Metadata) {
      throw new Error('Invalid response structure')
    }

    const items = json.MediaContainer.Metadata.map((metadata) => {
      const imdbVotes = imdbRatingCount(metadata, json.MediaContainer)
      const ratings = parseRatings(metadata.Rating, imdbVotes)

      return {
        title: item.title,
        key: item.id,
        type: item.type,
        thumb:
          normalizePosterPath(item.thumb) ||
          normalizePosterPath(metadata.thumb) ||
          '',
        guids: collectGuidsFromMetadata(metadata),
        genres:
          metadata.Genre?.map((genre) => genre?.tag).filter(
            (tag): tag is string => typeof tag === 'string',
          ) || [],
        ratings,
        user_id: item.user_id,
        status: 'pending' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    })

    if (
      items.length > 0 &&
      (!items[0].guids || items[0].guids.length === 0) &&
      retryCount < maxRetries
    ) {
      log.warn(
        `Found item ${item.title} but no GUIDs. Retry ${retryCount + 1}/${maxRetries}`,
      )
      const backoffDelay = Math.min(500 * 2 ** retryCount, 5000)
      await new Promise((resolve) => setTimeout(resolve, backoffDelay))
      return toItemsSingle(
        config,
        log,
        item,
        retryCount + 1,
        maxRetries,
        progress,
        notFoundCollector,
      )
    }

    log.debug(
      `Processed metadata for item: ${item.title}${items[0]?.guids?.length ? ` with ${items[0].guids.length} GUIDs` : ''}`,
    )
    return new Set(items)
  } catch (err) {
    const error = err as Error
    const errorStr = String(error)

    if (isRateLimitError(error)) {
      log.warn(
        `Rate limit already exhausted for "${item.title}". Propagating error.`,
      )
      throw error
    }

    if (
      errorStr.includes('429') ||
      errorStr.toLowerCase().includes('rate limit')
    ) {
      return handleRateLimitAndRetry(
        config,
        log,
        item,
        retryCount,
        maxRetries,
        progress,
        undefined,
        false,
        notFoundCollector,
      )
    }

    if (error.message.includes('Plex API error')) {
      if (error.message.includes('HTTP 404')) {
        if (notFoundCollector) {
          notFoundCollector.push(item.title)
        } else {
          log.warn(
            `Item "${item.title}" not found in Plex's database (404) - skipping retries`,
          )
        }
        return new Set()
      }

      if (retryCount < maxRetries) {
        log.warn(
          `Failed to find ${item.title} in Plex's database. Error: ${error.message}. Retry ${retryCount + 1}/${maxRetries}`,
        )
        const backoffDelay = Math.min(500 * 2 ** retryCount, 5000)
        await new Promise((resolve) => setTimeout(resolve, backoffDelay))
        return toItemsSingle(
          config,
          log,
          item,
          retryCount + 1,
          maxRetries,
          progress,
          notFoundCollector,
        )
      }
    }

    log.warn(
      `Found item ${item.title} on the watchlist, but we cannot find this in Plex's database after ${maxRetries + 1} attempts. Last error: ${error.message}`,
    )
    return new Set()
  }
}
