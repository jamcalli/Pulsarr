/**
 * RSS Mapper Module
 *
 * Handles transformation of RSS items into watchlist display format.
 */

import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'
import { parseGenres, parseGuids } from '@utils/guid-handler.js'

/**
 * Maps RSS items to the watchlist display format.
 *
 * @param items - Set of RSS watchlist items to transform
 * @returns Array of formatted watchlist items for display
 */
export function mapRssItemsToWatchlist(items: Set<TemptRssWatchlistItem>) {
  return Array.from(items).map((item) => ({
    title: item.title,
    plexKey: item.key,
    type: item.type,
    thumb: item.thumb || '',
    guids: parseGuids(item.guids),
    genres: parseGenres(item.genres),
    status: 'pending' as const,
  }))
}
