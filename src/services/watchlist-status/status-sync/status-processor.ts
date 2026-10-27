/**
 * Status Processor
 *
 * Unified status update logic for syncing watchlist item statuses
 * with Sonarr/Radarr content. Uses a config pattern to handle
 * differences between show and movie status updates.
 */

import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type {
  DatabaseWatchlistItem,
  WatchlistStatus,
} from '@root/types/watchlist-status.types.js'
import { isStatusUpgrade, STATUS_RANK } from '@utils/watchlist-status-rank.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Dependencies for status processing
 */
export interface StatusProcessorDeps {
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
}

/**
 * Movie-specific status update
 */
export interface MovieStatusUpdate extends BaseStatusUpdate {
  movie_status?: 'available' | 'unavailable'
}

/**
 * Configuration for processing status updates
 */
export interface StatusProcessorConfig<
  TContent extends SonarrItem | RadarrItem,
  TUpdate extends ShowStatusUpdate | MovieStatusUpdate,
> {
  /** Build content-specific update fields from a non-empty match list */
  buildContentUpdate: (
    item: DatabaseWatchlistItem,
    matches: TContent[],
  ) => Partial<TUpdate>

  /** Validate content-specific status (e.g., movie_status validation) */
  validateContentStatus?: (
    content: TContent,
    logger: FastifyBaseLogger,
    itemKey: string,
  ) => boolean
}

function highestStatus(
  matches: Array<SonarrItem | RadarrItem>,
): WatchlistStatus | undefined {
  let best: WatchlistStatus | undefined
  for (const { status } of matches) {
    if (status && (!best || STATUS_RANK[status] > STATUS_RANK[best])) {
      best = status
    }
  }
  return best
}

function earliestAdded(
  matches: Array<SonarrItem | RadarrItem>,
): string | undefined {
  let earliest: string | undefined
  for (const { added } of matches) {
    if (
      added !== undefined &&
      (earliest === undefined || Date.parse(added) < Date.parse(earliest))
    ) {
      earliest = added
    }
  }
  return earliest
}

/**
 * Process status updates for watchlist items based on *arr content.
 * Returns an array of updates to be applied via bulkUpdateWatchlistItems.
 */
export function processStatusUpdates<
  TContent extends SonarrItem | RadarrItem,
  TUpdate extends ShowStatusUpdate | MovieStatusUpdate,
>(
  deps: StatusProcessorDeps,
  config: StatusProcessorConfig<TContent, TUpdate>,
  matchesByWatchlistId: Map<number, TContent[]>,
  watchlistItems: DatabaseWatchlistItem[],
): TUpdate[] {
  const { logger } = deps
  const { buildContentUpdate, validateContentStatus } = config

  const updates: TUpdate[] = []

  for (const item of watchlistItems) {
    if (item.id === undefined) continue
    const matches = (matchesByWatchlistId.get(item.id) ?? []).filter(
      (match) =>
        !validateContentStatus ||
        validateContentStatus(match, logger, item.key),
    )
    if (matches.length === 0) continue

    const update: BaseStatusUpdate = {
      userId: item.user_id,
      key: item.key,
    }

    const added = earliestAdded(matches)
    if (added !== undefined && item.added !== added) {
      update.added = added
    }

    const status = highestStatus(matches)
    if (status && isStatusUpgrade(item.status, status)) {
      update.status = status
    }

    const fullUpdate = {
      ...update,
      ...buildContentUpdate(item, matches),
    } as TUpdate

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
    buildContentUpdate: (item, [first]) => {
      const update: Partial<ShowStatusUpdate> = {}

      if (item.series_status !== first.series_status) {
        update.series_status = first.series_status
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
    buildContentUpdate: (item, matches) => {
      const update: Partial<MovieStatusUpdate> = {}
      const ms = matches.some((match) => match.movie_status === 'available')
        ? 'available'
        : matches.find((match) => match.movie_status)?.movie_status

      if (item.movie_status !== ms) {
        if (ms === 'available' || ms === 'unavailable') {
          update.movie_status = ms
        } else {
          logger.warn(
            { movie_status: ms, key: item.key },
            'Invalid movie_status; skipping update',
          )
        }
      }

      return update
    },
  }
}
