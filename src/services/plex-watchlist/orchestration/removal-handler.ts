/**
 * Removal Handler Orchestration
 *
 * Functions for handling removed watchlist items and label sync cleanup.
 * Extracted from PlexWatchlistService to support thin orchestrator pattern.
 */

import type {
  Friend,
  TokenWatchlistItem,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { PlexLabelSyncService } from '../../plex-label-sync.service.js'

/**
 * Dependencies for removal handler operations
 */
export interface RemovalHandlerDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  plexLabelSyncService?: PlexLabelSyncService
  fastify?: FastifyInstance
}

/**
 * Handles items that have been removed from a user's watchlist.
 * Cleans up labels if label sync is enabled, then deletes from database.
 *
 * @param userId - The user whose items were removed
 * @param username - The username of the user
 * @param currentKeys - Keys of items currently in the database
 * @param fetchedKeys - Keys of items currently in the user's watchlist
 * @param deps - Dependencies for database and label sync
 */
export async function handleRemovedItems(
  userId: number,
  username: string,
  currentKeys: Set<string>,
  fetchedKeys: Set<string>,
  deps: RemovalHandlerDeps,
): Promise<void> {
  const { db, logger, plexLabelSyncService } = deps

  const removedKeys = Array.from(currentKeys).filter(
    (key) => !fetchedKeys.has(key),
  )

  if (removedKeys.length > 0) {
    logger.debug(
      `Detected ${removedKeys.length} removed items for user ${userId}`,
    )

    // Get the watchlist items that will be deleted for label cleanup and webhook dispatch
    const itemsToDelete = await db.getWatchlistItemsByKeys(removedKeys)
    // Filter to only items belonging to this user
    const userItemsToDelete = itemsToDelete.filter(
      (item) => item.user_id === userId,
    )

    // Send native webhook notifications for each removed item (fire-and-forget)
    if (deps.fastify?.notifications) {
      for (const item of userItemsToDelete) {
        void deps.fastify.notifications.sendWatchlistRemoved(
          userId,
          username,
          item,
        )
      }
    }

    // Handle label sync cleanup if enabled
    if (plexLabelSyncService && userItemsToDelete.length > 0) {
      try {
        const labelCleanupItems = userItemsToDelete.map((item) => ({
          id: item.id,
          title: item.title,
          key: item.key,
          user_id: item.user_id,
          guids: parseGuids(item.guids),
          contentType: (item.type === 'show' ? 'show' : 'movie') as
            | 'movie'
            | 'show',
        }))
        await plexLabelSyncService.cleanupLabelsForWatchlistItems(
          labelCleanupItems,
        )
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        logger.error(
          {
            error: err,
            stack: err.stack,
            userId,
            removedKeys,
          },
          'Failed to cleanup labels for removed watchlist items:',
        )
        // Continue with deletion even if label cleanup fails
      }
    }

    await db.deleteWatchlistItems(userId, removedKeys)
  }
}

/**
 * Handles items that were just linked to users by queuing them for label sync.
 * Groups items by content key to avoid duplicate pending syncs.
 *
 * @param linkItems - The items that were linked to users
 * @param deps - Dependencies for database and label sync
 */
export async function handleLinkedItemsForLabelSync(
  linkItems: WatchlistItem[],
  deps: RemovalHandlerDeps,
): Promise<void> {
  const { db, logger, plexLabelSyncService } = deps

  if (!plexLabelSyncService || linkItems.length === 0) {
    return
  }

  try {
    // Get the database items with IDs after linking
    const keys = linkItems.map((item) => item.key)

    const dbItems = await db.getWatchlistItemsByKeys(keys)

    // Create composite key index for O(1) lookups instead of O(n) Array.find
    const byKeyUser = new Map<string, { id: number; title: string }>()
    for (const item of dbItems) {
      if (
        item.key &&
        typeof item.user_id === 'number' &&
        typeof item.id === 'number'
      ) {
        byKeyUser.set(`${item.key}:${item.user_id}`, {
          id: item.id,
          title: item.title,
        })
      }
    }

    // Group by unique content key to avoid duplicate pending syncs
    // This mimics the content-centric approach used in full sync
    const contentMap = new Map<
      string,
      { title: string; watchlistIds: number[] }
    >()
    const userCounts = new Map<number, number>()

    for (const linkItem of linkItems) {
      // O(1) lookup using composite key instead of O(n) Array.find
      const dbItem = byKeyUser.get(`${linkItem.key}:${linkItem.user_id}`)

      if (dbItem?.id && linkItem.key && typeof dbItem.id === 'number') {
        // Group by content key
        if (!contentMap.has(linkItem.key)) {
          contentMap.set(linkItem.key, {
            title: linkItem.title,
            watchlistIds: [],
          })
        }

        const contentEntry = contentMap.get(linkItem.key)
        if (contentEntry) {
          contentEntry.watchlistIds.push(dbItem.id)
        }

        // Count per user for logging
        const count = userCounts.get(linkItem.user_id) || 0
        userCounts.set(linkItem.user_id, count + 1)
      }
    }

    // Queue one pending sync per unique content (not per watchlist item)
    // This ensures all users for the same content are processed together
    let totalQueued = 0
    for (const [_contentKey, content] of contentMap.entries()) {
      // Queue using the first watchlist ID as representative
      // The processing will find ALL users with this content when processing
      await plexLabelSyncService.queuePendingLabelSyncByWatchlistId(
        content.watchlistIds[0],
        content.title,
      )
      totalQueued++
    }

    // Log per user
    for (const [userId, count] of userCounts.entries()) {
      logger.debug(`Detected ${count} re-added items for user ${userId}`)
    }

    if (totalQueued > 0) {
      logger.debug(
        `Queued ${totalQueued} unique content items for label synchronization (grouped from ${linkItems.length} re-added items)`,
      )
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error(
      {
        error: err,
        stack: err.stack,
        linkItemsCount: linkItems.length,
        linkItemsSample: linkItems.slice(0, 3).map((item) => ({
          title: item.title,
          key: item.key,
          user_id: item.user_id,
        })),
      },
      'Failed to queue re-added items for label sync:',
    )
    throw error // Re-throw to see the full error chain
  }
}

/**
 * Checks for removed items across all users in the watchlist map.
 * Compares current database items with fetched watchlist items.
 *
 * @param userWatchlistMap - Map of users to their current watchlist items
 * @param deps - Dependencies for database and label sync
 */
export async function checkForRemovedItems(
  userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  deps: RemovalHandlerDeps,
): Promise<void> {
  const { db } = deps

  for (const [user, items] of userWatchlistMap.entries()) {
    const currentItems = await db.getAllWatchlistItemsForUser(user.userId)

    const currentKeys = new Set(currentItems.map((item) => item.key))
    const fetchedKeys = new Set(Array.from(items).map((item) => item.id))

    await handleRemovedItems(
      user.userId,
      user.username,
      currentKeys,
      fetchedKeys,
      deps,
    )
  }
}
