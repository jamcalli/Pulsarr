import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface RadarrLookupDeps {
  db: DatabaseService
  radarrManager: RadarrManagerService
  log: FastifyBaseLogger
}

export async function fetchRadarrLookup(
  deps: RadarrLookupDeps,
  tmdbId: number,
): Promise<RadarrMovieLookupResponse | null> {
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

    if (!movieData) {
      log.debug(`No Radarr lookup result for TMDB ID ${tmdbId}`)
      return null
    }

    return movieData
  } catch (error) {
    log.warn({ error, tmdbId }, 'Failed to fetch Radarr lookup')
    return null
  }
}
