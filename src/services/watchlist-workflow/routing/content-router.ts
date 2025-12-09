/**
 * Content Router Module
 *
 * Provides unified routing logic for both shows and movies.
 * Consolidates the duplicate processShowWithRouting/processMovieWithRouting
 * methods into a single generic function.
 */

import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { RoutingContext } from '@root/types/router.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import {
  extractTmdbId,
  extractTvdbId,
  getGuidMatchScore,
  parseGuids,
} from '@utils/guid-handler.js'
import type { ContentRoutingDeps } from '../types.js'

/**
 * Result of content routing
 */
export interface RouteContentResult {
  /** Whether content was routed (added to Sonarr/Radarr) */
  routed: boolean
  /** Reason if skipped */
  skippedReason?:
    | 'no-target'
    | 'exists-in-target'
    | 'exists-on-plex'
    | 'no-instances-available'
    | 'no-valid-id'
}

/**
 * Parameters for routing a show
 */
export interface RouteShowParams {
  /** Temporary item with routing metadata */
  tempItem: TemptRssWatchlistItem
  /** User ID requesting the content */
  userId: number
  /** Username for notifications */
  userName: string | undefined
  /** Sonarr item for routing */
  sonarrItem: SonarrItem
  /** Pre-fetched existing series for bulk mode (reconciliation path) */
  existingSeries?: SonarrItem[]
  /** Primary user for Plex existence checks */
  primaryUser: { id: number } | null
}

/**
 * Parameters for routing a movie
 */
export interface RouteMovieParams {
  /** Temporary item with routing metadata */
  tempItem: TemptRssWatchlistItem
  /** User ID requesting the content */
  userId: number
  /** Username for notifications */
  userName: string | undefined
  /** Radarr item for routing */
  radarrItem: RadarrItem
  /** Pre-fetched existing movies for bulk mode (reconciliation path) */
  existingMovies?: RadarrItem[]
  /** Primary user for Plex existence checks */
  primaryUser: { id: number } | null
}

/**
 * Check if show exists in target instances using bulk data (reconciliation path)
 */
function checkShowExistsInBulkData(
  tempItem: TemptRssWatchlistItem,
  existingSeries: SonarrItem[],
  targetInstanceIds: number[],
): boolean {
  const targetInstanceSeries = existingSeries.filter(
    (series) =>
      series.sonarr_instance_id !== undefined &&
      targetInstanceIds.includes(series.sonarr_instance_id),
  )

  const potentialMatches = targetInstanceSeries
    .map((series) => ({
      series,
      score: getGuidMatchScore(
        parseGuids(series.guids),
        parseGuids(tempItem.guids),
      ),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)

  return potentialMatches.length > 0
}

/**
 * Check if movie exists in target instances using bulk data (reconciliation path)
 */
function checkMovieExistsInBulkData(
  tempItem: TemptRssWatchlistItem,
  existingMovies: RadarrItem[],
  targetInstanceIds: number[],
): boolean {
  const targetInstanceMovies = existingMovies.filter(
    (movie) =>
      movie.radarr_instance_id !== undefined &&
      targetInstanceIds.includes(movie.radarr_instance_id),
  )

  const potentialMatches = targetInstanceMovies
    .map((movie) => ({
      movie,
      score: getGuidMatchScore(
        parseGuids(movie.guids),
        parseGuids(tempItem.guids),
      ),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)

  return potentialMatches.length > 0
}

/**
 * Check if show exists in target instances using API lookup (ETag path)
 */
async function checkShowExistsViaApi(
  tempItem: TemptRssWatchlistItem,
  targetInstanceIds: number[],
  deps: ContentRoutingDeps,
): Promise<{ exists: boolean; anyChecked: boolean }> {
  const guids = parseGuids(tempItem.guids)
  const tvdbId = extractTvdbId(guids)

  if (tvdbId <= 0) {
    return { exists: false, anyChecked: true }
  }

  let anyChecked = false
  for (const instanceId of targetInstanceIds) {
    const result = await deps.sonarrManager.seriesExistsByTvdbId(
      instanceId,
      tvdbId,
    )
    if (!result.checked) {
      deps.logger.warn(
        { error: result.error, instanceId },
        `Sonarr instance ${instanceId} unavailable for ${tempItem.title}, skipping instance`,
      )
      continue
    }
    anyChecked = true
    if (result.found) {
      return { exists: true, anyChecked: true }
    }
  }
  return { exists: false, anyChecked }
}

/**
 * Check if movie exists in target instances using API lookup (ETag path)
 */
async function checkMovieExistsViaApi(
  tempItem: TemptRssWatchlistItem,
  targetInstanceIds: number[],
  deps: ContentRoutingDeps,
): Promise<{ exists: boolean; anyChecked: boolean }> {
  const guids = parseGuids(tempItem.guids)
  const tmdbId = extractTmdbId(guids)

  if (tmdbId <= 0) {
    return { exists: false, anyChecked: true }
  }

  let anyChecked = false
  for (const instanceId of targetInstanceIds) {
    const result = await deps.radarrManager.movieExistsByTmdbId(
      instanceId,
      tmdbId,
    )
    if (!result.checked) {
      deps.logger.warn(
        { error: result.error, instanceId },
        `Radarr instance ${instanceId} unavailable for ${tempItem.title}, skipping instance`,
      )
      continue
    }
    anyChecked = true
    if (result.found) {
      return { exists: true, anyChecked: true }
    }
  }
  return { exists: false, anyChecked }
}

/**
 * Send notification for routed content
 */
async function sendRoutingNotification(
  tempItem: TemptRssWatchlistItem,
  userId: number,
  userName: string,
  contentType: 'show' | 'movie',
  deps: ContentRoutingDeps,
): Promise<void> {
  const existingNotifications = await deps.db.checkExistingWebhooks(userId, [
    tempItem.title,
  ])

  if (!existingNotifications.get(tempItem.title)) {
    await deps.plexService.sendWatchlistNotifications(
      {
        userId,
        username: userName,
        watchlistId: String(userId),
      },
      {
        title: tempItem.title,
        type: contentType,
        thumb: tempItem.thumb,
      },
    )
  } else {
    deps.logger.debug(
      `Skipping notification for "${tempItem.title}" - already sent previously to user ${userName}`,
    )
  }
}

/**
 * Route a show to Sonarr.
 *
 * Handles:
 * - Getting target instances from router rules
 * - Checking existence in target instances (bulk or API)
 * - Checking Plex existence if configured
 * - Routing to Sonarr
 * - Sending notifications
 *
 * @param params - Routing parameters
 * @param deps - Service dependencies
 * @returns Result indicating whether content was routed
 */
export async function routeShow(
  params: RouteShowParams,
  deps: ContentRoutingDeps,
): Promise<RouteContentResult> {
  const {
    tempItem,
    userId,
    userName,
    sonarrItem,
    existingSeries,
    primaryUser,
  } = params

  // Defensive check: Sonarr requires TVDB ID
  const tvdbId = extractTvdbId(parseGuids(tempItem.guids))
  if (tvdbId <= 0) {
    deps.logger.warn(
      { title: tempItem.title, userId },
      'Show has no valid TVDB ID - Sonarr cannot add without it, skipping',
    )
    return { routed: false, skippedReason: 'no-valid-id' }
  }

  // Get target instances based on routing rules
  const context: RoutingContext = {
    userId,
    userName,
    itemKey: tempItem.key,
    contentType: 'show',
    syncing: false,
  }

  const targetInstanceIds = await deps.contentRouter.getTargetInstances(
    sonarrItem,
    context,
  )

  if (targetInstanceIds.length === 0) {
    deps.logger.warn(
      `No target instances available for show ${tempItem.title}, skipping`,
    )
    return { routed: false, skippedReason: 'no-target' }
  }

  // Check existence in target instances
  let existsInTargetInstance = false

  if (existingSeries) {
    existsInTargetInstance = checkShowExistsInBulkData(
      tempItem,
      existingSeries,
      targetInstanceIds,
    )
  } else {
    const { exists, anyChecked } = await checkShowExistsViaApi(
      tempItem,
      targetInstanceIds,
      deps,
    )

    if (!anyChecked) {
      deps.logger.warn(
        { title: tempItem.title, targetInstanceIds },
        'No Sonarr instances available to check existence, skipping item',
      )
      return { routed: false, skippedReason: 'no-instances-available' }
    }

    existsInTargetInstance = exists
  }

  if (existsInTargetInstance) {
    deps.logger.debug(
      `Show ${tempItem.title} already exists in target instance(s) ${targetInstanceIds.join(', ')}, skipping addition`,
    )
    return { routed: false, skippedReason: 'exists-in-target' }
  }

  // Check Plex existence if configured
  if (deps.config.skipIfExistsOnPlex) {
    const isPrimaryUser = primaryUser ? userId === primaryUser.id : false

    const existsOnPlex =
      await deps.plexServerService.checkExistenceAcrossServers(
        tempItem.key,
        'show',
        isPrimaryUser,
      )

    if (existsOnPlex) {
      deps.logger.info(
        `Show ${tempItem.title} already exists on an accessible Plex server, skipping addition`,
      )
      return { routed: false, skippedReason: 'exists-on-plex' }
    }
  }

  // Route content
  const { routedInstances } = await deps.contentRouter.routeContent(
    sonarrItem,
    tempItem.key,
    {
      userId,
      userName,
      syncing: false,
    },
  )

  // Send notification if routed
  if (routedInstances.length > 0 && userName) {
    await sendRoutingNotification(tempItem, userId, userName, 'show', deps)
  }

  return { routed: routedInstances.length > 0 }
}

/**
 * Route a movie to Radarr.
 *
 * Handles:
 * - Getting target instances from router rules
 * - Checking existence in target instances (bulk or API)
 * - Checking Plex existence if configured
 * - Routing to Radarr
 * - Sending notifications
 *
 * @param params - Routing parameters
 * @param deps - Service dependencies
 * @returns Result indicating whether content was routed
 */
export async function routeMovie(
  params: RouteMovieParams,
  deps: ContentRoutingDeps,
): Promise<RouteContentResult> {
  const {
    tempItem,
    userId,
    userName,
    radarrItem,
    existingMovies,
    primaryUser,
  } = params

  // Defensive check: Radarr requires TMDB ID
  const tmdbId = extractTmdbId(parseGuids(tempItem.guids))
  if (tmdbId <= 0) {
    deps.logger.warn(
      { title: tempItem.title, userId },
      'Movie has no valid TMDB ID - Radarr cannot add without it, skipping',
    )
    return { routed: false, skippedReason: 'no-valid-id' }
  }

  // Get target instances based on routing rules
  const context: RoutingContext = {
    userId,
    userName,
    itemKey: tempItem.key,
    contentType: 'movie',
    syncing: false,
  }

  const targetInstanceIds = await deps.contentRouter.getTargetInstances(
    radarrItem,
    context,
  )

  if (targetInstanceIds.length === 0) {
    deps.logger.warn(
      `No target instances available for movie ${tempItem.title}, skipping`,
    )
    return { routed: false, skippedReason: 'no-target' }
  }

  // Check existence in target instances
  let existsInTargetInstance = false

  if (existingMovies) {
    existsInTargetInstance = checkMovieExistsInBulkData(
      tempItem,
      existingMovies,
      targetInstanceIds,
    )
  } else {
    const { exists, anyChecked } = await checkMovieExistsViaApi(
      tempItem,
      targetInstanceIds,
      deps,
    )

    if (!anyChecked) {
      deps.logger.warn(
        { title: tempItem.title, targetInstanceIds },
        'No Radarr instances available to check existence, skipping item',
      )
      return { routed: false, skippedReason: 'no-instances-available' }
    }

    existsInTargetInstance = exists
  }

  if (existsInTargetInstance) {
    deps.logger.debug(
      `Movie ${tempItem.title} already exists in target instance(s) ${targetInstanceIds.join(', ')}, skipping addition`,
    )
    return { routed: false, skippedReason: 'exists-in-target' }
  }

  // Check Plex existence if configured
  if (deps.config.skipIfExistsOnPlex) {
    const isPrimaryUser = primaryUser ? userId === primaryUser.id : false

    const existsOnPlex =
      await deps.plexServerService.checkExistenceAcrossServers(
        tempItem.key,
        'movie',
        isPrimaryUser,
      )

    if (existsOnPlex) {
      deps.logger.info(
        `Movie ${tempItem.title} already exists on an accessible Plex server, skipping addition`,
      )
      return { routed: false, skippedReason: 'exists-on-plex' }
    }
  }

  // Route content
  const { routedInstances } = await deps.contentRouter.routeContent(
    radarrItem,
    tempItem.key,
    {
      userId,
      userName,
      syncing: false,
    },
  )

  // Send notification if routed
  if (routedInstances.length > 0 && userName) {
    await sendRoutingNotification(tempItem, userId, userName, 'movie', deps)
  }

  return { routed: routedInstances.length > 0 }
}
