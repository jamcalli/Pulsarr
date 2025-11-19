/**
 * Queue Manager Module
 *
 * Handles queueing content items for pending sync when they are not yet available in Plex.
 * Manages the pending sync queue with expiration tracking.
 */

import type { ContentWithUsers } from '@root/types/plex-label-sync.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface QueueManagerDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

/**
 * Queues unavailable content items for pending sync.
 *
 * @param unavailableContent - Content items not yet available in Plex
 * @param deps - Service dependencies
 */
export async function queueUnavailableContent(
  unavailableContent: ContentWithUsers[],
  deps: QueueManagerDeps,
): Promise<void> {
  let queuedCount = 0

  for (const content of unavailableContent) {
    for (const user of content.users) {
      try {
        await queuePendingLabelSyncByWatchlistId(
          user.watchlist_id,
          content.title,
          deps,
        )
        queuedCount++
      } catch (error) {
        deps.logger.error(
          {
            watchlistId: user.watchlist_id,
            title: content.title,
            error,
          },
          'Failed to queue pending label sync',
        )
      }
    }
  }

  deps.logger.info(
    {
      contentCount: unavailableContent.length,
      queuedWatchlistItems: queuedCount,
    },
    'Queued unavailable content for pending sync',
  )
}

/**
 * Queues a pending label sync for a specific watchlist item.
 * Used when content is not yet available in Plex but should be monitored.
 *
 * @param watchlistItemId - The watchlist item ID to queue
 * @param title - The title of the content
 * @param deps - Service dependencies
 * @param webhookTags - Optional webhook tags to store for later application
 */
export async function queuePendingLabelSyncByWatchlistId(
  watchlistItemId: number,
  title: string,
  deps: QueueManagerDeps,
  webhookTags: string[] = [],
): Promise<void> {
  try {
    await deps.db.createPendingLabelSync(
      watchlistItemId,
      title,
      10, // 10 minute default expiration
      webhookTags,
    )
  } catch (error) {
    deps.logger.error({ error }, 'Error queuing pending label sync:')
  }
}
