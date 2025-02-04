import type { FastifyBaseLogger } from 'fastify'
import type { FastifyInstance } from 'fastify'
import type {
  RadarrAddOptions,
  RadarrPost,
  RadarrMovie,
  Item,
  RadarrConfiguration,
  RootFolder,
  QualityProfile,
  PagedResult,
  RadarrInstance,
} from '@root/types/radarr.types.js'

export class RadarrService {
  private config: RadarrConfiguration | null = null

  constructor(private readonly log: FastifyBaseLogger) {}

  private get radarrConfig(): RadarrConfiguration {
    if (!this.config) {
      throw new Error('Radarr service not initialized')
    }
    return this.config
  }

  async initialize(instance: RadarrInstance): Promise<void> {
    try {
      if (!instance.baseUrl || !instance.apiKey) {
        throw new Error(
          'Invalid Radarr configuration: baseUrl and apiKey are required',
        )
      }

      //await this.verifyConnection(instance)

      this.config = {
        radarrBaseUrl: instance.baseUrl,
        radarrApiKey: instance.apiKey,
        radarrQualityProfileId: instance.qualityProfile || null,
        radarrRootFolder: instance.rootFolder || null,
        radarrTagIds: instance.tags,
      }

      this.log.info(
        `Successfully initialized Radarr service for ${instance.name}`,
      )
    } catch (error) {
      this.log.error(
        `Failed to initialize Radarr service for instance ${instance.name}:`,
        error,
      )
      throw error
    }
  }

  private async verifyConnection(instance: RadarrInstance): Promise<unknown> {
    const url = new URL(`${instance.baseUrl}/api/v3/system/status`)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Api-Key': instance.apiKey,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Connection verification failed: ${response.statusText}`)
    }

    return response.json()
  }

  private toItem(movie: RadarrMovie): Item {
    return {
      title: movie.title,
      guids: [
        movie.imdbId ? `imdb:${movie.imdbId}` : undefined,
        movie.tmdbId ? `tmdb:${movie.tmdbId}` : undefined,
        `radarr:${movie.id}`,
      ].filter((x): x is string => !!x),
      type: 'movie',
      ended: undefined,
      added: movie.added,
      status: movie.hasFile ? 'grabbed' : 'requested',
      movie_status: movie.isAvailable ? 'available' : 'unavailable',
    }
  }

  async fetchQualityProfiles(): Promise<QualityProfile[]> {
    try {
      const profiles =
        await this.getFromRadarr<QualityProfile[]>('qualityprofile')
      return profiles
    } catch (err) {
      this.log.error(`Error fetching quality profiles: ${err}`)
      throw err
    }
  }

  async fetchRootFolders(): Promise<RootFolder[]> {
    try {
      const rootFolders = await this.getFromRadarr<RootFolder[]>('rootfolder')
      return rootFolders
    } catch (err) {
      this.log.error(`Error fetching root folders: ${err}`)
      throw err
    }
  }

  async fetchMovies(bypass = false): Promise<Set<Item>> {
    try {
      const movies = await this.getFromRadarr<RadarrMovie[]>('movie')

      let exclusions: Set<Item> = new Set()
      if (!bypass) {
        exclusions = await this.fetchExclusions()
      }

      const movieItems = movies.map((movie) => this.toItem(movie))
      return new Set([...movieItems, ...exclusions])
    } catch (err) {
      this.log.error(`Error fetching movies: ${err}`)
      throw err
    }
  }

  async fetchExclusions(pageSize = 1000): Promise<Set<Item>> {
    const config = this.radarrConfig
    try {
      let currentPage = 1
      let totalRecords = 0
      const allExclusions: RadarrMovie[] = []

      do {
        const url = new URL(`${config.radarrBaseUrl}/api/v3/exclusions/paged`)
        url.searchParams.append('page', currentPage.toString())
        url.searchParams.append('pageSize', pageSize.toString())
        url.searchParams.append('sortDirection', 'ascending')
        url.searchParams.append('sortKey', 'movieTitle')

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'X-Api-Key': config.radarrApiKey,
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`Radarr API error: ${response.statusText}`)
        }

        const pagedResult = (await response.json()) as PagedResult<{
          id: number
          tmdbId: number
          movieTitle: string
          movieYear: number
        }>
        totalRecords = pagedResult.totalRecords

        // Map the exclusion records to RadarrMovie format
        const exclusionMovies = pagedResult.records.map((record) => ({
          title: record.movieTitle,
          imdbId: undefined, // These might need to be added if available in the API
          tmdbId: record.tmdbId,
          id: record.id,
        }))

        allExclusions.push(...exclusionMovies)

        this.log.debug(
          `Fetched page ${currentPage} of exclusions (${pagedResult.records.length} records)`,
        )
        currentPage++
      } while (allExclusions.length < totalRecords)

      this.log.info(`Fetched all movie ${allExclusions.length} exclusions`)
      return new Set(allExclusions.map((movie) => this.toItem(movie)))
    } catch (err) {
      this.log.error(`Error fetching exclusions: ${err}`)
      throw err
    }
  }

  async addToRadarr(item: Item, overrideRootFolder?: string): Promise<void> {
    const config = this.radarrConfig
    try {
      const addOptions: RadarrAddOptions = {
        searchForMovie: true,
      }

      const tmdbGuid = item.guids.find((guid) => guid.startsWith('tmdb:'))
      let tmdbId = 0
      if (tmdbGuid) {
        const parsed = Number.parseInt(tmdbGuid.replace('tmdb:', ''), 10)
        if (!Number.isNaN(parsed)) {
          tmdbId = parsed
        }
      }

      let rootFolderPath = overrideRootFolder || config.radarrRootFolder
      if (!rootFolderPath) {
        const rootFolders = await this.fetchRootFolders()
        if (rootFolders.length === 0) {
          throw new Error('No root folders configured in Radarr')
        }
        rootFolderPath = rootFolders[0].path
        this.log.info(`Using root folder: ${rootFolderPath}`)
      }

      let qualityProfileId = config.radarrQualityProfileId
      const qualityProfiles = await this.fetchQualityProfiles()

      if (qualityProfiles.length === 0) {
        throw new Error('No quality profiles configured in Radarr')
      }

      if (config.radarrQualityProfileId !== null) {
        if (typeof config.radarrQualityProfileId === 'string') {
          const matchingProfile = qualityProfiles.find(
            (profile) =>
              profile.name.toLowerCase() ===
              config.radarrQualityProfileId?.toString().toLowerCase(),
          )

          if (matchingProfile) {
            qualityProfileId = matchingProfile.id
            this.log.info(
              `Using matched quality profile: ${matchingProfile.name} (ID: ${qualityProfileId})`,
            )
          } else {
            this.log.warn(
              `Could not find quality profile "${config.radarrQualityProfileId}". Available profiles: ${qualityProfiles.map((p) => p.name).join(', ')}`,
            )
            qualityProfileId = qualityProfiles[0].id
            this.log.info(
              `Falling back to first quality profile: ${qualityProfiles[0].name} (ID: ${qualityProfileId})`,
            )
          }
        } else if (typeof config.radarrQualityProfileId === 'number') {
          qualityProfileId = config.radarrQualityProfileId
        }
      }

      if (!qualityProfileId) {
        qualityProfileId = qualityProfiles[0].id
        this.log.info(
          `Using default quality profile: ${qualityProfiles[0].name} (ID: ${qualityProfileId})`,
        )
      }

      const movie: RadarrPost = {
        title: item.title,
        tmdbId,
        qualityProfileId,
        rootFolderPath,
        addOptions,
        tags: config.radarrTagIds,
      }

      await this.postToRadarr<void>('movie', movie)

      this.log.info(`Sent ${item.title} to Radarr`)
    } catch (err) {
      this.log.debug(
        `Received warning for sending ${item.title} to Radarr: ${err}`,
      )
      throw err
    }
  }

  async deleteFromRadarr(item: Item, deleteFiles: boolean): Promise<void> {
    const config = this.radarrConfig
    try {
      const radarrGuid = item.guids.find((guid) => guid.startsWith('radarr:'))
      const tmdbGuid = item.guids.find((guid) => guid.startsWith('tmdb:'))
      if (!radarrGuid && !tmdbGuid) {
        this.log.warn(
          `Unable to extract ID from movie to delete: ${JSON.stringify(item)}`,
        )
        return
      }

      let radarrId: number | undefined

      if (radarrGuid) {
        radarrId = Number.parseInt(radarrGuid.replace('radarr:', ''), 10)
      } else if (tmdbGuid) {
        const tmdbId = tmdbGuid.replace('tmdb:', '')
        const allMovies = await this.fetchMovies(true)
        const matchingMovie = [...allMovies].find((movie) =>
          movie.guids.some(
            (guid) =>
              guid.startsWith('tmdb:') && guid.replace('tmdb:', '') === tmdbId,
          ),
        )
        if (!matchingMovie) {
          throw new Error(`Could not find movie with TMDB ID: ${tmdbId}`)
        }
        const matchingRadarrGuid = matchingMovie.guids.find((guid) =>
          guid.startsWith('radarr:'),
        )
        if (!matchingRadarrGuid) {
          throw new Error('Could not find Radarr ID for movie')
        }
        radarrId = Number.parseInt(
          matchingRadarrGuid.replace('radarr:', ''),
          10,
        )
      }

      if (radarrId === undefined || Number.isNaN(radarrId)) {
        throw new Error('Failed to obtain valid Radarr ID')
      }

      await this.deleteFromRadarrById(radarrId, deleteFiles)
      this.log.info(`Deleted ${item.title} from Radarr`)
    } catch (err) {
      this.log.error(`Error deleting from Radarr: ${err}`)
      throw err
    }
  }

  private async getFromRadarr<T>(endpoint: string): Promise<T> {
    const config = this.radarrConfig
    const url = new URL(`${config.radarrBaseUrl}/api/v3/${endpoint}`)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Api-Key': config.radarrApiKey,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Radarr API error: ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  private async postToRadarr<T>(
    endpoint: string,
    payload: unknown,
  ): Promise<T> {
    const config = this.radarrConfig
    const url = new URL(`${config.radarrBaseUrl}/api/v3/${endpoint}`)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'X-Api-Key': config.radarrApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Radarr API error: ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  private async deleteFromRadarrById(
    id: number,
    deleteFiles: boolean,
  ): Promise<void> {
    const config = this.radarrConfig
    const url = new URL(`${config.radarrBaseUrl}/api/v3/movie/${id}`)
    url.searchParams.append('deleteFiles', deleteFiles.toString())
    url.searchParams.append('addImportExclusion', 'false')

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'X-Api-Key': config.radarrApiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Radarr API error: ${response.statusText}`)
    }
  }
}
