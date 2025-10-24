import type { Config } from '@root/types/config.types.js'
import type {
  Friend,
  Item,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import { parseGenres, parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'
import { isRateLimitError } from './helpers.js'
import { getWatchlist, getWatchlistForUser } from './watchlist-api.js'

/**
 * Fetches the current user's own watchlist from Plex.
 *
 * @param config - Application configuration
 * @param log - Fastify logger instance
 * @param userId - Internal user ID
 * @param getAllWatchlistItemsForUser - Optional fallback function to get database items
 * @returns Promise resolving to a Set of TokenWatchlistItems
 */
export const fetchSelfWatchlist = async (
  config: Config,
  log: FastifyBaseLogger,
  userId: number,
  getAllWatchlistItemsForUser?: (userId: number) => Promise<Item[]>,
): Promise<Set<TokenWatchlistItem>> => {
  const allItems = new Set<TokenWatchlistItem>()

  if (!config.plexTokens || config.plexTokens.length === 0) {
    log.warn('No Plex tokens configured')
    return allItems
  }

  for (const token of config.plexTokens) {
    // Skip falsy tokens to prevent predictable API failures
    if (!token) {
      continue
    }
    let currentStart = 0

    try {
      while (true) {
        log.debug(`Fetching watchlist for token with start: ${currentStart}`)
        try {
          const response = await getWatchlist(token, log, currentStart)

          const metadata = response?.MediaContainer?.Metadata || []
          const totalSize = response?.MediaContainer?.totalSize || 0

          if (metadata.length === 0 && currentStart === 0) {
            log.info('User has no items in their watchlist')
            break
          }

          const items = metadata
            .filter((metadata) => Boolean(metadata.key))
            .map((metadata) => {
              const key = metadata.key
                ?.replace('/library/metadata/', '')
                .replace('/children', '')

              return {
                title: metadata.title || 'Unknown Title',
                id: key,
                key: key,
                thumb: metadata.thumb || null,
                type: metadata.type || 'unknown',
                guids: [],
                genres: [],
                user_id: userId,
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            })

          log.debug(`Found ${items.length} items in current page`)
          for (const item of items) {
            allItems.add(item as TokenWatchlistItem)
          }

          if (totalSize <= currentStart + metadata.length) {
            log.debug('Completed processing all pages for current token')
            break
          }

          currentStart += metadata.length
        } catch (innerError) {
          // Check if this is a rate limit exhaustion error
          if (isRateLimitError(innerError)) {
            log.warn(
              `Rate limit exhausted while fetching watchlist for token at start=${currentStart}. Moving to next token.`,
            )
            // Break out of the loop for this token and move on to the next one
            break
          }
          // For other errors, rethrow to be handled by outer catch
          throw innerError
        }
      }
    } catch (err) {
      log.error({ error: err }, 'Error fetching watchlist for token')

      // If we have the database function, try to get existing items
      if (getAllWatchlistItemsForUser) {
        try {
          log.info(`Falling back to existing database items for user ${userId}`)
          const existingItems = await getAllWatchlistItemsForUser(userId)

          // Convert database items to TokenWatchlistItems
          for (const item of existingItems) {
            // Normalize guids using the parseGuids utility to handle JSON strings, arrays, and null values
            const guids = parseGuids(item.guids)

            // Normalize genres using the parseGenres utility to handle JSON strings, arrays, and null values
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
            allItems.add(tokenItem)
          }

          log.info(
            `Successfully fell back to ${existingItems.length} existing database items for user ${userId}`,
          )
          break // Break out of the token loop since we have fallback data
        } catch (fallbackError) {
          log.error(
            { error: fallbackError, userId },
            'Failed to fetch fallback database items for user',
          )
        }
      }
    }
  }

  log.info(
    `Self watchlist fetched successfully with ${allItems.size} total items`,
  )
  return allItems
}

/**
 * Fetches watchlists for multiple friends concurrently with controlled batching.
 *
 * @param config - Application configuration
 * @param log - Fastify logger instance
 * @param friends - Set of Friends with their tokens and user IDs
 * @param getAllWatchlistItemsForUser - Optional fallback function to get database items
 * @returns Promise resolving to a Map of Friends to their TokenWatchlistItems
 */
export const getOthersWatchlist = async (
  config: Config,
  log: FastifyBaseLogger,
  friends: Set<[Friend & { userId: number }, string]>,
  getAllWatchlistItemsForUser?: (userId: number) => Promise<Item[]>,
): Promise<Map<Friend, Set<TokenWatchlistItem>>> => {
  const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>()
  log.info(`Starting fetch of watchlists for ${friends.size} friends`)

  // Simple concurrency pool implementation
  const MAX_CONCURRENT = 4 // Maximum number of concurrent friend fetches
  const friendsArray = Array.from(friends)
  const results: Array<{
    user: Friend & { userId: number }
    watchlistItems: Set<TokenWatchlistItem>
    success: boolean
  }> = []

  // Create batches of friends to process
  for (let i = 0; i < friendsArray.length; i += MAX_CONCURRENT) {
    const batch = friendsArray.slice(i, i + MAX_CONCURRENT)
    log.debug(
      `Processing batch of ${batch.length} friends (${i + 1}-${Math.min(i + batch.length, friendsArray.length)} of ${friendsArray.length})`,
    )

    // Process this batch concurrently
    const batchPromises = batch.map(async ([user, token]) => {
      log.debug(`Processing friend: ${user.username} (userId: ${user.userId})`)
      try {
        const watchlistItems = await getWatchlistForUser(
          config,
          log,
          token,
          user,
          user.userId,
          null,
          0,
          3,
          getAllWatchlistItemsForUser,
        )
        return { user, watchlistItems, success: true }
      } catch (error) {
        if (isRateLimitError(error)) {
          log.warn(
            `Rate limit exhausted while fetching watchlist for friend ${user.username}. Skipping.`,
          )
        } else {
          log.error(
            `Error fetching watchlist for friend ${user.username}: ${error}`,
          )
        }
        return {
          user,
          watchlistItems: new Set<TokenWatchlistItem>(),
          success: false,
        }
      }
    })

    // Wait for the current batch to complete before processing the next batch
    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)

    // Introduce a small delay between batches to avoid rate limits
    if (i + MAX_CONCURRENT < friendsArray.length) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  // Add each successfully fetched result to the map
  // Note: Failed fetches are excluded to prevent data loss in downstream processing
  for (const { user, watchlistItems, success } of results) {
    if (success) {
      // Add user to map (even with empty watchlist if they legitimately have no items)
      userWatchlistMap.set(user, watchlistItems)
      log.debug(
        `Added ${watchlistItems.size} items for friend ${user.username}`,
      )
    }
  }

  const totalItems = Array.from(userWatchlistMap.values()).reduce(
    (acc, items) => acc + items.size,
    0,
  )
  const friendsWithItems = Array.from(userWatchlistMap.entries()).filter(
    ([_, items]) => items.size > 0,
  ).length
  const friendsWithEmptyWatchlists = userWatchlistMap.size - friendsWithItems

  log.info(
    `Others' watchlist fetched successfully with ${totalItems} total item${totalItems === 1 ? '' : 's'} from ${friendsWithItems} friend${friendsWithItems === 1 ? '' : 's'} (${friendsWithEmptyWatchlists} friend${friendsWithEmptyWatchlists === 1 ? '' : 's'} with empty watchlist${friendsWithEmptyWatchlists === 1 ? '' : 's'})`,
  )
  return userWatchlistMap
}
