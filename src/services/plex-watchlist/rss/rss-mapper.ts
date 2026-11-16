import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'
import { parseGenres, parseGuids } from '@utils/guid-handler.js'

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
