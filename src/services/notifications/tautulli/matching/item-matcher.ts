/**
 * Tautulli Item Matcher
 *
 * Handles matching pending notifications to recently added items in Tautulli.
 */

import type {
  PendingNotification,
  RecentlyAddedItem,
  TautulliMetadata,
} from '@root/types/tautulli.types.js'
import { extractPlexKey, normalizeGuid } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'

export type FindMatchingItemFn = (
  notification: PendingNotification,
  recentItems: RecentlyAddedItem[],
) => Promise<RecentlyAddedItem | null>

export interface ItemMatcherDeps {
  log: FastifyBaseLogger
  getMetadata: (ratingKey: string) => Promise<TautulliMetadata | null>
}

/**
 * Safely parse season and episode numbers from Tautulli API response
 */
export function parseSeasonEpisode(
  item: RecentlyAddedItem,
  log?: FastifyBaseLogger,
): {
  season: number | null
  episode: number | null
} {
  let season: number | null = null
  let episode: number | null = null

  // Try parsing from string fields first (newer API format)
  if (item.parent_media_index) {
    const parsedSeason = Number.parseInt(item.parent_media_index, 10)
    if (!Number.isNaN(parsedSeason)) {
      season = parsedSeason
    }
  }

  if (item.media_index) {
    const parsedEpisode = Number.parseInt(item.media_index, 10)
    if (!Number.isNaN(parsedEpisode)) {
      episode = parsedEpisode
    }
  }

  // Fallback to legacy number fields if string parsing failed
  if (season === null && typeof item.season === 'number') {
    season = item.season
  }

  if (episode === null && typeof item.episode === 'number') {
    episode = item.episode
  }

  // Log warning if we have string fields but they couldn't be parsed
  if (
    log &&
    ((item.parent_media_index && season === null) ||
      (item.media_index && episode === null))
  ) {
    log.warn(
      {
        parent_media_index: item.parent_media_index,
        media_index: item.media_index,
        title: item.title,
        rating_key: item.rating_key,
      },
      'Invalid media index values from Tautulli API',
    )
  }

  return { season, episode }
}

/**
 * Check if media types match (accounting for different naming)
 */
export function isMediaTypeMatch(
  notificationType: 'movie' | 'show' | 'episode',
  tautulliType: 'movie' | 'show' | 'season' | 'episode',
): boolean {
  if (notificationType === 'movie' && tautulliType === 'movie') return true
  if (
    notificationType === 'show' &&
    (tautulliType === 'season' || tautulliType === 'show')
  )
    return true
  if (
    notificationType === 'episode' &&
    (tautulliType === 'episode' ||
      tautulliType === 'season' ||
      tautulliType === 'show')
  )
    return true
  return false
}

/**
 * Create a findMatchingItem function with the provided dependencies
 */
export function createItemMatcher(deps: ItemMatcherDeps): FindMatchingItemFn {
  const { log, getMetadata } = deps

  return async function findMatchingItem(
    notification: PendingNotification,
    recentItems: RecentlyAddedItem[],
  ): Promise<RecentlyAddedItem | null> {
    // Cache to avoid repeated API calls for the same parent/grandparent metadata
    const metadataCache = new Map<string, TautulliMetadata | null>()
    const getCachedMetadata = async (
      key: string,
    ): Promise<TautulliMetadata | null> => {
      if (!key) return null
      if (metadataCache.has(key)) return metadataCache.get(key) ?? null
      const metadata = await getMetadata(key)
      metadataCache.set(key, metadata)
      return metadata
    }

    for (const item of recentItems) {
      // Check if media type matches
      if (!isMediaTypeMatch(notification.mediaType, item.media_type)) {
        continue
      }

      // Normalize GUIDs for comparison (handle string[] or { id: string }[])
      const itemGuids = Array.isArray(item.guids)
        ? item.guids
            .map((g: string | { id: string }) =>
              typeof g === 'string'
                ? normalizeGuid(g)
                : g && typeof g.id === 'string'
                  ? normalizeGuid(g.id)
                  : null,
            )
            .filter((v): v is string => Boolean(v))
        : []

      // For movies, match by Plex GUID since guids array is empty
      if (notification.mediaType === 'movie' && item.guid) {
        // Extract the Plex key from the item's guid (e.g., "plex://movie/5d7768b907c4a5001e67bb61")
        const plexKey = extractPlexKey(item.guid)

        // Check if this matches the watchlist item key
        if (plexKey && notification.watchlistItemKey === plexKey) {
          return item
        }
      }

      // For shows/episodes, try Plex key first (more reliable), then fall back to GUIDs
      if (
        (notification.mediaType === 'show' ||
          notification.mediaType === 'episode') &&
        item.guid &&
        notification.watchlistItemKey
      ) {
        // Extract the Plex key from the item's guid (e.g., "plex://show/5d7768b907c4a5001e67bb61")
        const plexKey = extractPlexKey(item.guid)

        // Check if this matches the watchlist item key
        if (plexKey && notification.watchlistItemKey === plexKey) {
          // For episodes, also check season/episode numbers if available
          if (
            notification.mediaType === 'episode' &&
            item.media_type === 'episode'
          ) {
            const { season: itemSeason, episode: itemEpisode } =
              parseSeasonEpisode(item, log)

            if (
              itemSeason === notification.seasonNumber &&
              itemEpisode === notification.episodeNumber
            ) {
              return item
            }
          } else {
            return item
          }
        }
      }

      // Fallback: For shows/episodes, use the guids array (which is populated)
      // Direct match - check if the item's GUIDs include our notification GUID
      if (itemGuids.includes(notification.guid)) {
        // For episodes, also check season/episode numbers if available
        if (
          notification.mediaType === 'episode' &&
          item.media_type === 'episode'
        ) {
          const { season: itemSeason, episode: itemEpisode } =
            parseSeasonEpisode(item, log)

          if (
            itemSeason === notification.seasonNumber &&
            itemEpisode === notification.episodeNumber
          ) {
            return item
          }
        } else {
          return item
        }
      }

      // For show notifications that find a season, check the parent show's GUIDs or Plex key
      if (
        notification.mediaType === 'show' &&
        item.media_type === 'season' &&
        item.parent_rating_key
      ) {
        try {
          // Fetch the parent show's metadata
          const parentMetadata = await getCachedMetadata(item.parent_rating_key)

          // First try to match by Plex key (more reliable)
          if (parentMetadata?.guid && notification.watchlistItemKey) {
            const parentPlexKey = extractPlexKey(parentMetadata.guid)
            if (
              parentPlexKey &&
              notification.watchlistItemKey === parentPlexKey
            ) {
              log.info(
                {
                  title: notification.title,
                  seasonTitle: item.title,
                  seasonRatingKey: item.rating_key,
                  parentPlexKey,
                  watchlistItemKey: notification.watchlistItemKey,
                },
                'Found matching season by parent Plex key for show notification - will send season notification',
              )
              return item
            }
          }

          // Fallback to GUID matching
          if (parentMetadata?.guids) {
            const parentGuids = parentMetadata.guids.map((g) =>
              normalizeGuid(g.id),
            )
            if (parentGuids.includes(notification.guid)) {
              // We found a matching season for our show
              // When multiple episodes are added, Tautulli groups them as a season
              // Send the season notification - Tautulli will show all episodes in the season
              log.info(
                {
                  title: notification.title,
                  seasonTitle: item.title,
                  seasonRatingKey: item.rating_key,
                },
                'Found matching season by parent GUID for show notification - will send season notification',
              )
              return item
            }
          }
        } catch (error) {
          log.debug(
            { error, parentRatingKey: item.parent_rating_key },
            'Failed to fetch parent metadata for season matching in show notification',
          )
        }
      }

      // For episode notifications that find a season, check the parent show's GUIDs or Plex key
      if (
        notification.mediaType === 'episode' &&
        item.media_type === 'season' &&
        item.parent_rating_key
      ) {
        try {
          // Fetch the parent show's metadata
          const parentMetadata = await getCachedMetadata(item.parent_rating_key)

          // First try to match by Plex key (more reliable)
          if (parentMetadata?.guid && notification.watchlistItemKey) {
            const parentPlexKey = extractPlexKey(parentMetadata.guid)
            if (
              parentPlexKey &&
              notification.watchlistItemKey === parentPlexKey
            ) {
              log.info(
                {
                  title: notification.title,
                  seasonTitle: item.title,
                  seasonRatingKey: item.rating_key,
                  parentPlexKey,
                  watchlistItemKey: notification.watchlistItemKey,
                },
                'Found matching season by Plex key for episode notification - will send season notification',
              )
              return item
            }
          }

          // Fallback to GUID matching
          if (parentMetadata?.guids) {
            const parentGuids = parentMetadata.guids.map((g) =>
              normalizeGuid(g.id),
            )
            if (parentGuids.includes(notification.guid)) {
              // We found a matching season for our show
              // When multiple episodes are added, Tautulli groups them as a season
              // Send the season notification - Tautulli will show all episodes in the season
              log.info(
                {
                  title: notification.title,
                  seasonTitle: item.title,
                  seasonRatingKey: item.rating_key,
                },
                'Found matching season by GUID for episode notification - will send season notification',
              )
              return item
            }
          }
        } catch (error) {
          log.debug(
            { error, parentRatingKey: item.parent_rating_key },
            'Failed to fetch parent metadata for season matching',
          )
        }
      }

      // For episode notifications with individual episodes, check the grandparent show's GUIDs
      if (
        notification.mediaType === 'episode' &&
        item.media_type === 'episode' &&
        item.grandparent_rating_key
      ) {
        try {
          // Fetch the grandparent show's metadata
          const grandparentMetadata = await getCachedMetadata(
            item.grandparent_rating_key,
          )

          // First try to match by Plex key (more reliable)
          if (grandparentMetadata?.guid && notification.watchlistItemKey) {
            const grandparentPlexKey = extractPlexKey(grandparentMetadata.guid)
            if (
              grandparentPlexKey &&
              notification.watchlistItemKey === grandparentPlexKey
            ) {
              // Check if this is the correct episode
              const { season: itemSeason, episode: itemEpisode } =
                parseSeasonEpisode(item, log)

              if (
                itemSeason === notification.seasonNumber &&
                itemEpisode === notification.episodeNumber
              ) {
                log.info(
                  {
                    title: notification.title,
                    episodeTitle: item.title,
                    episodeRatingKey: item.rating_key,
                    grandparentPlexKey,
                    watchlistItemKey: notification.watchlistItemKey,
                    season: itemSeason,
                    episode: itemEpisode,
                  },
                  'Found matching episode by grandparent Plex key',
                )
                return item
              }
            }
          }

          // Fallback to GUID matching
          if (grandparentMetadata?.guids) {
            const grandparentGuids = grandparentMetadata.guids.map((g) =>
              normalizeGuid(g.id),
            )
            if (grandparentGuids.includes(notification.guid)) {
              // Check if this is the correct episode
              const { season: itemSeason, episode: itemEpisode } =
                parseSeasonEpisode(item, log)

              if (
                itemSeason === notification.seasonNumber &&
                itemEpisode === notification.episodeNumber
              ) {
                log.info(
                  {
                    title: notification.title,
                    episodeTitle: item.title,
                    episodeRatingKey: item.rating_key,
                    season: itemSeason,
                    episode: itemEpisode,
                  },
                  'Found matching episode by grandparent GUID',
                )
                return item
              }
            }
          }
        } catch (error) {
          log.debug(
            { error, grandparentRatingKey: item.grandparent_rating_key },
            'Failed to fetch grandparent metadata for episode matching',
          )
        }
      }
    }

    return null
  }
}
