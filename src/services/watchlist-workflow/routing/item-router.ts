import type {
  EtagPollResult,
  Item,
  TemptRssWatchlistItem,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import { SYSTEM_USER_ID } from '@services/database/methods/watchlist-exclusion.js'
import { processItemsForUser } from '@services/plex-watchlist/orchestration/unified-processor.js'
import {
  extractTmdbId,
  extractTvdbId,
  parseGenres,
  parseGuids,
} from '@utils/guid-handler.js'
import type { ContentRoutingDeps, WorkflowDeps } from '../types.js'
import { routeMovie, routeShow } from './content-router.js'

export interface RouteSingleItemParams {
  item: Item
  userId: number
  userName: string
  primaryUser: { id: number } | null
  existingShows?: SonarrItem[]
  existingMovies?: RadarrItem[]
}

export async function routeSingleItem(
  params: RouteSingleItemParams,
  deps: ContentRoutingDeps,
): Promise<boolean> {
  const { item, userId, userName, primaryUser, existingShows, existingMovies } =
    params

  const parsedGuids = parseGuids(item.guids)
  const parsedGenres = parseGenres(item.genres)
  const normalizedType = item.type.toLowerCase()

  if (parsedGuids.length === 0) {
    deps.logger.warn(
      { userId, title: item.title },
      'Item has no GUIDs - skipping routing',
    )
    return false
  }

  const tempItem: TemptRssWatchlistItem = {
    title: item.title,
    key: item.key,
    type: normalizedType,
    thumb: item.thumb ?? '',
    guids: parsedGuids,
    genres: parsedGenres,
  }

  if (normalizedType === 'show') {
    const tvdbId = extractTvdbId(parsedGuids)
    if (tvdbId === 0) {
      deps.logger.warn(
        { userId, title: item.title, guids: parsedGuids },
        'Show has no valid TVDB ID - skipping routing',
      )
      return false
    }

    const sonarrItem: SonarrItem = {
      title: item.title,
      guids: parsedGuids,
      type: 'show',
      ended: false,
      genres: parsedGenres,
      status: 'pending',
      series_status: 'continuing',
      imdb: item.ratings?.imdb,
      rtCritic: item.ratings?.rtCritic,
      rtAudience: item.ratings?.rtAudience,
      tmdb: item.ratings?.tmdb,
    }

    const result = await routeShow(
      {
        tempItem,
        userId,
        userName,
        sonarrItem,
        existingSeries: existingShows,
        primaryUser,
      },
      deps,
    )
    return result.routed
  }

  if (normalizedType === 'movie') {
    const tmdbId = extractTmdbId(parsedGuids)
    if (tmdbId === 0) {
      deps.logger.warn(
        { userId, title: item.title, guids: parsedGuids },
        'Movie has no valid TMDB ID - skipping routing',
      )
      return false
    }

    const radarrItem: RadarrItem = {
      title: item.title,
      guids: parsedGuids,
      type: 'movie',
      genres: parsedGenres,
      imdb: item.ratings?.imdb,
      rtCritic: item.ratings?.rtCritic,
      rtAudience: item.ratings?.rtAudience,
      tmdb: item.ratings?.tmdb,
    }

    const result = await routeMovie(
      {
        tempItem,
        userId,
        userName,
        radarrItem,
        existingMovies,
        primaryUser,
      },
      deps,
    )
    return result.routed
  }

  deps.logger.warn(
    { userId, title: item.title, type: normalizedType },
    'Unknown content type - skipping routing',
  )
  return false
}

export async function routeEnrichedItemsForUser(
  userId: number,
  items: Item[],
  deps: ContentRoutingDeps,
): Promise<void> {
  if (items.length === 0) return

  const user = await deps.db.getUser(userId)
  if (!user) {
    deps.logger.warn({ userId }, 'User not found for routing enriched items')
    return
  }

  if (!user.can_sync) {
    deps.logger.debug(
      { userId, username: user.name, itemCount: items.length },
      'Skipping enriched items for user with sync disabled',
    )
    return
  }

  const primaryUser = await deps.db.getPrimaryUser()

  // SYSTEM_USER_ID in the exclusion set is a global veto, not a per-user one
  const exclusionMap = await deps.db.getExclusionMap()

  deps.logger.debug(
    { userId, username: user.name, itemCount: items.length },
    'Routing enriched items for user',
  )

  for (const item of items) {
    const excludedUsers = exclusionMap.get(item.key)
    if (excludedUsers?.has(userId) || excludedUsers?.has(SYSTEM_USER_ID)) {
      deps.logger.debug(
        { userId, title: item.title },
        'Skipping enriched item due to exclusion',
      )
      continue
    }

    try {
      await routeSingleItem(
        {
          item,
          userId,
          userName: user.name,
          primaryUser: primaryUser ?? null,
        },
        deps,
      )
    } catch (error) {
      deps.logger.error(
        { error, userId, title: item.title },
        'Error routing enriched item',
      )
    }
  }
}

export async function routeNewItemsForUser(
  change: EtagPollResult,
  deps: WorkflowDeps,
): Promise<void> {
  const { userId, newItems } = change

  if (newItems.length === 0) return

  const user = await deps.db.getUser(userId)
  if (!user) {
    deps.logger.warn({ userId }, 'User not found for routing new items')
    return
  }

  if (!user.can_sync) {
    deps.logger.debug(
      { userId, username: user.name, itemCount: newItems.length },
      'Skipping items for user with sync disabled',
    )
    return
  }

  deps.logger.debug(
    { userId, username: user.name, itemCount: newItems.length },
    'Processing new items for user',
  )

  const tokenItems: TokenWatchlistItem[] = newItems.map((etagItem) => ({
    id: etagItem.id,
    title: etagItem.title,
    type: etagItem.type.toLowerCase(),
    user_id: userId,
    status: 'pending' as const,
    key: etagItem.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))

  const isSelfWatchlist = change.isPrimary

  const { brandNewCount, linkedCount, processedItems, linkedItems } =
    await processItemsForUser(
      {
        user: {
          userId,
          username: user.name,
          watchlistId: '',
        },
        items: tokenItems,
        isSelfWatchlist,
      },
      deps.itemProcessorDeps,
    )

  const allItemsToRoute = [...processedItems, ...linkedItems]

  if (allItemsToRoute.length > 0) {
    deps.logger.info(
      {
        username: user.name,
        newItems: brandNewCount,
        linkedItems: linkedCount,
      },
      'Routing items for user',
    )

    await routeEnrichedItemsForUser(userId, allItemsToRoute, deps)
  }
}
