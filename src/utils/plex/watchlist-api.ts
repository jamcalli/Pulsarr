import type { Config } from '@root/types/config.types.js'
import type {
  Friend,
  GraphQLQuery,
  Item,
  PlexApiResponse,
  PlexResponse,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import type { ProgressService } from '@root/types/progress.types.js'
import { parseGenres, parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  isRateLimitError,
  PLEX_API_TIMEOUT_MS,
  type RateLimitError,
} from './helpers.js'
import { PlexRateLimiter } from './rate-limiter.js'

/**
 * Converts database Item objects to TokenWatchlistItem format.
 * Normalizes guids and genres, and deduplicates by key.
 *
 * @param existingItems - Array of database Item objects
 * @param userId - The user ID to assign to converted items
 * @param seenKeys - Set of already-seen keys for deduplication
 * @param allItems - Set to add converted items to
 */
const convertDbItemsToTokenWatchlistItems = (
  existingItems: Item[],
  userId: number,
  seenKeys: Set<string>,
  allItems: Set<TokenWatchlistItem>,
): void => {
  for (const item of existingItems) {
    const guids = parseGuids(item.guids)
    const genres = parseGenres(item.genres)

    const tokenItem: TokenWatchlistItem = {
      id: item.key,
      key: item.key,
      title: item.title,
      type: item.type,
      user_id: userId,
      status: item.status || 'pending',
      created_at: item.created_at,
      updated_at: item.updated_at,
      guids,
      genres,
    }
    const key = String(tokenItem.key)
    if (!seenKeys.has(key)) {
      allItems.add(tokenItem)
      seenKeys.add(key)
    }
  }
}

/**
 * Fetches a paginated watchlist from the Plex API.
 *
 * @param token - The Plex authentication token
 * @param log - Fastify logger instance
 * @param start - Starting index for pagination (default: 0)
 * @param retryCount - Current retry attempt (default: 0)
 * @param progressInfo - Optional progress tracking information
 * @returns Promise resolving to a PlexResponse containing watchlist metadata
 * @throws {RateLimitError} When rate limit retries are exhausted
 */
export const getWatchlist = async (
  token: string,
  log: FastifyBaseLogger,
  start = 0,
  retryCount = 0,
  progressInfo?: {
    progress: ProgressService
    operationId: string
    type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
  },
): Promise<PlexResponse> => {
  if (!token) {
    throw new Error('No Plex token provided')
  }

  // Get rate limiter instance
  const rateLimiter = PlexRateLimiter.getInstance()

  // Wait if we're already rate limited before making any API call
  await rateLimiter.waitIfLimited(log, progressInfo)

  const containerSize = 100
  const url = new URL(
    'https://discover.provider.plex.tv/library/sections/watchlist/all',
  )
  url.searchParams.append('X-Plex-Container-Start', start.toString())
  url.searchParams.append('X-Plex-Container-Size', containerSize.toString())

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': token,
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    const contentType = response.headers.get('Content-Type')
    if (!response.ok) {
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

        // Set global rate limiter with the retry-after value
        rateLimiter.setRateLimited(retryAfterSec, log)

        if (retryCount < 3) {
          // Wait for the cooldown period
          await rateLimiter.waitIfLimited(log, progressInfo)
          // Try again after waiting
          return getWatchlist(token, log, start, retryCount + 1, progressInfo)
        }

        // Instead of returning an empty result, throw a specific error
        // that can be handled by callers
        log.warn(`Maximum retries reached for getWatchlist at start=${start}`)
        const error = new Error(
          `Rate limit exceeded: Maximum retries (${retryCount}) reached when fetching watchlist`,
        ) as RateLimitError
        error.isRateLimitExhausted = true
        throw error
      }
      throw new Error(
        `Plex API error: HTTP ${response.status} - ${response.statusText}`,
      )
    }

    if (contentType?.includes('application/json')) {
      const responseData = (await response.json()) as PlexResponse

      // Ensure that MediaContainer and Metadata exist, defaults if they do not.
      if (!responseData.MediaContainer) {
        log.info('Plex API returned empty MediaContainer')
        responseData.MediaContainer = { Metadata: [], totalSize: 0 }
      }

      if (!responseData.MediaContainer.Metadata) {
        log.info('Plex API returned MediaContainer without Metadata array')
        responseData.MediaContainer.Metadata = []
      }

      return responseData
    }

    throw new Error(`Unexpected content type: ${contentType}`)
  } catch (error) {
    // Check if the error is related to rate limiting
    const errorStr = String(error)
    if (
      errorStr.includes('429') ||
      errorStr.toLowerCase().includes('rate limit')
    ) {
      // Trigger global rate limiter
      rateLimiter.setRateLimited(undefined, log)

      if (retryCount < 3) {
        // Wait for the cooldown period
        await rateLimiter.waitIfLimited(log, progressInfo)
        // Try again after waiting
        return getWatchlist(token, log, start, retryCount + 1, progressInfo)
      }

      // Create rate limit error when retries are exhausted
      const rateLimitError = new Error(
        `Rate limit exceeded: Maximum retries (${retryCount}) reached when fetching watchlist`,
      ) as RateLimitError
      rateLimitError.isRateLimitExhausted = true
      log.error({ error: rateLimitError }, 'Error in getWatchlist')
      throw rateLimitError
    }

    // Log error and rethrow to let callers decide how to handle the failure
    log.error({ error, start, retryCount }, 'Error in getWatchlist')
    throw error
  }
}

/**
 * Fetches a specific user's watchlist from the Plex GraphQL API.
 *
 * @param config - Application configuration
 * @param log - Fastify logger instance
 * @param token - The Plex authentication token
 * @param user - Friend object containing user information
 * @param userId - Internal user ID
 * @param page - Pagination cursor (default: null)
 * @param retryCount - Current retry attempt (default: 0)
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param getAllWatchlistItemsForUser - Optional fallback function to get database items
 * @param progressInfo - Optional progress tracking information for UI feedback during rate-limit waits
 * @returns Promise resolving to a Set of TokenWatchlistItems
 */
export const getWatchlistForUser = async (
  config: Config,
  log: FastifyBaseLogger,
  token: string,
  user: Friend,
  userId: number,
  page: string | null = null,
  retryCount = 0,
  maxRetries = 3,
  getAllWatchlistItemsForUser?: (userId: number) => Promise<Item[]>,
  progressInfo?: {
    progress: ProgressService
    operationId: string
    type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
  },
): Promise<Set<TokenWatchlistItem>> => {
  const allItems = new Set<TokenWatchlistItem>()
  const seenKeys = new Set<string>()
  const url = new URL('https://community.plex.tv/api')

  if (!user || !user.watchlistId) {
    const error = 'Invalid user object provided to getWatchlistForUser'
    log.error(error)
    throw new Error(error)
  }

  const query: GraphQLQuery = {
    query: `query GetWatchlistHub ($user: UserInput!, $first: PaginationInt!, $after: String) {
      userV2(user: $user) {
        ... on User {
          watchlist(first: $first, after: $after) {
            nodes {
              id
              title
              type
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }`,
    variables: {
      user: { id: user.watchlistId },
      first: 100,
      after: page,
    },
  }

  try {
    // Check global rate limiter before making the request
    const rateLimiter = PlexRateLimiter.getInstance()
    await rateLimiter.waitIfLimited(log, progressInfo)

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Plex-Token': token,
      },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (!response.ok) {
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

        // Set global rate limiter
        rateLimiter.setRateLimited(retryAfterSec, log)

        if (retryCount < maxRetries) {
          // Wait for the cooldown period
          await rateLimiter.waitIfLimited(log, progressInfo)
          // Retry the request
          return getWatchlistForUser(
            config,
            log,
            token,
            user,
            userId,
            page,
            retryCount + 1,
            maxRetries,
            getAllWatchlistItemsForUser,
            progressInfo,
          )
        }

        // Retries exhausted - check if we can fall back to database
        if (getAllWatchlistItemsForUser) {
          log.warn(
            `Rate limited by Plex GraphQL (429) - Maximum retries (${maxRetries}) reached. Falling back to database.`,
          )
          try {
            const existingItems = await getAllWatchlistItemsForUser(userId)
            convertDbItemsToTokenWatchlistItems(
              existingItems,
              userId,
              seenKeys,
              allItems,
            )
            log.info(
              `Retrieved ${existingItems.length} existing items from database for user ${userId}`,
            )
            return allItems
          } catch (dbError) {
            log.error(
              { error: dbError },
              'Failed to retrieve existing items from database after rate limit',
            )
            // Fall through to throw RateLimitError below
          }
        }

        // No database fallback available or fallback failed - propagate rate limit error
        const err = new Error(
          'Rate limited by Plex GraphQL (429)',
        ) as RateLimitError
        err.isRateLimitExhausted = true
        throw err
      }
      throw new Error(
        `Plex API error: HTTP ${response.status} - ${response.statusText}`,
      )
    }

    const json = (await response.json()) as PlexApiResponse

    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`)
    }

    if (json.data?.userV2?.watchlist) {
      const watchlist = json.data.userV2.watchlist
      const currentTime = new Date().toISOString()

      for (const node of watchlist.nodes) {
        const item: TokenWatchlistItem = {
          ...node,
          key: node.id,
          user_id: userId,
          status: 'pending',
          created_at: currentTime,
          updated_at: currentTime,
          guids: [],
          genres: [],
        }
        const key = String(item.key)
        if (!seenKeys.has(key)) {
          allItems.add(item)
          seenKeys.add(key)
        }
      }

      if (watchlist.pageInfo.hasNextPage && watchlist.pageInfo.endCursor) {
        // We should be playing nice with the Plex servers
        await new Promise((resolve) => setTimeout(resolve, 5_000 + Math.ceil(Math.random() * 10_000)))

        const nextPageItems = await getWatchlistForUser(
          config,
          log,
          token,
          user,
          userId,
          watchlist.pageInfo.endCursor,
          retryCount,
          maxRetries,
          getAllWatchlistItemsForUser,
          progressInfo,
        )
        for (const item of nextPageItems) {
          const key = String(item.key)
          if (!seenKeys.has(key)) {
            allItems.add(item)
            seenKeys.add(key)
          }
        }
      }
    }
  } catch (err) {
    // Check if this is a rate limit exhaustion error
    if (isRateLimitError(err)) {
      log.warn(
        `Rate limit exhausted while fetching watchlist for user ${user.username}. Propagating error.`,
      )
      // Propagate the rate limit error so the caller can handle it appropriately
      throw err
    }

    if (retryCount < maxRetries) {
      const retryDelay = Math.min(1000 * 2 ** retryCount, 10000)
      log.warn(
        `Failed to fetch watchlist for user ${user.username}. Retry ${retryCount + 1}/${maxRetries} in ${retryDelay}ms`,
      )

      await new Promise((resolve) => setTimeout(resolve, retryDelay))

      return getWatchlistForUser(
        config,
        log,
        token,
        user,
        userId,
        page,
        retryCount + 1,
        maxRetries,
        getAllWatchlistItemsForUser,
        progressInfo,
      )
    }

    log.error(
      `Unable to fetch watchlist for user ${user.username} after ${maxRetries} retries: ${err}`,
    )

    // If we have the database function, try to get existing items
    if (getAllWatchlistItemsForUser) {
      try {
        log.info(`Falling back to existing database items for user ${userId}`)
        const existingItems = await getAllWatchlistItemsForUser(userId)
        convertDbItemsToTokenWatchlistItems(
          existingItems,
          userId,
          seenKeys,
          allItems,
        )
        log.info(
          `Retrieved ${existingItems.length} existing items from database for user ${userId}`,
        )
      } catch (dbError) {
        log.error(
          { error: dbError },
          'Failed to retrieve existing items from database',
        )
      }
    }
  }

  return allItems
}
