import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'
import type {
  ConnectionTestResult,
  MinimumAvailability,
  RadarrInstance,
  Item as RadarrItem,
} from '@root/types/radarr.types.js'
import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import { RadarrService } from '@services/radarr.service.js'
import { getGuidMatchScore, parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class RadarrManagerService {
  private radarrServices: Map<number, RadarrService> = new Map()

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  private get appBaseUrl(): string {
    return this.fastify.config.baseUrl
  }

  private get port(): number {
    return this.fastify.config.port
  }

  async initialize(): Promise<void> {
    try {
      this.log.info('Starting Radarr manager initialization')
      const instances = await this.fastify.db.getAllRadarrInstances()
      this.log.info(
        {
          count: instances.length,
          instanceIds: instances.map((i) => i.id),
          instanceNames: instances.map((i) => i.name),
        },
        `Found ${instances.length} Radarr instances`,
      )

      if (instances.length === 0) {
        this.log.warn('No Radarr instances found')
        return
      }

      for (const instance of instances) {
        this.log.info('Attempting to initialize instance:', {
          id: instance.id,
          name: instance.name,
          baseUrl: instance.baseUrl,
        })

        try {
          const radarrService = new RadarrService(
            this.log,
            this.appBaseUrl,
            this.port,
            this.fastify,
          )
          await radarrService.initialize(instance)
          this.radarrServices.set(instance.id, radarrService)
          this.log.info(
            `Successfully initialized Radarr service for instance: ${instance.name}`,
          )
        } catch (instanceError) {
          this.log.error(
            {
              error: instanceError,
              instanceId: instance.id,
              instanceName: instance.name,
            },
            'Failed to initialize Radarr service for instance, will retry',
          )

          await new Promise((resolve) => setTimeout(resolve, 1000))
          try {
            const radarrService = new RadarrService(
              this.log,
              this.appBaseUrl,
              this.port,
              this.fastify,
            )
            await radarrService.initialize(instance)
            this.radarrServices.set(instance.id, radarrService)
            this.log.info(
              `Successfully initialized Radarr service on retry for instance: ${instance.name}`,
            )
          } catch (retryError) {
            this.log.error(
              {
                error: retryError,
                instanceId: instance.id,
                instanceName: instance.name,
              },
              'Failed to initialize Radarr service after retry',
            )
          }
        }
      }

      if (this.radarrServices.size === 0) {
        throw new Error('Unable to initialize any Radarr services')
      }
    } catch (error) {
      this.log.error({ error }, 'Error initializing Radarr manager')
      throw error
    }
  }

  async fetchAllMovies(bypassExclusions = false): Promise<RadarrItem[]> {
    const allMovies: RadarrItem[] = []
    const instances = await this.fastify.db.getAllRadarrInstances()

    for (const instance of instances) {
      try {
        const radarrService = this.radarrServices.get(instance.id)
        if (!radarrService) {
          this.log.warn(
            `Radarr service for instance ${instance.name} not initialized`,
          )
          continue
        }

        const instanceMovies = await radarrService.fetchMovies(bypassExclusions)

        for (const movie of Array.from(instanceMovies)) {
          allMovies.push({
            ...movie,
            radarr_instance_id: instance.id,
          })
        }
      } catch (error) {
        this.log.error(
          `Error fetching movies for instance ${instance.name}:`,
          error,
        )
      }
    }
    return allMovies
  }

  async routeItemToRadarr(
    item: RadarrItem,
    key: string,
    userId: number,
    instanceId?: number,
    syncing = false,
    rootFolder?: string,
    qualityProfile?: number | string | null,
    tags?: string[],
    searchOnAdd?: boolean | null,
    minimumAvailability?: MinimumAvailability,
  ): Promise<void> {
    // If no specific instance is provided, try to get the default instance
    let targetInstanceId = instanceId
    if (targetInstanceId === undefined) {
      const defaultInstance = await this.fastify.db.getDefaultRadarrInstance()
      if (!defaultInstance) {
        throw new Error(
          'No Radarr instance ID provided and no default instance found',
        )
      }
      targetInstanceId = defaultInstance.id
    }

    const radarrService = this.radarrServices.get(targetInstanceId)
    if (!radarrService) {
      throw new Error(`Radarr service ${targetInstanceId} not found`)
    }

    const radarrItem = this.prepareRadarrItem(item)

    try {
      const instance = await this.fastify.db.getRadarrInstance(targetInstanceId)
      if (!instance) {
        throw new Error(`Radarr instance ${targetInstanceId} not found`)
      }

      // Use the provided parameters if available, otherwise fall back to instance defaults
      const targetRootFolder = rootFolder || instance.rootFolder || undefined
      let targetQualityProfileId: number | undefined

      if (qualityProfile !== undefined) {
        if (typeof qualityProfile === 'number') {
          targetQualityProfileId = qualityProfile
        } else if (
          typeof qualityProfile === 'string' &&
          /^\d+$/.test(qualityProfile)
        ) {
          targetQualityProfileId = Number(qualityProfile)
        }
      } else if (instance.qualityProfile !== null) {
        if (typeof instance.qualityProfile === 'number') {
          targetQualityProfileId = instance.qualityProfile
        } else if (
          typeof instance.qualityProfile === 'string' &&
          /^\d+$/.test(instance.qualityProfile)
        ) {
          targetQualityProfileId = Number(instance.qualityProfile)
        }
      }

      // Use provided tags or instance default tags
      const targetTags = tags || instance.tags || []

      // Handle search on add option (use provided value or instance default)
      const targetSearchOnAdd = searchOnAdd ?? instance.searchOnAdd ?? true // Default to true for backward compatibility

      // Use provided minimum availability or instance default
      const targetMinimumAvailability =
        minimumAvailability ??
        instance.minimumAvailability ??
        ('released' as MinimumAvailability)

      await radarrService.addToRadarr(
        radarrItem,
        targetRootFolder,
        targetQualityProfileId,
        targetTags,
        targetSearchOnAdd,
        targetMinimumAvailability,
      )

      await this.fastify.db.updateWatchlistItem(userId, key, {
        radarr_instance_id: targetInstanceId,
        syncing: syncing,
        status: 'requested',
      })

      this.log.info(
        `Successfully routed item to instance ${targetInstanceId} with quality profile ${targetQualityProfileId ?? 'default'}, search on add: ${targetSearchOnAdd}, minimum availability: ${targetMinimumAvailability}`,
      )
    } catch (error) {
      this.log.error(
        { error },
        `Failed to add item to instance ${targetInstanceId}`,
      )
      throw error
    }
  }

  private prepareRadarrItem(radarrItem: RadarrItem): RadarrItem {
    return {
      title: radarrItem.title,
      guids: Array.isArray(radarrItem.guids)
        ? radarrItem.guids
        : typeof radarrItem.guids === 'string'
          ? [radarrItem.guids]
          : [],
      type: radarrItem.type,
      genres: Array.isArray(radarrItem.genres)
        ? radarrItem.genres
        : typeof radarrItem.genres === 'string'
          ? [radarrItem.genres]
          : [],
    }
  }

  async getAllInstances(): Promise<RadarrInstance[]> {
    const instances = await this.fastify.db.getAllRadarrInstances()
    return instances
  }

  async verifyItemExists(
    instanceId: number,
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    const radarrService = this.radarrServices.get(instanceId)
    if (!radarrService) {
      throw new Error(`Radarr instance ${instanceId} not found`)
    }

    // Get the instance configuration to check bypassIgnored setting
    const instance = await this.fastify.db.getRadarrInstance(instanceId)
    if (!instance) {
      throw new Error(`Radarr instance ${instanceId} not found in database`)
    }

    // Pass the bypassIgnored setting to fetchMovies to bypass exclusions if configured
    const existingMovies = await radarrService.fetchMovies(
      instance.bypassIgnored,
    )
    // Use weighting system to find best match (prioritize higher GUID match counts)
    const potentialMatches = [...existingMovies]
      .map((movie) => ({
        movie,
        score: getGuidMatchScore(
          parseGuids(movie.guids),
          parseGuids(item.guids),
        ),
      }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)

    return potentialMatches.length > 0
  }

  /**
   * Efficiently check if a movie exists using TMDB lookup
   * @param instanceId - The Radarr instance ID
   * @param tmdbId - The TMDB ID to check
   * @returns Promise resolving to ExistenceCheckResult with availability info
   */
  async movieExistsByTmdbId(
    instanceId: number,
    tmdbId: number,
  ): Promise<ExistenceCheckResult> {
    const radarrService = this.radarrServices.get(instanceId)
    if (!radarrService) {
      return {
        found: false,
        checked: false,
        serviceName: 'Radarr',
        instanceId,
        error: `Radarr instance ${instanceId} not found`,
      }
    }

    const result = await radarrService.movieExistsByTmdbId(tmdbId)
    // Add instance ID to the result
    return { ...result, instanceId }
  }

  async addInstance(instance: Omit<RadarrInstance, 'id'>): Promise<number> {
    const id = await this.fastify.db.createRadarrInstance(instance)
    const radarrService = new RadarrService(
      this.log,
      this.appBaseUrl,
      this.port,
      this.fastify,
    )
    await radarrService.initialize({ ...instance, id })
    this.radarrServices.set(id, radarrService)
    return id
  }

  async removeInstance(id: number): Promise<void> {
    const service = this.radarrServices.get(id)
    if (service) {
      try {
        await service.removeWebhook()
      } catch (error) {
        this.log.error({ error }, `Failed to remove webhook for instance ${id}`)
      }

      await this.fastify.db.deleteRadarrInstance(id)
      this.radarrServices.delete(id)
    } else {
      this.log.warn(`No Radarr service found for instance ${id}`)
      await this.fastify.db.deleteRadarrInstance(id)
    }
  }

  async updateInstance(
    id: number,
    updates: Partial<RadarrInstance>,
  ): Promise<void> {
    await this.fastify.db.updateRadarrInstance(id, updates)
    const instance = await this.fastify.db.getRadarrInstance(id)
    if (instance) {
      const radarrService = new RadarrService(
        this.log,
        this.appBaseUrl,
        this.port,
        this.fastify,
      )
      try {
        await radarrService.initialize(instance)
        this.radarrServices.set(id, radarrService)
      } catch (initError) {
        this.log.error(
          { error: initError },
          `Failed to initialize Radarr instance ${id}:`,
        )
        // Initialize failed, possibly due to webhook setup
        // Extract a meaningful error message
        let errorMessage = 'Failed to initialize Radarr instance'

        if (initError instanceof Error) {
          if (initError.message.includes('Radarr API error')) {
            errorMessage = initError.message
          } else if (initError.message.includes('ECONNREFUSED')) {
            errorMessage =
              'Connection refused. Please check if Radarr is running.'
          } else if (initError.message.includes('ENOTFOUND')) {
            errorMessage = 'Server not found. Please check your base URL.'
          } else if (initError.message.includes('401')) {
            errorMessage = 'Authentication failed. Please check your API key.'
          } else {
            errorMessage = initError.message
          }
        }

        throw new Error(errorMessage)
      }
    }
  }

  async getRadarrInstance(id: number): Promise<RadarrInstance | null> {
    return await this.fastify.db.getRadarrInstance(id)
  }

  getRadarrService(id: number): RadarrService | undefined {
    return this.radarrServices.get(id)
  }

  async testConnection(
    baseUrl: string,
    apiKey: string,
  ): Promise<ConnectionTestResult> {
    try {
      const tempService = new RadarrService(
        this.log,
        this.appBaseUrl,
        this.port,
        this.fastify,
      )
      return await tempService.testConnection(baseUrl, apiKey)
    } catch (error) {
      this.log.error({ error }, 'Error testing Radarr connection')
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Unknown error testing connection',
      }
    }
  }
}
