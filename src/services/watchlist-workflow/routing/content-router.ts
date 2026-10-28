import type { ApprovalRequest } from '@root/types/approval.types.js'
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
import {
  createRoutingLog,
  listRoutingInstances,
  logSkipped,
  type RoutingSkip,
} from '@services/content-router/routing-log.js'
import type { RoutingOutcome } from '@services/content-router/types.js'
import {
  extractTmdbId,
  extractTvdbId,
  findGuidMatches,
  type GuidIndex,
  parseGuids,
} from '@utils/guid-handler.js'
import { emitWatchlistChange } from '@utils/watchlist-events.js'
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

export type ApprovedRecords = ReadonlyMap<string, ApprovalRequest>

export interface RouteShowParams {
  tempItem: TemptRssWatchlistItem
  userId: number
  userName: string | undefined
  userAlias?: string | null
  sonarrItem: SonarrItem
  seriesIndex?: GuidIndex<SonarrItem>
  approvedRecords?: ApprovedRecords
  arrInstanceIds?: ReadonlySet<number>
  arrInstances?: ReadonlyArray<{ id: number; name: string }>
  primaryUser: { id: number } | null
  /** Only the full reconciliation pass sets this. */
  reconcile?: boolean
}

export interface RouteMovieParams {
  tempItem: TemptRssWatchlistItem
  userId: number
  userName: string | undefined
  userAlias?: string | null
  radarrItem: RadarrItem
  movieIndex?: GuidIndex<RadarrItem>
  approvedRecords?: ApprovedRecords
  arrInstanceIds?: ReadonlySet<number>
  arrInstances?: ReadonlyArray<{ id: number; name: string }>
  primaryUser: { id: number } | null
  /** Only the full reconciliation pass sets this. */
  reconcile?: boolean
}

type SkipSubject = Pick<
  RouteShowParams,
  'userId' | 'userName' | 'userAlias' | 'reconcile' | 'arrInstances'
>

async function logSkip(
  params: SkipSubject,
  item: ContentItem,
  skip: RoutingSkip,
  deps: ContentRoutingDeps,
): Promise<void> {
  logSkipped(
    createRoutingLog({
      logger: deps.contentRouter.log,
      item,
      userId: params.userId,
      userName: params.userName,
      userAlias: params.userAlias,
      instances:
        params.arrInstances ?? (await listRoutingInstances(item.type, deps)),
      reconcile: params.reconcile,
    }),
    skip,
  )
}

interface Destinations {
  record: ApprovalRequest | null
  destinationIds: number[]
  checkIds: number[]
}

function approvedRecordKey(userId: number, contentKey: string): string {
  return `${userId}:${contentKey}`
}

/** Indexes approved and auto-approved records so one sync run reads them once. */
export function indexApprovedRecords(
  records: ApprovalRequest[],
): ApprovedRecords {
  return new Map(
    records.map((record) => [
      approvedRecordKey(record.userId, record.contentKey),
      record,
    ]),
  )
}

async function findApprovedRecord(
  context: RoutingContext,
  approvedRecords: ApprovedRecords | undefined,
  deps: ContentRoutingDeps,
): Promise<ApprovalRequest | null> {
  if (approvedRecords) {
    return (
      approvedRecords.get(approvedRecordKey(context.userId, context.itemKey)) ??
      null
    )
  }
  const request = await deps.db.getApprovalRequestByContent(
    context.userId,
    context.itemKey,
  )
  return request?.status === 'approved' || request?.status === 'auto_approved'
    ? request
    : null
}

async function listArrInstanceIds(
  contentType: RoutingContext['contentType'],
  deps: ContentRoutingDeps,
): Promise<ReadonlySet<number>> {
  const instances =
    contentType === 'movie'
      ? await deps.radarrManager.getAllInstances()
      : await deps.sonarrManager.getAllInstances()
  return new Set(instances.map((instance) => instance.id))
}

/** A record's destinations on instances that still exist replace the current targets, and presence is checked over both sets. */
async function resolveDestinations(
  targetInstanceIds: number[],
  context: RoutingContext,
  known: Pick<RouteMovieParams, 'approvedRecords' | 'arrInstanceIds'>,
  deps: ContentRoutingDeps,
): Promise<Destinations> {
  const record = await findApprovedRecord(context, known.approvedRecords, deps)
  if (!record) {
    return {
      record,
      destinationIds: targetInstanceIds,
      checkIds: targetInstanceIds,
    }
  }
  const instanceIds =
    known.arrInstanceIds ??
    (await listArrInstanceIds(context.contentType, deps))
  const recorded = approvedDestinations(record)
  const deleted = recorded.filter((id) => !instanceIds.has(id))
  if (deleted.length > 0) {
    deps.logger.debug(
      { itemKey: context.itemKey, instanceIds: deleted },
      'Dropping approval record destinations whose instance no longer exists',
    )
  }
  const destinationIds = recorded.filter((id) => instanceIds.has(id))
  const checkIds = [...new Set([...targetInstanceIds, ...destinationIds])]
  return { record, destinationIds, checkIds }
}

interface Presence {
  presentInstanceIds: number[]
  excluded: boolean
}

interface ApiPresence extends Presence {
  allChecked: boolean
}

function findShowInBulkData(
  tempItem: TemptRssWatchlistItem,
  seriesIndex: GuidIndex<SonarrItem>,
  instanceIds: number[],
): Presence {
  const matches = findGuidMatches(seriesIndex, parseGuids(tempItem.guids))
    .map(({ item }) => item)
    .filter((series) =>
      instanceIds.some(
        (instanceId) => instanceId === series.sonarr_instance_id,
      ),
    )
  return {
    presentInstanceIds: instanceIds.filter((instanceId) =>
      matches.some((series) => series.sonarr_instance_id === instanceId),
    ),
    excluded: matches.some((series) => series.isExclusion === true),
  }
}

function findMovieInBulkData(
  tempItem: TemptRssWatchlistItem,
  movieIndex: GuidIndex<RadarrItem>,
  instanceIds: number[],
): Presence {
  const matches = findGuidMatches(movieIndex, parseGuids(tempItem.guids))
    .map(({ item }) => item)
    .filter((movie) =>
      instanceIds.some((instanceId) => instanceId === movie.radarr_instance_id),
    )
  return {
    presentInstanceIds: instanceIds.filter((instanceId) =>
      matches.some((movie) => movie.radarr_instance_id === instanceId),
    ),
    excluded: matches.some((movie) => movie.isExclusion === true),
  }
}

// Caller must validate the TVDB ID before calling this
async function findShowViaApi(
  tempItem: TemptRssWatchlistItem,
  instanceIds: number[],
  deps: ContentRoutingDeps,
): Promise<ApiPresence> {
  const tvdbId = extractTvdbId(parseGuids(tempItem.guids))
  const presentInstanceIds: number[] = []
  let excluded = false

  for (const instanceId of instanceIds) {
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
  instanceIds: number[],
  deps: ContentRoutingDeps,
): Promise<ApiPresence> {
  const tmdbId = extractTmdbId(parseGuids(tempItem.guids))
  const presentInstanceIds: number[] = []
  let excluded = false

  for (const instanceId of instanceIds) {
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
  { record, destinationIds }: Destinations,
  presentInstanceIds: number[],
  deps: ContentRoutingDeps,
): Promise<RoutingOutcome | null> {
  if (!record) {
    return null
  }
  const missingInstanceIds = destinationIds.filter(
    (instanceId) => !presentInstanceIds.includes(instanceId),
  )
  if (missingInstanceIds.length === 0) {
    return null
  }
  return await routeUsingApprovedDecision(
    record,
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

async function markRequested(
  deps: ContentRoutingDeps,
  userId: number,
  key: string,
): Promise<void> {
  let written: boolean
  try {
    written = await deps.db.updateWatchlistItem(userId, key, {
      status: 'requested',
    })
  } catch (error) {
    deps.logger.error(
      { error, userId, key },
      'Failed to mark existing item as requested',
    )
    return
  }
  if (written) {
    emitWatchlistChange(deps.fastify.progress, 'status', [userId])
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
  const { tempItem, userId, userName, sonarrItem, seriesIndex, primaryUser } =
    params

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
    await logSkip(params, sonarrItem, { reason: 'no-instance' }, deps)
    return { routed: false, skippedReason: 'no-target' }
  }

  const destinations = await resolveDestinations(
    targetInstanceIds,
    context,
    params,
    deps,
  )

  let presence: Presence
  if (seriesIndex) {
    presence = findShowInBulkData(tempItem, seriesIndex, destinations.checkIds)
  } else {
    const apiPresence = await findShowViaApi(
      tempItem,
      destinations.checkIds,
      deps,
    )

    if (!apiPresence.allChecked) {
      deps.logger.warn(
        { title: tempItem.title, instanceIds: destinations.checkIds },
        'Not every Sonarr instance could be checked, skipping item',
      )
      return { routed: false, skippedReason: 'no-instances-available' }
    }

    presence = apiPresence
  }

  if (presence.excluded) {
    await logSkip(
      params,
      sonarrItem,
      { reason: 'excluded', instanceIds: presence.presentInstanceIds },
      deps,
    )
    return { routed: false, skippedReason: 'exists-in-target' }
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
      await logSkip(params, sonarrItem, { reason: 'on-plex' }, deps)
      return { routed: false, skippedReason: 'exists-on-plex' }
    }
  }

  const { presentInstanceIds } = presence

  if (presentInstanceIds.length > 0) {
    const completion = await completeFromApproval(
      sonarrItem,
      context,
      destinations,
      presentInstanceIds,
      deps,
    )
    if (!completion) {
      await logSkip(
        params,
        sonarrItem,
        { reason: 'present', instanceIds: presentInstanceIds },
        deps,
      )
      await markRequested(deps, userId, tempItem.key)
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

  const outcome = await deps.contentRouter.routeContent(
    sonarrItem,
    tempItem.key,
    {
      userId,
      userName,
      userAlias: params.userAlias,
      syncing: false,
      reconcile: params.reconcile,
    },
  )

  return await reportRouted(tempItem, userId, userName, 'show', outcome, deps)
}

export async function routeMovie(
  params: RouteMovieParams,
  deps: ContentRoutingDeps,
): Promise<RouteContentResult> {
  const { tempItem, userId, userName, radarrItem, movieIndex, primaryUser } =
    params

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
    await logSkip(params, radarrItem, { reason: 'no-instance' }, deps)
    return { routed: false, skippedReason: 'no-target' }
  }

  const destinations = await resolveDestinations(
    targetInstanceIds,
    context,
    params,
    deps,
  )

  let presence: Presence
  if (movieIndex) {
    presence = findMovieInBulkData(tempItem, movieIndex, destinations.checkIds)
  } else {
    const apiPresence = await findMovieViaApi(
      tempItem,
      destinations.checkIds,
      deps,
    )

    if (!apiPresence.allChecked) {
      deps.logger.warn(
        { title: tempItem.title, instanceIds: destinations.checkIds },
        'Not every Radarr instance could be checked, skipping item',
      )
      return { routed: false, skippedReason: 'no-instances-available' }
    }

    presence = apiPresence
  }

  if (presence.excluded) {
    await logSkip(
      params,
      radarrItem,
      { reason: 'excluded', instanceIds: presence.presentInstanceIds },
      deps,
    )
    return { routed: false, skippedReason: 'exists-in-target' }
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
      await logSkip(params, radarrItem, { reason: 'on-plex' }, deps)
      return { routed: false, skippedReason: 'exists-on-plex' }
    }
  }

  const { presentInstanceIds } = presence

  if (presentInstanceIds.length > 0) {
    const completion = await completeFromApproval(
      radarrItem,
      context,
      destinations,
      presentInstanceIds,
      deps,
    )
    if (!completion) {
      await logSkip(
        params,
        radarrItem,
        { reason: 'present', instanceIds: presentInstanceIds },
        deps,
      )
      await markRequested(deps, userId, tempItem.key)
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

  const outcome = await deps.contentRouter.routeContent(
    radarrItem,
    tempItem.key,
    {
      userId,
      userName,
      userAlias: params.userAlias,
      syncing: false,
      reconcile: params.reconcile,
    },
  )

  return await reportRouted(tempItem, userId, userName, 'movie', outcome, deps)
}
