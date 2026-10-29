import type { PlexRatings } from '@schemas/tmdb/tmdb.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface PlexRatingsDeps {
  db: DatabaseService
  log: FastifyBaseLogger
}

export async function fetchPlexRatings(
  deps: PlexRatingsDeps,
  tmdbId: number,
  type: 'movie' | 'show',
): Promise<PlexRatings | null> {
  const { db, log } = deps

  try {
    const items = await db.getWatchlistItemsByGuid(`tmdb:${tmdbId}`, type)

    if (items.length === 0) {
      log.debug(`No watchlist item found for TMDB ID ${tmdbId}`)
      return null
    }

    const ratings = items[0].ratings
    if (!ratings) {
      log.debug(`No Plex ratings stored for TMDB ID ${tmdbId}`)
      return null
    }

    return {
      imdb: ratings.imdb,
      rtCritic: ratings.rtCritic,
      rtAudience: ratings.rtAudience,
      tmdb: ratings.tmdb,
    }
  } catch (error) {
    log.warn({ error, tmdbId }, 'Failed to fetch Plex ratings from DB')
    return null
  }
}
