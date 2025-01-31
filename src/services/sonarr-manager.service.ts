import type { FastifyBaseLogger } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { SonarrService } from '@services/sonarr.service.js'
import type {
  SonarrInstance,
  SonarrGenreRoute,
  SonarrItem,
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
            `Detailed error initializing Sonarr service for instance ${instance.name}:`,
            {
              error: instanceError,
              instanceDetails: instance,
            },
          )
        }
      }

      if (this.sonarrServices.size === 0) {
        throw new Error('Unable to initialize any Sonarr services')
      }
    } catch (error) {
      this.log.error('Comprehensive error initializing Sonarr manager:', error)
      throw error
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

    let targetSonarrId = 0
    let targetRootFolder: string | null = null

    const genreRoutes = await this.fastify.db.getSonarrGenreRoutes()
    for (const route of genreRoutes) {
      if (itemGenres.has(route.genre)) {
        targetSonarrId = route.sonarrInstanceId
        targetRootFolder = route.rootFolder
        break
      }
    }

    if (targetSonarrId === 0) {
      const defaultInstance = await this.fastify.db.getDefaultSonarrInstance()
      if (!defaultInstance) {
        throw new Error('No default Sonarr instance configured')
      }
      targetSonarrId = defaultInstance.id
      targetRootFolder = defaultInstance.rootFolder || null
    }

    const sonarrService = this.sonarrServices.get(targetSonarrId)
    if (!sonarrService) {
      throw new Error(`Sonarr instance ${targetSonarrId} not found`)
    }

    const sonarrItem = this.prepareSonarrItem(item)

    if (targetRootFolder) {
      await sonarrService.addToSonarr(sonarrItem, targetRootFolder)
    } else {
      await sonarrService.addToSonarr(sonarrItem)
    }

    await this.fastify.db.updateWatchlistItem(key, {
      sonarr_instance_id: targetSonarrId,
    })
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

  // Remove this method since we don't need sync functionality yet
  /* async syncAllInstances(): Promise<void> {
    const syncPromises = Array.from(this.sonarrServices.values()).map(
      (service) => service.syncLibrary()
    )
    await Promise.all(syncPromises)
  } */

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
