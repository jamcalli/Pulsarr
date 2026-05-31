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
 * Handles items that were just linked to users by immediately syncing labels.
 * Groups items by content key so each unique content is synced once.
 * Falls back to pending queue if immediate sync fails.
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
    const keys = linkItems.map((item) => item.key)
    const dbItems = await db.getWatchlistItemsByKeys(keys)

    // Create composite key index for O(1) lookups
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

    // Group by unique content key so each content is synced once
    const contentMap = new Map<
      string,
      { title: string; watchlistIds: number[] }
    >()
    const userCounts = new Map<number, number>()

    for (const linkItem of linkItems) {
      const dbItem = byKeyUser.get(`${linkItem.key}:${linkItem.user_id}`)

      if (dbItem?.id && linkItem.key && typeof dbItem.id === 'number') {
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

        const count = userCounts.get(linkItem.user_id) || 0
        userCounts.set(linkItem.user_id, count + 1)
      }
    }

    for (const [userId, count] of userCounts.entries()) {
      logger.debug(`Detected ${count} linked items for user ${userId}`)
    }

    // Attempt immediate sync per unique content, queue on failure
    let synced = 0
    let queued = 0
    for (const [_contentKey, content] of contentMap.entries()) {
      const representativeId = content.watchlistIds[0]
      const success = await plexLabelSyncService.syncLabelForNewWatchlistItem(
        representativeId,
        content.title,
        true,
      )

      if (success) {
        synced++
      } else {
        queued++
      }
    }

    if (synced > 0 || queued > 0) {
      logger.debug(
        {
          synced,
          queued,
          totalContent: contentMap.size,
          linkedItems: linkItems.length,
        },
        'Linked items label sync complete',
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
      'Failed to sync labels for linked items:',
    )
    throw error
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
