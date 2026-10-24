import type { Config } from '@root/types/config.types.js'
import type {
  Friend,
  Item,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import { parseGenres, parseGuids } from '@utils/guid-handler.js'
import { normalizePosterPath } from '@utils/poster-url.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  getWatchlist,
  getWatchlistForUser,
  WATCHLIST_PAGE_SIZE,
} from '../api/graphql.js'
import { isRateLimitError } from '../api/helpers.js'
import type { WatchlistSyncProgress } from '../progress/sync-progress.js'

/** Returns the full Plex watchlist, or the stored DB items when the fetch fails or is incomplete, and throws when neither is available. */
export const fetchSelfWatchlist = async (
  config: Config,
  log: FastifyBaseLogger,
  userId: number,
  getAllWatchlistItemsForUser?: (userId: number) => Promise<Item[]>,
  progress?: WatchlistSyncProgress,
  onFallback?: (userId: number) => void,
): Promise<Set<TokenWatchlistItem>> => {
  const allItems = new Set<TokenWatchlistItem>()
  const seenKeys = new Set<string>()

  if (!config.plexTokens || config.plexTokens.length === 0) {
    log.warn('No Plex tokens configured')
    return allItems
  }

  progress?.readingPages()

  for (const token of config.plexTokens) {
    if (!token) {
      continue
    }
    let currentStart = 0
    let pagesDone = 0

    try {
      while (true) {
        log.debug(`Fetching watchlist for token with start: ${currentStart}`)
        const response = await getWatchlist(
          token,
          log,
          currentStart,
          0,
          progress?.rateLimited,
        )

        const metadata = response.MediaContainer.Metadata || []
        const totalSize = response.MediaContainer.totalSize || 0

        if (metadata.length === 0) {
          if (totalSize > currentStart) {
            throw new Error(
              `Plex returned an empty page at start=${currentStart} while reporting ${totalSize} items`,
            )
          }
          log.info('User has no items in their watchlist')
          break
        }

        pagesDone++
        progress?.readingPages({
          done: pagesDone,
          total: Math.ceil(totalSize / WATCHLIST_PAGE_SIZE),
        })

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
              thumb: normalizePosterPath(metadata.thumb) || null,
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
          const key = String(item.key)
          if (!seenKeys.has(key)) {
            allItems.add(item as TokenWatchlistItem)
            seenKeys.add(key)
          }
        }

        if (totalSize <= currentStart + metadata.length) {
          log.debug('Completed processing all pages for current token')
          break
        }

        currentStart += metadata.length

        // Delay between pagination requests per Plex developer request
        await new Promise((resolve) =>
          setTimeout(resolve, 5_000 + Math.ceil(Math.random() * 10_000)),
        )
      }
    } catch (err) {
      log.error({ error: err }, 'Error fetching watchlist for token')

      if (!getAllWatchlistItemsForUser) {
        throw err
      }

      try {
        log.info(`Falling back to existing database items for user ${userId}`)
        onFallback?.(userId)
        const existingItems = await getAllWatchlistItemsForUser(userId)
        if (existingItems.length === 0) {
          throw err
        }
        allItems.clear()
        seenKeys.clear()

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

        log.info(
          `Successfully fell back to ${existingItems.length} existing database items for user ${userId}`,
        )
        break
      } catch (fallbackError) {
        log.error(
          { error: fallbackError, userId },
          'Failed to fetch fallback database items for user',
        )
        throw err
      }
    }
  }

  log.info(
    `Self watchlist fetched successfully with ${allItems.size} total items`,
  )
  return allItems
}

/** Friends whose fetch failed are absent from the map; an empty watchlist is an empty set. */
export const getOthersWatchlist = async (
  log: FastifyBaseLogger,
  friends: Set<[Friend & { userId: number }, string]>,
  getAllWatchlistItemsForUser?: (userId: number) => Promise<Item[]>,
  progress?: WatchlistSyncProgress,
  onFallback?: (userId: number) => void,
): Promise<Map<Friend, Set<TokenWatchlistItem>>> => {
  const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>()
  log.info(`Starting fetch of watchlists for ${friends.size} friends`)

  const pageByFriend = new Map<string, number>()
  let friendsDone = 0
  const reportFriends = () =>
    progress?.readingFriends(friendsDone, friends.size, pageByFriend)
  reportFriends()

  const MAX_CONCURRENT = 2
  const friendsArray = Array.from(friends)
  const results: Array<{
    user: Friend & { userId: number }
    watchlistItems: Set<TokenWatchlistItem>
    success: boolean
  }> = []

  for (let i = 0; i < friendsArray.length; i += MAX_CONCURRENT) {
    const batch = friendsArray.slice(i, i + MAX_CONCURRENT)
    log.debug(
      `Processing batch of ${batch.length} friends (${i + 1}-${Math.min(i + batch.length, friendsArray.length)} of ${friendsArray.length})`,
    )

    const batchPromises = batch.map(async ([user, token]) => {
      log.debug(`Processing friend: ${user.username} (userId: ${user.userId})`)
      try {
        const watchlistItems = await getWatchlistForUser({
          token,
          log,
          user,
          userId: user.userId,
          getAllWatchlistItemsForUser,
          onWait: progress?.rateLimited,
          onPage: (page) => {
            pageByFriend.set(user.username, page)
            reportFriends()
          },
          onFallback: () => onFallback?.(user.userId),
        })
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
      } finally {
        pageByFriend.delete(user.username)
        friendsDone++
        reportFriends()
      }
    })

    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)

    if (i + MAX_CONCURRENT < friendsArray.length) {
      await new Promise((resolve) =>
        setTimeout(resolve, 1_000 + Math.ceil(Math.random() * 4_000)),
      )
    }
  }

  for (const { user, watchlistItems, success } of results) {
    if (success) {
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
