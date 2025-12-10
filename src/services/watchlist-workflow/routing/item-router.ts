/**
 * Item Router Module
 *
 * Provides item-level routing functions that prepare items and delegate
 * to the content router. Handles user sync checks and item validation.
 */

import type {
  EtagPollResult,
  Item,
  TemptRssWatchlistItem,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import { processItemsForUser } from '@services/plex-watchlist/orchestration/unified-processor.js'
import {
  extractTmdbId,
  extractTvdbId,
  parseGenres,
  parseGuids,
} from '@utils/guid-handler.js'
import type { ContentRoutingDeps, RssProcessorDeps } from '../types.js'
import { routeMovie, routeShow } from './content-router.js'

/**
 * Parameters for routing a single item
 */
export interface RouteSingleItemParams {
  /** The item to route */
  item: Item
  /** User ID requesting the content */
  userId: number
  /** Username for notifications */
  userName: string
  /** Primary user for Plex existence checks */
  primaryUser: { id: number } | null
  /** Pre-fetched existing series for bulk mode */
  existingShows?: SonarrItem[]
  /** Pre-fetched existing movies for bulk mode */
  existingMovies?: RadarrItem[]
}

/**
 * Route a single item to Sonarr/Radarr.
 *
 * Validates the item, prepares it for routing, and delegates to routeShow/routeMovie.
 *
 * @param params - Item and user information
 * @param deps - Service dependencies
 * @returns true if content was routed, false otherwise
 */
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

/**
 * Route pre-enriched, already-saved items for a user.
 *
 * Used when items are synced via processAndSaveNewItems (new friend flow).
 * Does NOT enrich or save - items must already be in DB.
 *
 * @param userId - The user ID to route items for
 * @param items - Pre-enriched items (already have GUIDs/genres)
 * @param deps - Service dependencies
 */
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

  deps.logger.debug(
    { userId, username: user.name, itemCount: items.length },
    'Routing enriched items for user',
  )

  for (const item of items) {
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

/**
 * Route new items detected via ETag polling.
 *
 * Processes ETag poll results by:
 * 1. Converting items to TokenWatchlistItem format
 * 2. Processing through unified flow (enrich/save)
 * 3. Routing both new and linked items
 *
 * @param change - The ETag poll result with new items
 * @param deps - Service dependencies
 */
export async function routeNewItemsForUser(
  change: EtagPollResult,
  deps: RssProcessorDeps,
): Promise<void> {
  const { userId, newItems } = change

  if (newItems.length === 0) return

  // Get user info for routing context
  const user = await deps.db.getUser(userId)
  if (!user) {
    deps.logger.warn({ userId }, 'User not found for routing new items')
    return
  }

  // Check if user has sync enabled
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

  // Convert EtagPollItems to TokenWatchlistItems for unified processing
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

  // Use isPrimary from EtagPollResult - already known at the source
  const isSelfWatchlist = change.isPrimary

  // Use unified processing flow
  // This efficiently categorizes items:
  // - Brand new: enrich → save → return for routing
  // - Existing: link to user → return for routing
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

  // Route ALL items - both brand new AND linked
  // Linked items need routing because this user may have different router rules
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

    await deps.routeEnrichedItemsForUser(userId, allItemsToRoute)
  }
}
