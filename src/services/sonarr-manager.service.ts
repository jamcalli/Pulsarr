import type { FastifyBaseLogger } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { SonarrService } from '@services/sonarr.service.js'
import type {
  SonarrInstance,
  SonarrGenreRoute,
  SonarrItem,
  ConnectionTestResult
} from '@root/types/sonarr.types.js'
import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'

export class SonarrManagerService {
  private sonarrServices: Map<number, SonarrService> = new Map()

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  async initialize(): Promise<void> {
    try {
      this.log.info('Starting Sonarr manager initialization')
  
      const instances = await this.fastify.db.getAllSonarrInstances()
      this.log.info(`Found ${instances.length} Sonarr instances`, { instances })
  
      if (instances.length === 0) {
        this.log.warn('No Sonarr instances found')
        return
      }
  
      for (const instance of instances) {
        this.log.info('Attempting to initialize instance:', {
          id: instance.id,
          name: instance.name,
          baseUrl: instance.baseUrl,
        })
  
        try {
          const sonarrService = new SonarrService(this.log)
          await sonarrService.initialize(instance)
          this.sonarrServices.set(instance.id, sonarrService)
          this.log.info(
            `Successfully initialized Sonarr service for instance: ${instance.name}`,
          )
        } catch (instanceError) {
          this.log.error(
            `Failed to initialize Sonarr service for instance ${instance.name}, will retry:`,
            instanceError
          )
          
          await new Promise(resolve => setTimeout(resolve, 1000))
          try {
            const sonarrService = new SonarrService(this.log)
            await sonarrService.initialize(instance)
            this.sonarrServices.set(instance.id, sonarrService)
            this.log.info(
              `Successfully initialized Sonarr service on retry for instance: ${instance.name}`,
            )
          } catch (retryError) {
            this.log.error(
              `Failed to initialize Sonarr service after retry for instance ${instance.name}:`,
              retryError
            )
          }
        }
      }
  
      if (this.sonarrServices.size === 0) {
        throw new Error('Unable to initialize any Sonarr services')
      }
    } catch (error) {
      this.log.error('Error initializing Sonarr manager:', error)
      throw error
    }
  }

  async testConnection(baseUrl: string, apiKey: string): Promise<ConnectionTestResult> {
    try {
      // Create a temporary service instance for testing
      const tempService = new SonarrService(this.log)
      return await tempService.testConnection(baseUrl, apiKey)
    } catch (error) {
      this.log.error('Error testing Sonarr connection:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error testing connection'
      }
    }
  }

  async fetchAllSeries(): Promise<SonarrItem[]> {
    const allSeries: SonarrItem[] = []

    // Get all Sonarr instances
    const instances = await this.fastify.db.getAllSonarrInstances()

    // Fetch series from each initialized service
    for (const instance of instances) {
      try {
        const sonarrService = this.sonarrServices.get(instance.id)

        if (!sonarrService) {
          this.log.warn(
            `Sonarr service for instance ${instance.name} not initialized`,
          )
          continue
        }

        // Fetch series for this instance
        const instanceSeries = await sonarrService.fetchSeries()

        // Convert Set to Array and spread into allSeries
        allSeries.push(...Array.from(instanceSeries))
      } catch (error) {
        this.log.error(
          `Error fetching series for instance ${instance.name}:`,
          error,
        )
      }
    }

    return allSeries
  }

  async routeItemToSonarr(item: SonarrItem, key: string): Promise<void> {
    const itemGenres = new Set(
      Array.isArray(item.genres)
        ? item.genres
        : typeof item.genres === 'string'
          ? [item.genres]
          : [],
    )

    // Get all genre routes and instances
    const genreRoutes = await this.fastify.db.getSonarrGenreRoutes()
    const instances = await this.fastify.db.getAllSonarrInstances()

    // First, check for genre-specific routing
    const genreMatches = genreRoutes.filter((route) =>
      itemGenres.has(route.genre),
    )

    if (genreMatches.length > 0) {
      // Genre routing takes priority - only route to these specific instances
      for (const match of genreMatches) {
        const sonarrService = this.sonarrServices.get(match.sonarrInstanceId)
        if (!sonarrService) {
          this.log.warn(
            `Sonarr service ${match.sonarrInstanceId} not found for genre route`,
          )
          continue
        }

        const sonarrItem = this.prepareSonarrItem(item)

        try {
          await sonarrService.addToSonarr(sonarrItem, match.rootFolder)
          await this.fastify.db.updateWatchlistItem(key, {
            sonarr_instance_id: match.sonarrInstanceId,
          })
          this.log.info(
            `Successfully routed item to genre-specific instance ${match.sonarrInstanceId}`,
          )
        } catch (error) {
          this.log.error(
            `Failed to add item to genre-specific instance ${match.sonarrInstanceId}:`,
            error,
          )
        }
      }
    } else {
      // If no genre matches, find target instance and check for syncs
      const defaultInstance = await this.fastify.db.getDefaultSonarrInstance()
      if (!defaultInstance) {
        throw new Error('No default Sonarr instance configured')
      }

      // Get all synced instances including the default instance
      const syncedInstanceIds = new Set([
        defaultInstance.id,
        ...(defaultInstance.syncedInstances || []),
      ])

      const syncedInstances = instances.filter((instance) =>
        syncedInstanceIds.has(instance.id),
      )

      // If no synced instances, just use the default instance
      const targetInstances =
        syncedInstances.length > 0 ? syncedInstances : [defaultInstance]

      // Route to all target instances
      for (const instance of targetInstances) {
        const sonarrService = this.sonarrServices.get(instance.id)
        if (!sonarrService) {
          this.log.warn(`Sonarr service ${instance.id} not found`)
          continue
        }

        const sonarrItem = this.prepareSonarrItem(item)

        try {
          // Check if there's a matching root folder for this instance
          const matchingRoute = genreRoutes.find(
            (route) =>
              route.sonarrInstanceId === instance.id &&
              itemGenres.has(route.genre),
          )

          const targetRootFolder =
            matchingRoute?.rootFolder || instance.rootFolder

          await sonarrService.addToSonarr(
            sonarrItem,
            targetRootFolder || undefined,
          )
          await this.fastify.db.updateWatchlistItem(key, {
            sonarr_instance_id: instance.id,
          })
          this.log.info(`Successfully routed item to instance ${instance.id}`)
        } catch (error) {
          this.log.error(
            `Failed to add item to instance ${instance.id}:`,
            error,
          )
        }
      }
    }
  }

  private prepareSonarrItem(sonarrItem: SonarrItem): SonarrItem {
    return {
      title: sonarrItem.title,
      guids: Array.isArray(sonarrItem.guids)
        ? sonarrItem.guids
        : typeof sonarrItem.guids === 'string'
          ? [sonarrItem.guids]
          : [],
      type: sonarrItem.type,
      genres: Array.isArray(sonarrItem.genres)
        ? sonarrItem.genres
        : typeof sonarrItem.genres === 'string'
          ? [sonarrItem.genres]
          : [],
    }
  }

  async getAllInstances(): Promise<SonarrInstance[]> {
    const instances = await this.fastify.db.getAllSonarrInstances()
    return instances
  }

  async verifyItemExists(
    instanceId: number,
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    const sonarrService = this.sonarrServices.get(instanceId)
    if (!sonarrService) {
      throw new Error(`Sonarr instance ${instanceId} not found`)
    }

    const existingSeries = await sonarrService.fetchSeries()
    return [...existingSeries].some((series) =>
      series.guids.some((existingGuid: string) =>
        item.guids?.includes(existingGuid),
      ),
    )
  }

  async addInstance(instance: Omit<SonarrInstance, 'id'>): Promise<number> {
    const id = await this.fastify.db.createSonarrInstance(instance)
    const sonarrService = new SonarrService(this.log)
    await sonarrService.initialize({ ...instance, id })
    this.sonarrServices.set(id, sonarrService)
    return id
  }

  async removeInstance(id: number): Promise<void> {
    await this.fastify.db.deleteSonarrInstance(id)
    this.sonarrServices.delete(id)
  }

  async updateInstance(
    id: number,
    updates: Partial<SonarrInstance>,
  ): Promise<void> {
    await this.fastify.db.updateSonarrInstance(id, updates)
    const instance = await this.fastify.db.getSonarrInstance(id)
    if (instance) {
      const sonarrService = new SonarrService(this.log)
      await sonarrService.initialize(instance)
      this.sonarrServices.set(id, sonarrService)
    }
  }

  async addGenreRoute(route: Omit<SonarrGenreRoute, 'id'>): Promise<number> {
    return this.fastify.db.createSonarrGenreRoute(route)
  }

  async removeGenreRoute(id: number): Promise<void> {
    await this.fastify.db.deleteSonarrGenreRoute(id)
  }

  async updateGenreRoute(
    id: number,
    updates: Partial<SonarrGenreRoute>,
  ): Promise<void> {
    await this.fastify.db.updateSonarrGenreRoute(id, updates)
  }

  async getSonarrInstance(id: number): Promise<SonarrInstance | null> {
    return await this.fastify.db.getSonarrInstance(id)
  }

  getSonarrService(id: number): SonarrService | undefined {
    return this.sonarrServices.get(id)
  }
}
