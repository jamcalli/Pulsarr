/**
 * Item Copier
 *
 * Unified single-item copy logic for syncing content to *arr instances.
 * Handles both movies (Radarr) and shows (Sonarr).
 */

import type { User } from '@root/types/config.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'
import type { ContentRouterService } from '@services/content-router.service.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Dependencies for item copy operations
 */
export interface ItemCopierDeps {
  contentRouter: ContentRouterService
  logger: FastifyBaseLogger
}

/**
 * Context for copying a single item
 */
export interface CopyItemContext {
  item: DatabaseWatchlistItem
  matchingContent: SonarrItem | RadarrItem
  instanceId: number
  contentType: 'movie' | 'show'
  /** Pre-fetched user data (avoids N+1 queries) */
  user: User | undefined
}

/**
 * Copies a single watchlist item to a target *arr instance.
 * Uses the content router with syncTargetInstanceId to respect routing rules.
 *
 * @returns true if item was successfully routed to the target instance
 */
export async function copySingleItem(
  deps: ItemCopierDeps,
  ctx: CopyItemContext,
): Promise<boolean> {
  const { contentRouter, logger } = deps
  const { item, matchingContent, instanceId, contentType, user } = ctx

  try {
    const userId = item.user_id
    const userName = user?.name
    const canSync = user?.can_sync !== false

    // If user cannot sync, skip the item
    if (!canSync) {
      logger.debug(
        `Skipping ${contentType} ${item.title} sync as user ${userId} has sync disabled`,
      )
      return false
    }

    // Use the content router with syncTargetInstanceId to respect routing rules
    const routingResult = await contentRouter.routeContent(
      matchingContent,
      item.key,
      {
        userId,
        userName,
        syncing: true,
        syncTargetInstanceId: instanceId,
      },
    )

    // Check if the item was routed to the target instance
    if (routingResult.routedInstances.includes(instanceId)) {
      logger.debug(
        `Copied ${contentType} ${item.title} to instance ${instanceId} via content router`,
      )
      return true
    }

    logger.info(
      `${contentType === 'movie' ? 'Movie' : 'Show'} ${item.title} was not routed to instance ${instanceId} due to routing rules`,
    )
    return false
  } catch (error) {
    logger.error(
      { error, instanceId, title: item.title },
      `Error copying ${contentType} to instance`,
    )
    return false
  }
}
