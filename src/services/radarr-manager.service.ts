import type { FastifyBaseLogger } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { RadarrService } from '@services/radarr.service.js'
import type {
  RadarrInstance,
  RadarrGenreRoute,
} from '@root/types/radarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'

export class RadarrManagerService {
  private radarrServices: Map<number, RadarrService> = new Map()

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

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
          const radarrService = new RadarrService(this.log)
          await radarrService.initialize(instance)
          this.radarrServices.set(instance.id, radarrService)
          this.log.info(
            `Successfully initialized Radarr service for instance: ${instance.name}`,
          )
        } catch (instanceError) {
          this.log.error(
            `Detailed error initializing Radarr service for instance ${instance.name}:`,
            {
              error: instanceError,
              instanceDetails: instance,
            },
          )
        }
      }

      if (this.radarrServices.size === 0) {
        throw new Error('Unable to initialize any Radarr services')
      }
    } catch (error) {
      this.log.error('Comprehensive error initializing Radarr manager:', error)
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
        allMovies.push(...Array.from(instanceMovies))
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

    let targetRadarrId = 0
    let targetRootFolder: string | null = null

    const genreRoutes = await this.fastify.db.getRadarrGenreRoutes()
    for (const route of genreRoutes) {
      if (itemGenres.has(route.genre)) {
        targetRadarrId = route.radarrInstanceId
        targetRootFolder = route.rootFolder
        break
      }
    }

    if (targetRadarrId === 0) {
      const defaultInstance = await this.fastify.db.getDefaultRadarrInstance()
      if (!defaultInstance) {
        throw new Error('No default Radarr instance configured')
      }
      targetRadarrId = defaultInstance.id
      targetRootFolder = defaultInstance.rootFolder || null
    }

    const radarrService = this.radarrServices.get(targetRadarrId)
    if (!radarrService) {
      throw new Error(`Radarr instance ${targetRadarrId} not found`)
    }

    const radarrItem = this.prepareRadarrItem(item)

    if (targetRootFolder) {
      await radarrService.addToRadarr(radarrItem, targetRootFolder)
    } else {
      await radarrService.addToRadarr(radarrItem)
    }

    await this.fastify.db.updateWatchlistItem(key, {
      radarr_instance_id: targetRadarrId,
    })
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
    const radarrService = new RadarrService(this.log)
    await radarrService.initialize({ ...instance, id })
    this.radarrServices.set(id, radarrService)
    return id
  }

  async removeInstance(id: number): Promise<void> {
    await this.fastify.db.deleteRadarrInstance(id)
    this.radarrServices.delete(id)
  }

  async updateInstance(
    id: number,
    updates: Partial<RadarrInstance>,
  ): Promise<void> {
    await this.fastify.db.updateRadarrInstance(id, updates)
    const instance = await this.fastify.db.getRadarrInstance(id)
    if (instance) {
      const radarrService = new RadarrService(this.log)
      await radarrService.initialize(instance)
      this.radarrServices.set(id, radarrService)
    }
  }

  async addGenreRoute(route: Omit<RadarrGenreRoute, 'id'>): Promise<number> {
    return this.fastify.db.createRadarrGenreRoute(route)
  }

  async removeGenreRoute(id: number): Promise<void> {
    await this.fastify.db.deleteRadarrGenreRoute(id)
  }

  async updateGenreRoute(
    id: number,
    updates: Partial<RadarrGenreRoute>,
  ): Promise<void> {
    await this.fastify.db.updateRadarrGenreRoute(id, updates)
  }

  async getRadarrInstance(id: number): Promise<RadarrInstance | null> {
    return await this.fastify.db.getRadarrInstance(id)
  }

  getRadarrService(id: number): RadarrService | undefined {
    return this.radarrServices.get(id)
  }
}
