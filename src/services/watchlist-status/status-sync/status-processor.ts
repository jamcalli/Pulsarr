/**
 * Status Processor
 *
 * Unified status update logic for syncing watchlist item statuses
 * with Sonarr/Radarr content. Uses a config pattern to handle
 * differences between show and movie status updates.
 */

import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Dependencies for status processing
 */
export interface StatusProcessorDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

/**
 * Base update fields common to both shows and movies
 */
interface BaseStatusUpdate {
  userId: number
  key: string
  added?: string
  status?: 'pending' | 'requested' | 'grabbed' | 'notified'
}

/**
 * Show-specific status update
 */
export interface ShowStatusUpdate extends BaseStatusUpdate {
  series_status?: 'continuing' | 'ended'
  sonarr_instance_id?: number
}

/**
 * Movie-specific status update
 */
export interface MovieStatusUpdate extends BaseStatusUpdate {
  movie_status?: 'available' | 'unavailable'
  radarr_instance_id?: number
}

/**
 * Configuration for processing status updates
 */
export interface StatusProcessorConfig<
  TContent extends SonarrItem | RadarrItem,
  TUpdate extends ShowStatusUpdate | MovieStatusUpdate,
> {
  contentType: 'show' | 'movie'

  /** Get the instance ID from content */
  getInstanceId: (content: TContent) => number | undefined

  /** Build content-specific update fields */
  buildContentUpdate: (
    item: DatabaseWatchlistItem,
    content: TContent,
    instanceId: number | undefined,
  ) => Partial<TUpdate>

  /** Validate content-specific status (e.g., movie_status validation) */
  validateContentStatus?: (
    content: TContent,
    logger: FastifyBaseLogger,
    itemKey: string,
  ) => boolean
}

/**
 * Find matching content by GUIDs
 */
function findMatch<T extends SonarrItem | RadarrItem>(
  items: T[],
  itemGuids: string[] | string | undefined,
): T | undefined {
  if (!itemGuids) return undefined
  const guids = parseGuids(itemGuids)
  return items.find((item) =>
    item.guids.some((itemGuid) => guids.includes(itemGuid)),
  )
}

/**
 * Process status updates for watchlist items based on *arr content.
 * Returns an array of updates to be applied via bulkUpdateWatchlistItems.
 */
export async function processStatusUpdates<
  TContent extends SonarrItem | RadarrItem,
  TUpdate extends ShowStatusUpdate | MovieStatusUpdate,
>(
  deps: StatusProcessorDeps,
  config: StatusProcessorConfig<TContent, TUpdate>,
  arrItems: TContent[],
  watchlistItems: DatabaseWatchlistItem[],
): Promise<TUpdate[]> {
  const { db, logger } = deps
  const {
    contentType,
    getInstanceId,
    buildContentUpdate,
    validateContentStatus,
  } = config

  const updates: TUpdate[] = []

  for (const item of watchlistItems) {
    const contentMatch = findMatch(arrItems, item.guids)
    if (!contentMatch) continue

    // Validate content-specific status if validator provided
    if (
      validateContentStatus &&
      !validateContentStatus(contentMatch, logger, item.key)
    ) {
      continue
    }

    const instanceId = getInstanceId(contentMatch)

    // Build base update
    const update: BaseStatusUpdate = {
      userId: item.user_id,
      key: item.key,
    }

    // Check added date change
    if (item.added !== contentMatch.added) {
      update.added = contentMatch.added
    }

    // Check status change with notified protection
    if (item.status !== contentMatch.status) {
      if (item.status !== 'notified') {
        update.status = contentMatch.status
      } else {
        // If item is notified but *arr shows it should be grabbed,
        // backfill the missing grabbed status in history
        if (contentMatch.status === 'grabbed') {
          try {
            if (item.id !== undefined && contentMatch.added) {
              const itemId =
                typeof item.id === 'string' ? Number(item.id) : item.id
              await db.addStatusHistoryEntry(
                itemId,
                'grabbed',
                contentMatch.added,
              )
            }
          } catch (error) {
            logger.error(
              { error },
              `Failed to backfill grabbed status for ${item.title}:`,
            )
          }
        } else {
          logger.debug(
            `Preventing status downgrade for ${contentType} ${item.title} [${item.key}]: keeping 'notified' instead of changing to '${contentMatch.status}'`,
          )
        }
      }
    }

    // Build content-specific fields
    const contentUpdate = buildContentUpdate(item, contentMatch, instanceId)

    // Merge updates
    const fullUpdate = { ...update, ...contentUpdate } as TUpdate

    // Only include if there are actual changes (more than just userId and key)
    if (Object.keys(fullUpdate).length > 2) {
      updates.push(fullUpdate)
    }
  }

  return updates
}

/**
 * Creates a Sonarr status processor configuration
 */
export function createSonarrStatusConfig(): StatusProcessorConfig<
  SonarrItem,
  ShowStatusUpdate
> {
  return {
    contentType: 'show',
    getInstanceId: (content) => content.sonarr_instance_id,
    buildContentUpdate: (item, content, instanceId) => {
      const update: Partial<ShowStatusUpdate> = {}

      if (item.series_status !== content.series_status) {
        update.series_status = content.series_status
      }

      if (item.sonarr_instance_id !== instanceId) {
        update.sonarr_instance_id = instanceId
      }

      return update
    },
  }
}

/**
 * Creates a Radarr status processor configuration
 */
export function createRadarrStatusConfig(
  logger: FastifyBaseLogger,
): StatusProcessorConfig<RadarrItem, MovieStatusUpdate> {
  return {
    contentType: 'movie',
    getInstanceId: (content) => content.radarr_instance_id,
    buildContentUpdate: (item, content, instanceId) => {
      const update: Partial<MovieStatusUpdate> = {}

      if (item.movie_status !== content.movie_status) {
        const ms = content.movie_status
        if (ms === 'available' || ms === 'unavailable') {
          update.movie_status = ms
        } else {
          logger.warn(
            { movie_status: ms, key: item.key },
            'Invalid movie_status; skipping update',
          )
        }
      }

      if (item.radarr_instance_id !== instanceId) {
        update.radarr_instance_id = instanceId
      }

      return update
    },
  }
}
