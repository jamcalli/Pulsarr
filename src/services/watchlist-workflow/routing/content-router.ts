import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type {
  RoutingContext,
  RoutingDetails,
} from '@root/types/router.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import {
  extractTmdbId,
  extractTvdbId,
  hasMatchingParsedGuids,
  parseGuids,
} from '@utils/guid-handler.js'
import type { ContentRoutingDeps } from '../types.js'

export interface RouteContentResult {
  routed: boolean
  skippedReason?:
    | 'no-target'
    | 'default-skip'
    | 'excluded'
    | 'exists-in-target'
    | 'exists-on-plex'
    | 'no-instances-available'
    | 'no-valid-id'
}

export interface RouteShowParams {
  tempItem: TemptRssWatchlistItem
  userId: number
  userName: string | undefined
  sonarrItem: SonarrItem
  existingSeries?: SonarrItem[]
  primaryUser: { id: number } | null
}

export interface RouteMovieParams {
  tempItem: TemptRssWatchlistItem
  userId: number
  userName: string | undefined
  radarrItem: RadarrItem
  existingMovies?: RadarrItem[]
  primaryUser: { id: number } | null
}

function checkShowExistsInBulkData(
  tempItem: TemptRssWatchlistItem,
  existingSeries: SonarrItem[],
  targetInstanceIds: number[],
): boolean {
  const tempGuids = parseGuids(tempItem.guids)
  const targetInstanceSeries = existingSeries.filter(
    (series) =>
      series.sonarr_instance_id !== undefined &&
      targetInstanceIds.includes(series.sonarr_instance_id),
  )

  return targetInstanceSeries.some((series) =>
    hasMatchingParsedGuids(parseGuids(series.guids), tempGuids),
  )
}

function checkMovieExistsInBulkData(
  tempItem: TemptRssWatchlistItem,
  existingMovies: RadarrItem[],
  targetInstanceIds: number[],
): boolean {
  const tempGuids = parseGuids(tempItem.guids)
  const targetInstanceMovies = existingMovies.filter(
    (movie) =>
      movie.radarr_instance_id !== undefined &&
      targetInstanceIds.includes(movie.radarr_instance_id),
  )

  return targetInstanceMovies.some((movie) =>
    hasMatchingParsedGuids(parseGuids(movie.guids), tempGuids),
  )
}

// Caller must validate the TVDB ID before calling this
async function checkShowExistsViaApi(
  tempItem: TemptRssWatchlistItem,
  targetInstanceIds: number[],
  deps: ContentRoutingDeps,
): Promise<{ exists: boolean; excluded: boolean; anyChecked: boolean }> {
  const tvdbId = extractTvdbId(parseGuids(tempItem.guids))

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
      return {
        exists: true,
        excluded: result.excluded === true,
        anyChecked: true,
      }
    }
  }
  return { exists: false, excluded: false, anyChecked }
}

// Caller must validate the TMDB ID before calling this
async function checkMovieExistsViaApi(
  tempItem: TemptRssWatchlistItem,
  targetInstanceIds: number[],
  deps: ContentRoutingDeps,
): Promise<{ exists: boolean; excluded: boolean; anyChecked: boolean }> {
  const tmdbId = extractTmdbId(parseGuids(tempItem.guids))

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
      return {
        exists: true,
        excluded: result.excluded === true,
        anyChecked: true,
      }
    }
  }
  return { exists: false, excluded: false, anyChecked }
}

async function sendRoutingNotification(
  tempItem: TemptRssWatchlistItem,
  userId: number,
  userName: string,
  contentType: 'show' | 'movie',
  routingDetails: RoutingDetails[],
  deps: ContentRoutingDeps,
): Promise<void> {
  const existingNotifications = await deps.db.checkExistingWebhooks(userId, [
    tempItem.title,
  ])

  if (!existingNotifications.get(tempItem.title)) {
    await deps.notifications.sendWatchlistAdded(
      {
        userId,
        username: userName,
        watchlistId: String(userId),
      },
      {
        title: tempItem.title,
        type: contentType,
        thumb: tempItem.thumb,
        key: tempItem.key,
        guids: tempItem.guids,
      },
      routingDetails,
    )
  } else {
    deps.logger.debug(
      `Skipping notification for "${tempItem.title}" - already sent previously to user ${userName}`,
    )
  }
}

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

  const tvdbId = extractTvdbId(parseGuids(tempItem.guids))
  if (tvdbId <= 0) {
    deps.logger.warn(
      { title: tempItem.title, userId },
      'Show has no valid TVDB ID - Sonarr cannot add without it, skipping',
    )
    return { routed: false, skippedReason: 'no-valid-id' }
  }

  const context: RoutingContext = {
    userId,
    userName,
    itemKey: tempItem.key,
    contentType: 'show',
    syncing: false,
  }

  const { instanceIds: targetInstanceIds, skipReason } =
    await deps.contentRouter.getTargetInstances(sonarrItem, context)

  if (targetInstanceIds.length === 0) {
    if (skipReason) {
      deps.logger.debug(
        `Show ${tempItem.title} not routed (${skipReason}), skipping`,
      )
      return { routed: false, skippedReason: skipReason }
    }
    deps.logger.warn(
      `No target instances available for show ${tempItem.title}, skipping`,
    )
    return { routed: false, skippedReason: 'no-target' }
  }

  if (existingSeries) {
    const existsInTargetInstance = checkShowExistsInBulkData(
      tempItem,
      existingSeries,
      targetInstanceIds,
    )
    if (existsInTargetInstance) {
      deps.logger.debug(
        `Show ${tempItem.title} already exists in Sonarr instance(s) ${targetInstanceIds.join(', ')}, skipping addition`,
      )
      return { routed: false, skippedReason: 'exists-in-target' }
    }
  } else {
    const { exists, excluded, anyChecked } = await checkShowExistsViaApi(
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

    if (exists) {
      deps.logger.info(
        excluded
          ? `Show ${tempItem.title} is an import list exclusion in Sonarr instance(s) ${targetInstanceIds.join(', ')}, skipping addition`
          : `Show ${tempItem.title} already exists in Sonarr instance(s) ${targetInstanceIds.join(', ')}, skipping addition`,
      )
      return { routed: false, skippedReason: 'exists-in-target' }
    }
  }

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

  const { routedInstances, routingDetails } =
    await deps.contentRouter.routeContent(sonarrItem, tempItem.key, {
      userId,
      userName,
      syncing: false,
    })

  if (routedInstances.length > 0 && userName) {
    await sendRoutingNotification(
      tempItem,
      userId,
      userName,
      'show',
      routingDetails,
      deps,
    )
  }

  return { routed: routedInstances.length > 0 }
}

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

  const tmdbId = extractTmdbId(parseGuids(tempItem.guids))
  if (tmdbId <= 0) {
    deps.logger.warn(
      { title: tempItem.title, userId },
      'Movie has no valid TMDB ID - Radarr cannot add without it, skipping',
    )
    return { routed: false, skippedReason: 'no-valid-id' }
  }

  const context: RoutingContext = {
    userId,
    userName,
    itemKey: tempItem.key,
    contentType: 'movie',
    syncing: false,
  }

  const { instanceIds: targetInstanceIds, skipReason } =
    await deps.contentRouter.getTargetInstances(radarrItem, context)

  if (targetInstanceIds.length === 0) {
    if (skipReason) {
      deps.logger.debug(
        `Movie ${tempItem.title} not routed (${skipReason}), skipping`,
      )
      return { routed: false, skippedReason: skipReason }
    }
    deps.logger.warn(
      `No target instances available for movie ${tempItem.title}, skipping`,
    )
    return { routed: false, skippedReason: 'no-target' }
  }

  if (existingMovies) {
    const existsInTargetInstance = checkMovieExistsInBulkData(
      tempItem,
      existingMovies,
      targetInstanceIds,
    )
    if (existsInTargetInstance) {
      deps.logger.debug(
        `Movie ${tempItem.title} already exists in Radarr instance(s) ${targetInstanceIds.join(', ')}, skipping addition`,
      )
      return { routed: false, skippedReason: 'exists-in-target' }
    }
  } else {
    const { exists, excluded, anyChecked } = await checkMovieExistsViaApi(
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

    if (exists) {
      deps.logger.info(
        excluded
          ? `Movie ${tempItem.title} is an import list exclusion in Radarr instance(s) ${targetInstanceIds.join(', ')}, skipping addition`
          : `Movie ${tempItem.title} already exists in Radarr instance(s) ${targetInstanceIds.join(', ')}, skipping addition`,
      )
      return { routed: false, skippedReason: 'exists-in-target' }
    }
  }

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

  const { routedInstances, routingDetails } =
    await deps.contentRouter.routeContent(radarrItem, tempItem.key, {
      userId,
      userName,
      syncing: false,
    })

  if (routedInstances.length > 0 && userName) {
    await sendRoutingNotification(
      tempItem,
      userId,
      userName,
      'movie',
      routingDetails,
      deps,
    )
  }

  return { routed: routedInstances.length > 0 }
}
