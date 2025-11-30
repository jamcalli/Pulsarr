/**
 * Item Processor Orchestration
 *
 * Functions for processing and saving new watchlist items.
 * Extracted from PlexWatchlistService to support thin orchestrator pattern.
 */

import type { Config } from '@root/types/config.types.js'
import type {
  Friend,
  TokenWatchlistItem,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import { parseGenres, parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'
import type { PlexLabelSyncService } from '../../plex-label-sync.service.js'
import { processWatchlistItems } from '../index.js'

/**
 * Dependencies for item processor operations
 */
export interface ItemProcessorDeps {
  db: FastifyInstance['db']
  logger: FastifyBaseLogger
  config: Config
  progress: FastifyInstance['progress']
  plexLabelSyncService?: PlexLabelSyncService
  handleLinkedItemsForLabelSync: (linkItems: WatchlistItem[]) => Promise<void>
}

/**
 * Item prepared for database insertion
 */
export interface PreparedItem {
  user_id: number
  title: string
  key: string
  thumb: string | undefined
  type: string
  guids: string[]
  genres: string[]
  status: 'pending'
  created_at: string
  updated_at: string
}

/**
 * Prepares processed items for database insertion.
 * Filters out items for users with sync disabled.
 *
 * @param processedItems - Map of users to their processed watchlist items
 * @param deps - Dependencies for database access and logging
 * @returns Array of items ready for database insertion
 */
export async function prepareItemsForInsertion(
  processedItems: Map<Friend & { userId: number }, Set<WatchlistItem>>,
  deps: Pick<ItemProcessorDeps, 'db' | 'logger'>,
): Promise<PreparedItem[]> {
  const { db, logger } = deps

  // Get all user IDs from the processedItems
  const userIds = Array.from(processedItems.keys()).map((user) => user.userId)

  // Fetch all users in one batch to get their sync permissions
  const users = await Promise.all(
    userIds.map((id) => {
      // Ensure we're always passing a simple number, not an object
      const numericId =
        typeof id === 'object' && id !== null
          ? 'id' in id
            ? (id as { id: number }).id
            : Number(id)
          : Number(id)
      return db.getUser(numericId)
    }),
  )

  // Create a map of user ID to their can_sync permission
  const userSyncPermissions = new Map<number, boolean>()
  users.forEach((user, index) => {
    if (user) {
      userSyncPermissions.set(userIds[index], user.can_sync)
    }
  })

  return Array.from(processedItems.entries()).flatMap(([user, items]) => {
    // Make sure we have a numeric user ID
    const numericUserId =
      typeof user.userId === 'object' && user.userId !== null
        ? 'id' in user.userId
          ? (user.userId as { id: number }).id
          : Number(user.userId)
        : Number(user.userId)

    // During initial sync, assume syncing is enabled if user not found
    const canSync = userSyncPermissions.get(numericUserId) !== false

    if (!canSync) {
      logger.debug(
        `Skipping ${items.size} items for user ${user.username} (ID: ${numericUserId}) who has sync disabled`,
      )
      return []
    }

    return Array.from(items).map((item) => ({
      user_id: numericUserId,
      title: item.title,
      key: item.key,
      thumb: item.thumb,
      type: item.type,
      guids: parseGuids(item.guids),
      genres: parseGenres(item.genres),
      status: 'pending' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
  })
}

/**
 * Processes and saves new watchlist items to the database.
 * Handles progress reporting, label sync, and database operations.
 *
 * @param brandNewItems - Map of users to their new watchlist items
 * @param isSelfWatchlist - Whether this is the self watchlist (vs friends)
 * @param isMetadataRefresh - Whether this is a metadata refresh operation
 * @param deps - Dependencies for processing
 * @returns Map of users to their processed items
 */
export async function processAndSaveNewItems(
  brandNewItems: Map<Friend, Set<TokenWatchlistItem>>,
  isSelfWatchlist: boolean,
  isMetadataRefresh: boolean,
  deps: ItemProcessorDeps,
): Promise<Map<Friend, Set<WatchlistItem>>> {
  const { db, logger, config, progress, plexLabelSyncService } = deps

  if (brandNewItems.size === 0) {
    return new Map<Friend, Set<WatchlistItem>>()
  }

  logger.debug(`Processing ${brandNewItems.size} new items`)

  const operationId = `process-${Date.now()}`
  const emitProgress = progress.hasActiveConnections()

  // Use the passed parameter to determine the type
  const type = isSelfWatchlist ? 'self-watchlist' : 'others-watchlist'

  if (emitProgress) {
    progress.emit({
      operationId,
      type,
      phase: 'start',
      progress: 0,
      message: `Starting ${isSelfWatchlist ? 'self' : 'others'} watchlist processing`,
    })
  }

  const processedItems = await processWatchlistItems(
    config,
    logger,
    brandNewItems,
    emitProgress
      ? {
          progress,
          operationId,
          type,
        }
      : undefined,
  )

  if (processedItems instanceof Map) {
    const itemsToInsert = await prepareItemsForInsertion(processedItems, {
      db,
      logger,
    })

    if (itemsToInsert.length > 0) {
      if (emitProgress) {
        progress.emit({
          operationId,
          type,
          phase: 'saving',
          progress: 95,
          message: `Saving ${itemsToInsert.length} items to database`,
        })
      }

      const insertedResults = await db.createWatchlistItems(
        itemsToInsert,
        isMetadataRefresh ? { onConflict: 'merge' } : { onConflict: 'ignore' },
      )
      await db.syncGenresFromWatchlist()

      // Queue newly inserted items for immediate Plex labeling if enabled
      if (
        plexLabelSyncService &&
        config.plexLabelSync?.enabled &&
        insertedResults &&
        insertedResults.length > 0
      ) {
        try {
          logger.debug(
            `Syncing immediate Plex labeling with tag fetching for ${insertedResults.length} newly added items`,
          )

          // Create a map of key -> item for efficient lookup
          const itemMap = new Map(itemsToInsert.map((item) => [item.key, item]))

          // Process inserted items with bounded concurrency to avoid overwhelming *arr services
          const concurrencyLimit = config.plexLabelSync?.concurrencyLimit || 5
          const limit = pLimit(concurrencyLimit)

          const syncResults = await Promise.allSettled(
            insertedResults.map(({ id, key }) =>
              limit(async () => {
                const originalItem = itemMap.get(key)
                if (!originalItem || !plexLabelSyncService) {
                  return false
                }

                return await plexLabelSyncService.syncLabelForNewWatchlistItem(
                  id,
                  originalItem.title,
                  true, // Enable tag fetching
                )
              }),
            ),
          )

          // Log any failures
          const failed = syncResults
            .filter((result) => result.status === 'rejected')
            .map((result) => (result as PromiseRejectedResult).reason)

          if (failed.length > 0) {
            logger.warn(
              {
                failures: failed,
              },
              `${failed.length} of ${insertedResults.length} Plex label sync operations failed`,
            )
          }
        } catch (error) {
          logger.warn(
            { error },
            'Failed to sync immediate Plex labeling for newly inserted items',
          )
        }
      }

      logger.debug(`Processed ${itemsToInsert.length} new items`)

      // REMOVED: Old notification behavior that sent "Added by X" notifications
      //          regardless of whether content was actually routed.
      // New behavior: Notifications only sent after successful routing:
      //   - RSS immediate: Checked via pendingItem.routed flag in processRssPendingItems()
      //   - Reconciliation: Sent directly from processShowWithRouting()/processMovieWithRouting()

      if (emitProgress) {
        progress.emit({
          operationId,
          type,
          phase: 'complete',
          progress: 100,
          message: 'All items processed and saved',
        })
      }
    }

    return processedItems
  }

  throw new Error(
    'Expected Map<Friend, Set<WatchlistItem>> from processWatchlistItems',
  )
}

/**
 * Links existing items to new users in the database.
 * Queues re-added items for label synchronization.
 *
 * @param existingItemsToLink - Map of users to items that need linking
 * @param deps - Dependencies for database access and logging
 */
export async function linkExistingItems(
  existingItemsToLink: Map<Friend, Set<WatchlistItem>>,
  deps: Pick<
    ItemProcessorDeps,
    'db' | 'logger' | 'handleLinkedItemsForLabelSync'
  >,
): Promise<void> {
  const { db, logger, handleLinkedItemsForLabelSync } = deps

  if (existingItemsToLink.size === 0) {
    logger.debug('No existing items to link')
    return
  }

  const linkItems: WatchlistItem[] = []
  const userCounts: Record<string, number> = {}

  for (const [user, items] of existingItemsToLink.entries()) {
    const itemArray = Array.from(items)
    linkItems.push(...itemArray)
    userCounts[user.username] = itemArray.length
  }

  if (linkItems.length === 0) {
    logger.debug('No items to link after filtering')
    return
  }

  logger.debug(
    `Linking ${linkItems.length} existing items to ${existingItemsToLink.size} users`,
  )

  logger.debug(
    {
      userCounts,
      sample: linkItems.slice(0, 3).map((item) => ({
        title: item.title,
        key: item.key,
        userId: item.user_id,
      })),
    },
    'Linking details:',
  )

  try {
    await db.createWatchlistItems(linkItems, {
      onConflict: 'merge',
    })

    await db.syncGenresFromWatchlist()

    logger.debug(
      `Successfully linked ${linkItems.length} existing items to new users`,
    )

    // Queue re-added items for label synchronization
    await handleLinkedItemsForLabelSync(linkItems)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ error: err }, 'Error linking existing items')
    throw error
  }
}
