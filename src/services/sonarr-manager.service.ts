import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'
import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import { isRollingMonitoringOption } from '@root/types/sonarr/rolling.js'
import type {
  ConnectionTestResult,
  SonarrInstance,
  SonarrItem,
} from '@root/types/sonarr.types.js'
import { SonarrService } from '@services/sonarr.service.js'
import { getGuidMatchScore, parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

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
      this.log.info(
        {
          count: instances.length,
          instanceIds: instances.map((i) => i.id),
          instanceNames: instances.map((i) => i.name),
        },
        `Found ${instances.length} Sonarr instances`,
      )

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
            { error },
            `Failed to initialize Sonarr service for instance ${instance.name}`,
          )
        }
      }

      if (this.sonarrServices.size === 0) {
        throw new Error('Unable to initialize any Sonarr services')
      }
    } catch (error) {
      this.log.error({ error }, 'Error initializing Sonarr manager')
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
      this.log.error({ error }, 'Error testing Sonarr connection')
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
          { error },
          `Error fetching series for instance ${instance.name}`,
        )
      }
    }

    return allSeries
  }

  async routeItemToSonarr(
    item: SonarrItem,
    key: string,
    userId: number,
    instanceId?: number,
    syncing = false,
    rootFolder?: string,
    qualityProfile?: number | string | null,
    tags?: string[],
    searchOnAdd?: boolean | null,
    seasonMonitoring?: string | null,
    seriesType?: 'standard' | 'anime' | 'daily' | null,
  ): Promise<void> {
    // If no specific instance is provided, try to get the default instance
    let targetInstanceId = instanceId
    if (targetInstanceId === undefined) {
      const defaultInstance = await this.fastify.db.getDefaultSonarrInstance()
      if (!defaultInstance) {
        throw new Error(
          'No Sonarr instance ID provided and no default instance found',
        )
      }
      targetInstanceId = defaultInstance.id
    }

    const sonarrService = this.sonarrServices.get(targetInstanceId)
    if (!sonarrService) {
      throw new Error(`Sonarr service ${targetInstanceId} not found`)
    }

    const sonarrItem = this.prepareSonarrItem(item)

    try {
      const instance = await this.fastify.db.getSonarrInstance(targetInstanceId)
      if (!instance) {
        throw new Error(`Sonarr instance ${targetInstanceId} not found`)
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

      // Use provided season monitoring or instance default
      const targetSeasonMonitoring =
        seasonMonitoring ?? instance.seasonMonitoring ?? 'all'

      // Check if this is a rolling monitoring option
      const isRollingMonitoring = isRollingMonitoringOption(
        targetSeasonMonitoring,
      )

      // Use provided series type or instance default
      const targetSeriesType = seriesType ?? instance.seriesType ?? 'standard'

      // If rolling monitoring, convert to appropriate Sonarr monitoring option
      let sonarrMonitoringOption = targetSeasonMonitoring
      if (isRollingMonitoring) {
        // For rolling options, start with pilot or firstSeason
        sonarrMonitoringOption =
          targetSeasonMonitoring === 'pilotRolling' ? 'pilot' : 'firstSeason'
      }

      // Add to Sonarr
      await sonarrService.addToSonarr(
        sonarrItem,
        targetRootFolder,
        targetQualityProfileId,
        targetTags,
        targetSearchOnAdd,
        sonarrMonitoringOption,
        targetSeriesType,
      )

      // If rolling monitoring was used, create tracking entry
      if (isRollingMonitoring) {
        try {
          // Get the series ID from Sonarr with retry logic to handle indexing delays
          let addedSeries = null
          let retries = 3
          const retryDelay = 1000 // 1 second

          while (!addedSeries && retries > 0) {
            const allSeries = await sonarrService.getAllSeries()

            // First try exact TVDB ID match
            const tvdbGuid = sonarrItem.guids.find((g) => g.startsWith('tvdb:'))
            const tvdbId = tvdbGuid ? tvdbGuid.replace('tvdb:', '') : undefined

            if (tvdbId) {
              addedSeries = allSeries.find(
                (s) => s.tvdbId === Number.parseInt(tvdbId, 10),
              )
            }

            // Fallback to title match only if TVDB match fails
            if (!addedSeries) {
              addedSeries = allSeries.find(
                (s) => s.title.toLowerCase() === sonarrItem.title.toLowerCase(),
              )
            }

            if (!addedSeries && retries > 1) {
              this.log.debug(
                `Series ${sonarrItem.title} not found yet, retrying in ${retryDelay}ms...`,
              )
              await new Promise((resolve) => setTimeout(resolve, retryDelay))
            }
            retries--
          }

          if (addedSeries) {
            // Extract TVDB ID
            const tvdbGuid = sonarrItem.guids.find((g) => g.startsWith('tvdb:'))
            const tvdbId = tvdbGuid ? tvdbGuid.replace('tvdb:', '') : undefined

            // Create rolling monitoring entry
            const plexSessionMonitor = this.fastify.plexSessionMonitor
            if (plexSessionMonitor) {
              await plexSessionMonitor.createRollingMonitoredShow(
                addedSeries.id,
                targetInstanceId,
                tvdbId || '',
                addedSeries.title,
                targetSeasonMonitoring as 'pilotRolling' | 'firstSeasonRolling',
              )

              this.log.info(
                `Created rolling monitoring entry for ${addedSeries.title} with ${targetSeasonMonitoring}`,
              )
            }
          } else {
            this.log.warn(
              `Could not find series ${sonarrItem.title} in Sonarr after ${3 - retries} retries - rolling monitoring entry not created`,
            )
          }
        } catch (error) {
          this.log.error({ error }, 'Failed to create rolling monitoring entry')
        }
      }

      await this.fastify.db.updateWatchlistItem(userId, key, {
        sonarr_instance_id: targetInstanceId,
        syncing: syncing,
      })

      this.log.info(
        `Successfully routed item to instance ${targetInstanceId} with quality profile ${targetQualityProfileId ?? 'default'}, tags ${targetTags.length ? targetTags.join(', ') : 'none'}, search on add ${targetSearchOnAdd ? 'enabled' : 'disabled'}, season monitoring set to '${targetSeasonMonitoring}', and series type '${targetSeriesType}'`,
      )
    } catch (error) {
      this.log.error(
        { error },
        `Failed to add item to instance ${targetInstanceId}`,
      )
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

  /**
   * Get a specific Sonarr service instance by ID
   * @param instanceId The ID of the Sonarr instance
   * @returns The SonarrService instance or undefined if not found
   */
  getInstance(instanceId: number): SonarrService | undefined {
    return this.sonarrServices.get(instanceId)
  }

  async verifyItemExists(
    instanceId: number,
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    const sonarrService = this.sonarrServices.get(instanceId)
    if (!sonarrService) {
      throw new Error(`Sonarr instance ${instanceId} not found`)
    }

    // Get the instance configuration to check bypassIgnored setting
    const instance = await this.fastify.db.getSonarrInstance(instanceId)
    if (!instance) {
      throw new Error(`Sonarr instance ${instanceId} not found in database`)
    }

    // Pass the bypassIgnored setting to fetchSeries to bypass exclusions if configured
    const existingSeries = await sonarrService.fetchSeries(
      instance.bypassIgnored,
    )
    // Use weighting system to find best match (prioritize higher GUID match counts)
    const potentialMatches = [...existingSeries]
      .map((series) => ({
        series,
        score: getGuidMatchScore(
          parseGuids(series.guids),
          parseGuids(item.guids),
        ),
      }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)

    return potentialMatches.length > 0
  }

  /**
   * Efficiently check if a series exists using TVDB lookup
   * @param instanceId - The Sonarr instance ID
   * @param tvdbId - The TVDB ID to check
   * @returns Promise resolving to ExistenceCheckResult with availability info
   */
  async seriesExistsByTvdbId(
    instanceId: number,
    tvdbId: number,
  ): Promise<ExistenceCheckResult> {
    const sonarrService = this.sonarrServices.get(instanceId)
    if (!sonarrService) {
      return {
        found: false,
        checked: false,
        serviceName: 'Sonarr',
        instanceId,
        error: `Sonarr instance ${instanceId} not found`,
      }
    }

    const result = await sonarrService.seriesExistsByTvdbId(tvdbId)
    // Add instance ID to the result
    return { ...result, instanceId }
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
        this.log.error({ error }, `Failed to remove webhook for instance ${id}`)
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
      try {
        await sonarrService.initialize(instance)
        this.sonarrServices.set(id, sonarrService)
      } catch (initError) {
        this.log.error(
          { error: initError },
          `Failed to initialize Sonarr instance ${id}`,
        )
        // Initialize failed, possibly due to webhook setup
        // Extract a meaningful error message
        let errorMessage = 'Failed to initialize Sonarr instance'

        if (initError instanceof Error) {
          if (initError.message.includes('Sonarr API error')) {
            errorMessage = initError.message
          } else if (initError.message.includes('ECONNREFUSED')) {
            errorMessage =
              'Connection refused. Please check if Sonarr is running.'
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

  async getSonarrInstance(id: number): Promise<SonarrInstance | null> {
    return await this.fastify.db.getSonarrInstance(id)
  }

  getSonarrService(id: number): SonarrService | undefined {
    return this.sonarrServices.get(id)
  }
}
