import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { SonarrEpisodeSchema } from '@root/types/sonarr.types.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'
import { processIndividualNotification } from './notification-sender.js'

/**
 * Dispatches notifications for media content updates to users and public channels.
 *
 * Retrieves notification targets from the database, determines matching watchlist items, and sends notifications via configured services (Discord, Apprise, Tautulli). Supports both sequential and concurrent processing with a concurrency limit.
 *
 * @param mediaInfo - Information about the media content being updated.
 * @param isBulkRelease - Whether the update is a bulk release (such as a full season).
 * @param options - Optional settings for logging and sequential processing.
 * @returns An object with the count of matched watchlist items.
 */
export async function processContentNotifications(
  fastify: FastifyInstance,
  mediaInfo: {
    type: 'movie' | 'show'
    guid: string
    title: string
    episodes?: SonarrEpisodeSchema[]
  },
  isBulkRelease: boolean,
  options?: {
    logger?: FastifyBaseLogger
    sequential?: boolean // for webhook.ts which uses for...of instead of Promise.all
    instanceId?: number // Pass through instance ID from webhook
    instanceType?: 'sonarr' | 'radarr' // Pass through instance type
  },
): Promise<{ matchedCount: number }> {
  // Get notification results (includes both individual user notifications and public notifications)
  const notificationResults = await fastify.db.processNotifications(
    mediaInfo,
    isBulkRelease,
    options?.instanceId,
    options?.instanceType,
  )

  // Early exit if there are no notifications to process
  if (notificationResults.length === 0) {
    return { matchedCount: 0 }
  }

  // Get matching watchlist items for Tautulli notifications
  const matchingItems = await fastify.db.getWatchlistItemsByGuid(mediaInfo.guid)

  // Create an index for O(1) user lookups instead of O(n) find operations
  const itemByUserId = new Map<number, TokenWatchlistItem>()
  for (const item of matchingItems) {
    itemByUserId.set(item.user_id, item)
  }

  // Process notifications either sequentially or concurrently
  if (options?.sequential) {
    for (const result of notificationResults) {
      await processIndividualNotification(
        fastify,
        result,
        notificationResults,
        itemByUserId,
        mediaInfo,
        options,
      )
    }
  } else {
    // Process notifications concurrently with rate limiting to prevent API throttling
    const limit = pLimit(10) // Limit to 10 concurrent notifications
    await Promise.all(
      notificationResults.map((result) =>
        limit(() =>
          processIndividualNotification(
            fastify,
            result,
            notificationResults,
            itemByUserId,
            mediaInfo,
            options,
          ),
        ),
      ),
    )
  }

  // Return summary with match count to avoid duplicate DB queries
  return { matchedCount: matchingItems.length }
}
