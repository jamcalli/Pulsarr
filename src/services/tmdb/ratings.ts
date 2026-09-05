import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import type { PlexRatings, RadarrRatings } from '@schemas/tmdb/tmdb.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface RadarrRatingsDeps {
  db: DatabaseService
  radarrManager: RadarrManagerService
  log: FastifyBaseLogger
}

export interface PlexRatingsDeps {
  db: DatabaseService
  log: FastifyBaseLogger
}

export async function fetchRadarrRatings(
  deps: RadarrRatingsDeps,
  tmdbId: number,
): Promise<RadarrRatings | null> {
  const { db, radarrManager, log } = deps

  try {
    const radarrInstance = await db.getDefaultRadarrInstance()
    if (!radarrInstance) {
      log.debug('No default Radarr instance configured')
      return null
    }

    const radarrService = radarrManager.getRadarrService(radarrInstance.id)
    if (!radarrService) {
      log.debug(`Radarr service not found for instance ${radarrInstance.id}`)
      return null
    }

    const lookupResponse = await radarrService.getFromRadarr<
      RadarrMovieLookupResponse | RadarrMovieLookupResponse[]
    >(`movie/lookup/tmdb?tmdbId=${tmdbId}`)

    const movieData = Array.isArray(lookupResponse)
      ? lookupResponse[0]
      : lookupResponse

    if (!movieData?.ratings) {
      log.debug(`No ratings found in Radarr for TMDB ID ${tmdbId}`)
      return null
    }

    return movieData.ratings
  } catch (error) {
    log.warn({ error, tmdbId }, 'Failed to fetch Radarr ratings')
    return null
  }
}

export async function fetchPlexRatings(
  deps: PlexRatingsDeps,
  tmdbId: number,
): Promise<PlexRatings | null> {
  const { db, log } = deps

  try {
    const items = await db.getWatchlistItemsByGuid(`tmdb:${tmdbId}`)

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
