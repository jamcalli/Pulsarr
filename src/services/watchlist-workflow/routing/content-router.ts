import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type {
  ContentItem,
  RoutingContext,
  RoutingDetails,
} from '@root/types/router.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import {
  approvedDestinations,
  routeUsingApprovedDecision,
} from '@services/content-router/approved-routing.js'
import type { RoutingOutcome } from '@services/content-router/types.js'
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

interface ApiPresence {
  presentInstanceIds: number[]
  excluded: boolean
  allChecked: boolean
}

function findShowInBulkData(
  tempItem: TemptRssWatchlistItem,
  existingSeries: SonarrItem[],
  targetInstanceIds: number[],
): number[] {
  const tempGuids = parseGuids(tempItem.guids)
  return targetInstanceIds.filter((instanceId) =>
    existingSeries.some(
      (series) =>
        series.sonarr_instance_id === instanceId &&
        hasMatchingParsedGuids(parseGuids(series.guids), tempGuids),
    ),
  )
}

function findMovieInBulkData(
  tempItem: TemptRssWatchlistItem,
  existingMovies: RadarrItem[],
  targetInstanceIds: number[],
): number[] {
  const tempGuids = parseGuids(tempItem.guids)
  return targetInstanceIds.filter((instanceId) =>
    existingMovies.some(
      (movie) =>
        movie.radarr_instance_id === instanceId &&
        hasMatchingParsedGuids(parseGuids(movie.guids), tempGuids),
    ),
  )
}

// Caller must validate the TVDB ID before calling this
async function findShowViaApi(
  tempItem: TemptRssWatchlistItem,
  targetInstanceIds: number[],
  deps: ContentRoutingDeps,
): Promise<ApiPresence> {
  const tvdbId = extractTvdbId(parseGuids(tempItem.guids))
  const presentInstanceIds: number[] = []
  let excluded = false

  for (const instanceId of targetInstanceIds) {
    const result = await deps.sonarrManager.seriesExistsByTvdbId(
      instanceId,
      tvdbId,
    )
    if (!result.checked) {
      deps.logger.warn(
        { error: result.error, instanceId },
        `Sonarr instance ${instanceId} could not be checked for ${tempItem.title}`,
      )
      return { presentInstanceIds: [], excluded: false, allChecked: false }
    }
    if (result.found) {
      presentInstanceIds.push(instanceId)
      excluded ||= result.excluded === true
    }
  }
  return { presentInstanceIds, excluded, allChecked: true }
}

// Caller must validate the TMDB ID before calling this
async function findMovieViaApi(
  tempItem: TemptRssWatchlistItem,
  targetInstanceIds: number[],
  deps: ContentRoutingDeps,
): Promise<ApiPresence> {
  const tmdbId = extractTmdbId(parseGuids(tempItem.guids))
  const presentInstanceIds: number[] = []
  let excluded = false

  for (const instanceId of targetInstanceIds) {
    const result = await deps.radarrManager.movieExistsByTmdbId(
      instanceId,
      tmdbId,
    )
    if (!result.checked) {
      deps.logger.warn(
        { error: result.error, instanceId },
        `Radarr instance ${instanceId} could not be checked for ${tempItem.title}`,
      )
      return { presentInstanceIds: [], excluded: false, allChecked: false }
    }
    if (result.found) {
      presentInstanceIds.push(instanceId)
      excluded ||= result.excluded === true
    }
  }
  return { presentInstanceIds, excluded, allChecked: true }
}

async function completeFromApproval(
  item: ContentItem,
  context: RoutingContext,
  presentInstanceIds: number[],
  deps: ContentRoutingDeps,
): Promise<RoutingOutcome | null> {
  const request = await deps.db.getApprovalRequestByContent(
    context.userId,
    context.itemKey,
  )
  if (request?.status !== 'approved' && request?.status !== 'auto_approved') {
    return null
  }
  const missingInstanceIds = approvedDestinations(request).filter(
    (instanceId) => !presentInstanceIds.includes(instanceId),
  )
  if (missingInstanceIds.length === 0) {
    return null
  }
  return await routeUsingApprovedDecision(
    request,
    item,
    context,
    deps,
    missingInstanceIds,
  )
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

async function reportRouted(
  tempItem: TemptRssWatchlistItem,
  userId: number,
  userName: string | undefined,
  contentType: 'show' | 'movie',
  { routedInstances, routingDetails }: RoutingOutcome,
  deps: ContentRoutingDeps,
): Promise<RouteContentResult> {
  if (routedInstances.length > 0 && userName) {
    await sendRoutingNotification(
      tempItem,
      userId,
      userName,
      contentType,
      routingDetails,
      deps,
    )
  }
  return { routed: routedInstances.length > 0 }
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

  let presentInstanceIds: number[]
  if (existingSeries) {
    presentInstanceIds = findShowInBulkData(
      tempItem,
      existingSeries,
      targetInstanceIds,
    )
  } else {
    const presence = await findShowViaApi(tempItem, targetInstanceIds, deps)

    if (!presence.allChecked) {
      deps.logger.warn(
        { title: tempItem.title, targetInstanceIds },
        'Not every target Sonarr instance could be checked, skipping item',
      )
      return { routed: false, skippedReason: 'no-instances-available' }
    }

    if (presence.excluded) {
      deps.logger.info(
        `Show ${tempItem.title} is an import list exclusion in Sonarr instance(s) ${presence.presentInstanceIds.join(', ')}, skipping addition`,
      )
      return { routed: false, skippedReason: 'exists-in-target' }
    }
    presentInstanceIds = presence.presentInstanceIds
  }

  if (presentInstanceIds.length > 0) {
    const completion =
      presentInstanceIds.length < targetInstanceIds.length
        ? await completeFromApproval(
            sonarrItem,
            context,
            presentInstanceIds,
            deps,
          )
        : null
    if (!completion) {
      deps.logger.debug(
        `Show ${tempItem.title} already exists in Sonarr instance(s) ${presentInstanceIds.join(', ')}, skipping addition`,
      )
      return { routed: false, skippedReason: 'exists-in-target' }
    }
    return await reportRouted(
      tempItem,
      userId,
      userName,
      'show',
      completion,
      deps,
    )
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

  const outcome = await deps.contentRouter.routeContent(
    sonarrItem,
    tempItem.key,
    {
      userId,
      userName,
      syncing: false,
    },
  )

  return await reportRouted(tempItem, userId, userName, 'show', outcome, deps)
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

  let presentInstanceIds: number[]
  if (existingMovies) {
    presentInstanceIds = findMovieInBulkData(
      tempItem,
      existingMovies,
      targetInstanceIds,
    )
  } else {
    const presence = await findMovieViaApi(tempItem, targetInstanceIds, deps)

    if (!presence.allChecked) {
      deps.logger.warn(
        { title: tempItem.title, targetInstanceIds },
        'Not every target Radarr instance could be checked, skipping item',
      )
      return { routed: false, skippedReason: 'no-instances-available' }
    }

    if (presence.excluded) {
      deps.logger.info(
        `Movie ${tempItem.title} is an import list exclusion in Radarr instance(s) ${presence.presentInstanceIds.join(', ')}, skipping addition`,
      )
      return { routed: false, skippedReason: 'exists-in-target' }
    }
    presentInstanceIds = presence.presentInstanceIds
  }

  if (presentInstanceIds.length > 0) {
    const completion =
      presentInstanceIds.length < targetInstanceIds.length
        ? await completeFromApproval(
            radarrItem,
            context,
            presentInstanceIds,
            deps,
          )
        : null
    if (!completion) {
      deps.logger.debug(
        `Movie ${tempItem.title} already exists in Radarr instance(s) ${presentInstanceIds.join(', ')}, skipping addition`,
      )
      return { routed: false, skippedReason: 'exists-in-target' }
    }
    return await reportRouted(
      tempItem,
      userId,
      userName,
      'movie',
      completion,
      deps,
    )
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

  const outcome = await deps.contentRouter.routeContent(
    radarrItem,
    tempItem.key,
    {
      userId,
      userName,
      syncing: false,
    },
  )

  return await reportRouted(tempItem, userId, userName, 'movie', outcome, deps)
}
