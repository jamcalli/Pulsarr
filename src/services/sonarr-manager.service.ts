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

  async fetchAllSeries(): Promise<SonarrItem[]> {
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

        const instanceSeries = await sonarrService.fetchSeries()

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
    targetInstanceId?: number,
  ): Promise<void> {
    if (targetInstanceId !== undefined) {
      const targetService = this.sonarrServices.get(targetInstanceId)
      if (!targetService) {
        throw new Error(`Sonarr service ${targetInstanceId} not found`)
      }

      const sonarrItem = this.prepareSonarrItem(item)

      try {
        const instance =
          await this.fastify.db.getSonarrInstance(targetInstanceId)
        if (!instance) {
          throw new Error(`Sonarr instance ${targetInstanceId} not found`)
        }

        let targetQualityProfileId: number | undefined = undefined

        const isNumericQualityProfile = (
          value: string | number | null,
        ): value is number => {
          if (value === null) return false
          if (typeof value === 'number') return true
          return /^\d+$/.test(value)
        }

        if (
          instance.qualityProfile &&
          isNumericQualityProfile(instance.qualityProfile)
        ) {
          targetQualityProfileId = Number(instance.qualityProfile)
        }

        await targetService.addToSonarr(
          sonarrItem,
          instance.rootFolder || undefined,
          targetQualityProfileId,
        )

        await this.fastify.db.updateWatchlistItem(key, {
          sonarr_instance_id: targetInstanceId,
        })

        this.log.info(
          `Successfully routed item to instance ${targetInstanceId} with quality profile ${targetQualityProfileId ?? 'default'}`,
        )
        return
      } catch (error) {
        this.log.error(
          `Failed to add item to instance ${targetInstanceId}:`,
          error,
        )
        throw error
      }
    }

    const itemGenres = new Set(
      Array.isArray(item.genres)
        ? item.genres
        : typeof item.genres === 'string'
          ? [item.genres]
          : [],
    )

    const genreRoutes = await this.fastify.db.getSonarrGenreRoutes()
    const instances = await this.fastify.db.getAllSonarrInstances()

    const genreMatches = genreRoutes.filter((route) =>
      itemGenres.has(route.genre),
    )

    if (genreMatches.length > 0) {
      for (const match of genreMatches) {
        this.log.info(
          `Processing genre route "${match.name}" for genre "${match.genre}"`,
        )
        const sonarrService = this.sonarrServices.get(match.sonarrInstanceId)
        if (!sonarrService) {
          this.log.warn(
            `Sonarr service ${match.sonarrInstanceId} not found for genre route "${match.name}"`,
          )
          continue
        }

        const sonarrItem = this.prepareSonarrItem(item)

        try {
          await sonarrService.addToSonarr(
            sonarrItem,
            match.rootFolder,
            match.qualityProfile,
          )
          await this.fastify.db.updateWatchlistItem(key, {
            sonarr_instance_id: match.sonarrInstanceId,
          })
          this.log.info(
            `Successfully routed item to genre-specific instance ${match.sonarrInstanceId} using route "${match.name}"`,
          )
        } catch (error) {
          this.log.error(
            `Failed to add item to genre-specific instance ${match.sonarrInstanceId} using route "${match.name}":`,
            error,
          )
        }
      }
    } else {
      const defaultInstance = await this.fastify.db.getDefaultSonarrInstance()
      if (!defaultInstance) {
        throw new Error('No default Sonarr instance configured')
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
        const sonarrService = this.sonarrServices.get(instance.id)
        if (!sonarrService) {
          this.log.warn(`Sonarr service ${instance.id} not found`)
          continue
        }

        const sonarrItem = this.prepareSonarrItem(item)

        try {
          const matchingRoute = genreRoutes.find(
            (route) =>
              route.sonarrInstanceId === instance.id &&
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

          await sonarrService.addToSonarr(
            sonarrItem,
            targetRootFolder || undefined,
            targetQualityProfileId,
          )

          await this.fastify.db.updateWatchlistItem(key, {
            sonarr_instance_id: instance.id,
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

  async addGenreRoute(
    route: Omit<SonarrGenreRoute, 'id'>,
  ): Promise<SonarrGenreRoute> {
    this.log.info(
      `Adding new genre route "${route.name}" for genre "${route.genre}"`,
    )
    return this.fastify.db.createSonarrGenreRoute(route)
  }

  async removeGenreRoute(id: number): Promise<void> {
    this.log.info(`Removing genre route ${id}`)
    await this.fastify.db.deleteSonarrGenreRoute(id)
  }

  async updateGenreRoute(
    id: number,
    updates: Partial<SonarrGenreRoute>,
  ): Promise<void> {
    this.log.info(
      `Updating genre route ${id}${updates.name ? ` to name "${updates.name}"` : ''}`,
    )
    await this.fastify.db.updateSonarrGenreRoute(id, updates)
  }

  async getSonarrInstance(id: number): Promise<SonarrInstance | null> {
    return await this.fastify.db.getSonarrInstance(id)
  }

  getSonarrService(id: number): SonarrService | undefined {
    return this.sonarrServices.get(id)
  }
}
