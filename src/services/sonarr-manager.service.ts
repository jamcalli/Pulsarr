import type { FastifyBaseLogger } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { SonarrService } from '@services/sonarr.service.js'
import type {
  SonarrInstance,
  SonarrGenreRoute,
  SonarrItem,
  ConnectionTestResult,
} from '@root/types/sonarr.types.js'
import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'

export class SonarrManagerService {
  private sonarrServices: Map<number, SonarrService> = new Map()

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
      this.log.info('Starting Sonarr manager initialization')

      const instances = await this.fastify.db.getAllSonarrInstances()
      this.log.info(`Found ${instances.length} Sonarr instances`, { instances })

      if (instances.length === 0) {
        this.log.warn('No Sonarr instances found')
        return
      }

      for (const instance of instances) {
        try {
          const sonarrService = new SonarrService(
            this.log,
            this.fastify.config.baseUrl,
            this.port,
            this.fastify,
          )
          await sonarrService.initialize(instance)
          this.sonarrServices.set(instance.id, sonarrService)
        } catch (error) {
          this.log.error(
            `Failed to initialize Sonarr service for instance ${instance.name}:`,
            error,
          )
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

  async testConnection(
    baseUrl: string,
    apiKey: string,
  ): Promise<ConnectionTestResult> {
    try {
      const tempService = new SonarrService(
        this.log,
        this.appBaseUrl,
        this.port,
        this.fastify,
      )
      return await tempService.testConnection(baseUrl, apiKey)
    } catch (error) {
      this.log.error('Error testing Sonarr connection:', error)
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Unknown error testing connection',
      }
    }
  }

  async fetchAllSeries(bypassExclusions = false): Promise<SonarrItem[]> {
    const allSeries: SonarrItem[] = []
    const instances = await this.fastify.db.getAllSonarrInstances()

    for (const instance of instances) {
      try {
        const sonarrService = this.sonarrServices.get(instance.id)

        if (!sonarrService) {
          this.log.warn(
            `Sonarr service for instance ${instance.name} not initialized`,
          )
          continue
        }

        const instanceSeries = await sonarrService.fetchSeries(bypassExclusions)

        for (const series of Array.from(instanceSeries)) {
          allSeries.push({
            ...series,
            sonarr_instance_id: instance.id,
          })
        }
      } catch (error) {
        this.log.error(
          `Error fetching series for instance ${instance.name}:`,
          error,
        )
      }
    }

    return allSeries
  }

  async routeItemToSonarr(
    item: SonarrItem,
    key: string,
    instanceId?: number,
    syncing = false,
    rootFolder?: string,
    qualityProfile?: number | string | null,
  ): Promise<void> {
    // If no specific instance is provided, we can't route the item
    if (instanceId === undefined) {
      throw new Error('No Sonarr instance ID provided for routing')
    }

    const sonarrService = this.sonarrServices.get(instanceId)
    if (!sonarrService) {
      throw new Error(`Sonarr service ${instanceId} not found`)
    }

    const sonarrItem = this.prepareSonarrItem(item)

    try {
      const instance = await this.fastify.db.getSonarrInstance(instanceId)
      if (!instance) {
        throw new Error(`Sonarr instance ${instanceId} not found`)
      }

      // Use the provided parameters if available, otherwise fall back to instance defaults
      const targetRootFolder = rootFolder || instance.rootFolder || undefined
      let targetQualityProfileId: number | undefined = undefined

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

      await sonarrService.addToSonarr(
        sonarrItem,
        targetRootFolder,
        targetQualityProfileId,
      )

      await this.fastify.db.updateWatchlistItem(key, {
        sonarr_instance_id: instanceId,
        syncing: syncing,
      })

      this.log.info(
        `Successfully routed item to instance ${instanceId} with quality profile ${targetQualityProfileId ?? 'default'}`,
      )
    } catch (error) {
      this.log.error(`Failed to add item to instance ${instanceId}:`, error)
      throw error
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
    const sonarrService = new SonarrService(
      this.log,
      this.appBaseUrl,
      this.port,
      this.fastify,
    )
    await sonarrService.initialize({ ...instance, id })
    this.sonarrServices.set(id, sonarrService)
    return id
  }

  async removeInstance(id: number): Promise<void> {
    const service = this.sonarrServices.get(id)
    if (service) {
      try {
        await service.removeWebhook()
      } catch (error) {
        this.log.error(`Failed to remove webhook for instance ${id}:`, error)
      }

      await this.fastify.db.deleteSonarrInstance(id)
      this.sonarrServices.delete(id)
    } else {
      this.log.warn(`No Sonarr service found for instance ${id}`)
      await this.fastify.db.deleteSonarrInstance(id)
    }
  }

  async updateInstance(
    id: number,
    updates: Partial<SonarrInstance>,
  ): Promise<void> {
    await this.fastify.db.updateSonarrInstance(id, updates)
    const instance = await this.fastify.db.getSonarrInstance(id)
    if (instance) {
      const sonarrService = new SonarrService(
        this.log,
        this.appBaseUrl,
        this.port,
        this.fastify,
      )
      await sonarrService.initialize(instance)
      this.sonarrServices.set(id, sonarrService)
    }
  }

  async getSonarrInstance(id: number): Promise<SonarrInstance | null> {
    return await this.fastify.db.getSonarrInstance(id)
  }

  getSonarrService(id: number): SonarrService | undefined {
    return this.sonarrServices.get(id)
  }
}
