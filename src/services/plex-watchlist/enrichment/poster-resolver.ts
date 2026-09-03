import type { Friend, Item as WatchlistItem } from '@root/types/plex.types.js'
import type { TmdbService } from '@services/tmdb.service.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'

export interface PosterResolverDeps {
  tmdb: Pick<TmdbService, 'getPosterPath' | 'isConfigured'>
  logger: FastifyBaseLogger
}

const POSTER_LOOKUP_CONCURRENCY = 5

export function needsTmdbPoster(thumb: string | undefined): boolean {
  return !thumb || thumb.startsWith('http')
}

// Thumbs are patched in place because callers forward these same objects to watchlist-added notifications
export async function resolveTmdbPosters(
  items: Map<Friend, Set<WatchlistItem>>,
  deps: PosterResolverDeps,
): Promise<void> {
  const { tmdb, logger } = deps

  if (!tmdb.isConfigured()) {
    return
  }

  const itemsByKey = new Map<string, WatchlistItem[]>()

  for (const userItems of items.values()) {
    for (const item of userItems) {
      if (!needsTmdbPoster(item.thumb)) {
        continue
      }

      const group = itemsByKey.get(item.key)
      if (group) {
        group.push(item)
      } else {
        itemsByKey.set(item.key, [item])
      }
    }
  }

  if (itemsByKey.size === 0) {
    return
  }

  const limit = pLimit(POSTER_LOOKUP_CONCURRENCY)

  const results = await Promise.allSettled(
    Array.from(itemsByKey.values()).map((group) =>
      limit(async () => {
        const [first] = group
        const posterPath = await tmdb.getPosterPath(
          first.guids,
          first.type === 'show' ? 'show' : 'movie',
        )

        if (!posterPath) {
          return false
        }

        for (const item of group) {
          item.thumb = posterPath
        }

        return true
      }),
    ),
  )

  const resolved = results.filter(
    (result) => result.status === 'fulfilled' && result.value,
  ).length

  logger.debug(
    `Resolved ${resolved} of ${itemsByKey.size} watchlist posters from TMDB`,
  )
}
