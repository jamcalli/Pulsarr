import type { Config } from '@root/types/config.types.js'
import type {
  Item,
  PlexApiResponse,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import type { ProgressService } from '@root/types/progress.types.js'
import { normalizeGuid } from '@utils/guid-handler.js'
import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  hasValidPlexTokens,
  isRateLimitError,
  PLEX_API_TIMEOUT_MS,
  type RateLimitError,
} from '../api/helpers.js'
import { PlexRateLimiter } from '../api/rate-limiter.js'
import { parseRatings } from './rating-parser.js'

/**
 * Handle a Plex API rate-limit for a single watchlist item: apply a global cooldown, optionally wait and retry, or fail when retries are exhausted.
 *
 * If a Retry-After value is provided the global rate limiter is set accordingly. When retryCount < maxRetries this function waits for the limiter to clear and retries processing the same item. When retries are exhausted it either throws a RateLimitError (for non-HTTP-429 conditions) or returns an empty set (when the path originated from an HTTP 429).
 *
 * @param item - The token-scoped watchlist item being retried.
 * @param retryCount - Current retry attempt (0-based).
 * @param maxRetries - Maximum allowed retry attempts before giving up.
 * @param progressInfo - Optional progress reporting context used while waiting for the cooldown.
 * @param retryAfterSec - Optional cooldown duration (seconds) supplied by the Plex API (HTTP Retry-After header).
 * @param fromHttp429 - Whether this rate limit originated from a direct HTTP 429 response (true) or a caught error (false).
 * @param notFoundCollector - Optional array to collect titles of items that returned HTTP 404 during processing.
 * @returns A set of processed Item objects, or an empty set when skipping the item after exhausting retries for an HTTP 429 condition.
 *
 * @throws {RateLimitError} When retries are exhausted for a non-HTTP-429 rate-limit condition; the thrown error has isRateLimitExhausted = true.
 */
async function handleRateLimitAndRetry(
  config: Config,
  log: FastifyBaseLogger,
  item: TokenWatchlistItem,
  retryCount: number,
  maxRetries: number,
  progressInfo?: {
    progress: ProgressService
    operationId: string
    type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
  },
  retryAfterSec?: number,
  fromHttp429?: boolean,
  notFoundCollector?: string[],
): Promise<Set<Item>> {
  // Set global rate limiter with the retry-after value
  const rateLimiter = PlexRateLimiter.getInstance()
  rateLimiter.setRateLimited(retryAfterSec, log)

  if (retryCount < maxRetries) {
    // Wait for the cooldown period to expire
    await rateLimiter.waitIfLimited(
      log,
      progressInfo
        ? {
            ...progressInfo,
            message: `Rate limited by Plex API. Waiting before retrying "${item.title}"...`,
          }
        : undefined,
    )

    // Try again after waiting
    return toItemsSingle(
      config,
      log,
      item,
      retryCount + 1,
      maxRetries,
      progressInfo,
      notFoundCollector,
    )
  }

  // Create rate limit error when retries are exhausted
  const rateLimitError = new Error(
    `Rate limit exceeded: Maximum retries (${maxRetries}) reached when processing item "${item.title}"`,
  ) as RateLimitError
  rateLimitError.isRateLimitExhausted = true

  if (!fromHttp429) {
    // This is a caught error, not an HTTP 429
    throw rateLimitError
  }

  // This is from an HTTP 429
  log.warn(
    `Maximum retries (${maxRetries}) reached for ${item.title} due to rate limiting. Skipping item.`,
  )
  return new Set()
}

/**
 * Processes a single watchlist item, fetching its metadata from the Plex API.
 *
 * @param config - Application configuration
 * @param log - Fastify logger instance
 * @param item - The watchlist item to process
 * @param retryCount - Current retry attempt (default: 0)
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param progressInfo - Optional progress tracking information
 * @param notFoundCollector - Optional array to collect 404 items instead of logging
 * @returns Promise resolving to a Set of processed Items
 */
export const toItemsSingle = async (
  config: Config,
  log: FastifyBaseLogger,
  item: TokenWatchlistItem,
  retryCount = 0,
  maxRetries = 3,
  progressInfo?: {
    progress: ProgressService
    operationId: string
    type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
  },
  notFoundCollector?: string[], // Optional array to collect 404 items instead of logging
): Promise<Set<Item>> => {
  // Get the global rate limiter instance
  const rateLimiter = PlexRateLimiter.getInstance()

  // Wait if we're already rate limited before making any API call
  await rateLimiter.waitIfLimited(
    log,
    progressInfo
      ? {
          ...progressInfo,
          message: `Rate limited by Plex API. Waiting before processing "${item.title}"...`,
        }
      : undefined,
  )

  if (!hasValidPlexTokens(config)) {
    log.error('No valid Plex token configured; cannot fetch metadata')
    return new Set()
  }

  try {
    const url = new URL(
      `https://discover.provider.plex.tv/library/metadata/${item.id}`,
    )

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'X-Plex-Token': config.plexTokens[0],
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    // Handle rate limiting specifically
    if (response.status === 429) {
      // Parse Retry-After: supports both delay-seconds and HTTP-date formats
      const retryAfterHeader = response.headers.get('Retry-After')
      let retryAfterSec: number | undefined
      if (retryAfterHeader) {
        const asSeconds = Number.parseInt(retryAfterHeader, 10)
        if (!Number.isNaN(asSeconds)) {
          retryAfterSec = asSeconds
        } else {
          const asDateMs = Date.parse(retryAfterHeader)
          if (!Number.isNaN(asDateMs)) {
            const deltaMs = Math.max(0, asDateMs - Date.now())
            retryAfterSec = Math.ceil(deltaMs / 1000)
          }
        }
      }

      // Use the centralized helper to handle rate limiting and retries
      return handleRateLimitAndRetry(
        config,
        log,
        item,
        retryCount,
        maxRetries,
        progressInfo,
        retryAfterSec,
        true, // fromHttp429
        notFoundCollector,
      )
    }

    if (!response.ok) {
      // Check if it's a 404 error, which means the item doesn't exist in Plex
      if (response.status === 404) {
        if (notFoundCollector) {
          // Collect for consolidated logging
          notFoundCollector.push(item.title)
        } else {
          // Log immediately if no collector provided (backward compatibility)
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
    if (!json.MediaContainer || !json.MediaContainer.Metadata) {
      throw new Error('Invalid response structure')
    }

    const items = json.MediaContainer.Metadata.map((metadata) => {
      // Parse ratings from Plex metadata
      // imdbRatingCount can be at metadata level or container level
      const imdbVotes =
        metadata.imdbRatingCount ?? json.MediaContainer?.imdbRatingCount
      const ratings = parseRatings(metadata.Rating, imdbVotes)

      return {
        title: item.title,
        key: item.id,
        type: item.type,
        thumb: item.thumb || metadata.thumb || '',
        guids:
          metadata.Guid?.map((guid) =>
            guid?.id ? normalizeGuid(guid.id) : null,
          ).filter((guid): guid is string => guid !== null) || [],
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
      // Use exponential backoff
      const backoffDelay = Math.min(500 * 2 ** retryCount, 5000)
      await new Promise((resolve) => setTimeout(resolve, backoffDelay))
      return toItemsSingle(
        config,
        log,
        item,
        retryCount + 1,
        maxRetries,
        progressInfo,
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

    // Check if this is already a rate limit exhaustion error
    if (isRateLimitError(error)) {
      log.warn(
        `Rate limit already exhausted for "${item.title}". Propagating error.`,
      )
      throw error
    }

    // Fallback: check for rate limit indicators in error message
    if (
      errorStr.includes('429') ||
      errorStr.toLowerCase().includes('rate limit')
    ) {
      // Use the centralized helper function to handle rate limiting and retries
      return handleRateLimitAndRetry(
        config,
        log,
        item,
        retryCount,
        maxRetries,
        progressInfo,
        undefined, // No retry-after header in this case
        false, // fromHttp429 - this is a caught error
        notFoundCollector,
      )
    }

    if (error.message.includes('Plex API error')) {
      // Check specifically for 404 errors and avoid retrying
      if (error.message.includes('HTTP 404')) {
        if (notFoundCollector) {
          // Collect for consolidated logging
          notFoundCollector.push(item.title)
        } else {
          // Log immediately if no collector provided (backward compatibility)
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
        // Use exponential backoff
        const backoffDelay = Math.min(500 * 2 ** retryCount, 5000)
        await new Promise((resolve) => setTimeout(resolve, backoffDelay))
        return toItemsSingle(
          config,
          log,
          item,
          retryCount + 1,
          maxRetries,
          progressInfo,
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
