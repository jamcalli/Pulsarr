import type { FastifyBaseLogger } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { RadarrService } from '@services/radarr.service.js'
import type {
  RadarrInstance,
  RadarrGenreRoute,
  ConnectionTestResult,
} from '@root/types/radarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'

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
      this.log.info(`Found ${instances.length} Radarr instances`, { instances })

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
            `Failed to initialize Radarr service for instance ${instance.name}, will retry:`,
            instanceError,
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
              `Failed to initialize Radarr service after retry for instance ${instance.name}:`,
              retryError,
            )
          }
        }
      }

      if (this.radarrServices.size === 0) {
        throw new Error('Unable to initialize any Radarr services')
      }
    } catch (error) {
      this.log.error('Error initializing Radarr manager:', error)
      throw error
    }
  }

  async fetchAllMovies(): Promise<RadarrItem[]> {
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

        const instanceMovies = await radarrService.fetchMovies()

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

  async routeItemToRadarr(item: RadarrItem, key: string): Promise<void> {
    const itemGenres = new Set(
      Array.isArray(item.genres)
        ? item.genres
        : typeof item.genres === 'string'
          ? [item.genres]
          : [],
    )

    const genreRoutes = await this.fastify.db.getRadarrGenreRoutes()
    const instances = await this.fastify.db.getAllRadarrInstances()

    const genreMatches = genreRoutes.filter((route) =>
      itemGenres.has(route.genre),
    )

    if (genreMatches.length > 0) {
      for (const match of genreMatches) {
        this.log.info(
          `Processing genre route "${match.name}" for genre "${match.genre}"`,
        )
        const radarrService = this.radarrServices.get(match.radarrInstanceId)
        if (!radarrService) {
          this.log.warn(
            `Radarr service ${match.radarrInstanceId} not found for genre route "${match.name}"`,
          )
          continue
        }

        const radarrItem = this.prepareRadarrItem(item)

        try {
          await radarrService.addToRadarr(
            radarrItem,
            match.rootFolder,
            match.qualityProfile,
          )
          await this.fastify.db.updateWatchlistItem(key, {
            radarr_instance_id: match.radarrInstanceId,
          })
          this.log.info(
            `Successfully routed item to genre-specific instance ${match.radarrInstanceId} using route "${match.name}"`,
          )
        } catch (error) {
          this.log.error(
            `Failed to add item to genre-specific instance ${match.radarrInstanceId} using route "${match.name}":`,
            error,
          )
        }
      }
    } else {
      const defaultInstance = await this.fastify.db.getDefaultRadarrInstance()
      if (!defaultInstance) {
        throw new Error('No default Radarr instance configured')
      }

      const syncedInstanceIds = new Set([
        defaultInstance.id,
        ...(defaultInstance.syncedInstances || []),
      ])

      const syncedInstances = instances.filter((instance) =>
        syncedInstanceIds.has(instance.id),
      )

      const targetInstances =
        syncedInstances.length > 0 ? syncedInstances : [defaultInstance]

      for (const instance of targetInstances) {
        const radarrService = this.radarrServices.get(instance.id)
        if (!radarrService) {
          this.log.warn(`Radarr service ${instance.id} not found`)
          continue
        }

        const radarrItem = this.prepareRadarrItem(item)

        try {
          const matchingRoute = genreRoutes.find(
            (route) =>
              route.radarrInstanceId === instance.id &&
              itemGenres.has(route.genre),
          )

          if (matchingRoute) {
            this.log.info(
              `Using genre route "${matchingRoute.name}" for default instance routing`,
            )
          }

          const targetRootFolder =
            matchingRoute?.rootFolder || instance.rootFolder
          let targetQualityProfileId: number | undefined = undefined

          const isNumericQualityProfile = (
            value: string | number | null,
          ): value is number => {
            if (value === null) return false
            if (typeof value === 'number') return true
            return /^\d+$/.test(value)
          }

          if (matchingRoute?.qualityProfile) {
            if (isNumericQualityProfile(matchingRoute.qualityProfile)) {
              targetQualityProfileId = Number(matchingRoute.qualityProfile)
            }
          } else if (instance.qualityProfile) {
            if (isNumericQualityProfile(instance.qualityProfile)) {
              targetQualityProfileId = Number(instance.qualityProfile)
            }
          }

          await radarrService.addToRadarr(
            radarrItem,
            targetRootFolder || undefined,
            targetQualityProfileId,
          )

          await this.fastify.db.updateWatchlistItem(key, {
            radarr_instance_id: instance.id,
          })
          this.log.info(
            `Successfully routed item to instance ${instance.id} with quality profile ${targetQualityProfileId ?? 'default'}`,
          )
        } catch (error) {
          this.log.error(
            `Failed to add item to instance ${instance.id}:`,
            error,
          )
        }
      }
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

    const existingMovies = await radarrService.fetchMovies()
    return [...existingMovies].some((movie) =>
      movie.guids.some((existingGuid: string) =>
        item.guids?.includes(existingGuid),
      ),
    )
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
        this.log.error(`Failed to remove webhook for instance ${id}:`, error)
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
      await radarrService.initialize(instance)
      this.radarrServices.set(id, radarrService)
    }
  }

  async addGenreRoute(
    route: Omit<RadarrGenreRoute, 'id'>,
  ): Promise<RadarrGenreRoute> {
    this.log.info(
      `Adding new genre route "${route.name}" for genre "${route.genre}"`,
    )
    return this.fastify.db.createRadarrGenreRoute(route)
  }

  async removeGenreRoute(id: number): Promise<void> {
    this.log.info(`Removing genre route ${id}`)
    await this.fastify.db.deleteRadarrGenreRoute(id)
  }

  async updateGenreRoute(
    id: number,
    updates: Partial<RadarrGenreRoute>,
  ): Promise<void> {
    this.log.info(
      `Updating genre route ${id}${updates.name ? ` to name "${updates.name}"` : ''}`,
    )
    await this.fastify.db.updateRadarrGenreRoute(id, updates)
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
      this.log.error('Error testing Radarr connection:', error)
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
