import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import { isRollingMonitoringOption } from '@root/types/sonarr/rolling.js'
import type {
  ConnectionTestResult,
  SonarrInstance,
  SonarrItem,
} from '@root/types/sonarr.types.js'
import { SonarrService } from '@services/sonarr.service.js'
import { createServiceLogger } from '@utils/logger.js'
import {
  delayWithBackoffAndJitter,
  isSameServerEndpoint,
  normalizeEndpointWithPath,
} from '@utils/url.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class SonarrManagerService {
  private sonarrServices: Map<number, SonarrService> = new Map()
  /** Creates a fresh service logger that inherits current log level */

  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'SONARR_MANAGER')
  }

  constructor(
    private readonly baseLog: FastifyBaseLogger,
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
      this.log.debug('Starting Sonarr manager initialization')

      const instances = await this.fastify.db.getAllSonarrInstances()
      this.log.debug(
        {
          count: instances.length,
          instanceIds: instances.map((i) => i.id),
          instanceNames: instances.map((i) => i.name),
        },
        'Found Sonarr instances',
      )

      if (instances.length === 0) {
        this.log.warn('No Sonarr instances found')
        return
      }

      for (const instance of instances) {
        this.log.debug(
          {
            id: instance.id,
            name: instance.name,
            baseUrl: instance.baseUrl,
          },
          'Attempting to initialize instance',
        )

        try {
          const sonarrService = new SonarrService(
            this.baseLog,
            this.appBaseUrl,
            this.port,
            this.fastify,
          )
          await sonarrService.initialize(instance)
          this.sonarrServices.set(instance.id, sonarrService)
          this.log.debug(
            { instanceId: instance.id, instanceName: instance.name },
            'Successfully initialized Sonarr service',
          )
        } catch (instanceError) {
          this.log.error(
            {
              error: instanceError,
              instanceId: instance.id,
              instanceName: instance.name,
            },
            'Failed to initialize Sonarr service for instance, will retry',
          )

          // Use bounded backoff with jitter for retry
          await delayWithBackoffAndJitter(0, 500, 2000)
          try {
            const sonarrService = new SonarrService(
              this.baseLog,
              this.appBaseUrl,
              this.port,
              this.fastify,
            )
            await sonarrService.initialize(instance)
            this.sonarrServices.set(instance.id, sonarrService)
            this.log.debug(
              { instanceId: instance.id, instanceName: instance.name },
              'Successfully initialized Sonarr service on retry',
            )
          } catch (retryError) {
            this.log.error(
              {
                error: retryError,
                instanceId: instance.id,
                instanceName: instance.name,
              },
              'Failed to initialize Sonarr service after retry',
            )
          }
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
        this.baseLog,
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

    const tasks = instances.map(async (instance) => {
      const sonarrService = this.sonarrServices.get(instance.id)
      if (!sonarrService) {
        this.log.warn(
          { instanceId: instance.id, instanceName: instance.name },
          'Sonarr service not initialized',
        )
        return []
      }
      const series = await sonarrService.fetchSeries(bypassExclusions)
      return Array.from(series).map((s) => ({
        ...s,
        sonarr_instance_id: instance.id,
      }))
    })

    const results = await Promise.allSettled(tasks)
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled') {
        allSeries.push(...r.value)
      } else {
        this.log.error(
          {
            error: r.reason,
            instanceId: instances[i]?.id,
            instanceName: instances[i]?.name,
          },
          'Error fetching series from Sonarr instance',
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
      const toNum = (v: unknown): number | undefined => {
        if (typeof v === 'number')
          return Number.isInteger(v) && v > 0 ? v : undefined
        if (typeof v === 'string') {
          const s = v.trim()
          const n = /^\d+$/.test(s) ? Number(s) : NaN
          return Number.isInteger(n) && n > 0 ? n : undefined
        }
        return undefined
      }
      const qpSource = qualityProfile ?? instance.qualityProfile
      const targetQualityProfileId =
        qpSource !== null ? toNum(qpSource) : undefined

      // Use provided tags or instance default tags
      const targetTags = Array.from(new Set(tags ?? instance.tags ?? []))

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

      // Add to Sonarr and get the series ID directly
      const sonarrSeriesId = await sonarrService.addToSonarr(
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
          // Extract TVDB ID
          const tvdbGuid = sonarrItem.guids.find((g) =>
            g.toLowerCase().startsWith('tvdb:'),
          )
          const tvdbId = tvdbGuid ? tvdbGuid.replace(/^tvdb:/i, '') : undefined

          // Create rolling monitoring entry
          const plexSessionMonitor = this.fastify.plexSessionMonitor
          if (plexSessionMonitor) {
            await plexSessionMonitor.createRollingMonitoredShow(
              sonarrSeriesId,
              targetInstanceId,
              tvdbId || '',
              sonarrItem.title,
              targetSeasonMonitoring as 'pilotRolling' | 'firstSeasonRolling',
            )

            this.log.debug(
              {
                seriesId: sonarrSeriesId,
                instanceId: targetInstanceId,
                tvdbId: tvdbId ?? null,
                monitoring: targetSeasonMonitoring,
              },
              'Created rolling monitoring entry',
            )
          }
        } catch (error) {
          this.log.error({ error }, 'Failed to create rolling monitoring entry')
        }
      }

      await this.fastify.db.updateWatchlistItem(userId, key, {
        sonarr_instance_id: targetInstanceId,
        syncing: syncing,
        status: 'requested',
      })

      this.log.debug(
        {
          instanceId: targetInstanceId,
          qualityProfileId: targetQualityProfileId ?? 'default',
          tags: targetTags,
          searchOnAdd: targetSearchOnAdd,
          seasonMonitoring: targetSeasonMonitoring,
          seriesType: targetSeriesType,
          title: sonarrItem.title,
          userId,
          key,
        },
        'Successfully routed item to Sonarr',
      )
    } catch (error) {
      this.log.error(
        {
          error,
          instanceId: targetInstanceId,
          title: sonarrItem.title,
          userId,
          key,
        },
        'Failed to route item to Sonarr',
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
    let sonarrService: SonarrService | undefined
    try {
      sonarrService = new SonarrService(
        this.baseLog,
        this.appBaseUrl,
        this.port,
        this.fastify,
      )
      await sonarrService.initialize({ ...instance, id })
      this.sonarrServices.set(id, sonarrService)
      return id
    } catch (error) {
      const originalError = error
      this.log.error(
        {
          error,
          instanceName: instance.name,
          instanceBaseUrl: instance.baseUrl,
        },
        'Failed to initialize new Sonarr instance; rolling back',
      )
      if (sonarrService) {
        try {
          await sonarrService.removeWebhook()
        } catch (cleanupErr) {
          this.log.warn(
            { error: cleanupErr },
            `Failed to cleanup webhook for new instance ${id}`,
          )
        }
      }
      try {
        await this.fastify.db.deleteSonarrInstance(id)
      } catch (dbDelErr) {
        this.log.warn(
          { error: dbDelErr, id },
          'Failed to rollback created Sonarr instance record',
        )
      }
      throw originalError
    }
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
    const current = await this.fastify.db.getSonarrInstance(id)
    if (current) {
      const candidate = { ...current, ...updates }
      const oldService = this.sonarrServices.get(id)

      // Only treat changes to the target server endpoint as a "server change"
      // API key changes on the same server should not trigger webhook removal
      const serverChanged = !isSameServerEndpoint(
        current.baseUrl,
        candidate.baseUrl,
      )

      // Detect full baseUrl changes including path (needs new service)
      const baseUrlChanged =
        normalizeEndpointWithPath(current.baseUrl) !==
        normalizeEndpointWithPath(candidate.baseUrl)

      // API key transitions
      const isPlaceholderToReal =
        current.apiKey === 'placeholder' && candidate.apiKey !== 'placeholder'
      const apiKeyChanged = current.apiKey !== candidate.apiKey
      const needsNewService =
        baseUrlChanged || isPlaceholderToReal || apiKeyChanged

      if (needsNewService) {
        // Server changed or API key updated - need to create new service and webhooks
        const sonarrService = new SonarrService(
          this.baseLog,
          this.appBaseUrl,
          this.port,
          this.fastify,
        )

        try {
          await sonarrService.initialize(candidate)
          // Only persist after successful init; cleanup on persist failure
          try {
            await this.fastify.db.updateSonarrInstance(id, updates)
          } catch (dbErr) {
            this.log.error(
              { error: dbErr, instanceId: id },
              'Failed to persist Sonarr instance update',
            )
            try {
              await sonarrService.removeWebhook()
            } catch (_) {
              // ignore cleanup failure
            }
            throw new Error('Failed to persist Sonarr instance update', {
              cause: dbErr as Error,
            })
          }

          // Clean up old webhook from previous server (but not for placeholder transitions)
          // Skip cleanup when transitioning from placeholder credentials (no real webhook existed)
          const toPlaceholder =
            current.apiKey !== 'placeholder' &&
            candidate.apiKey === 'placeholder'

          if (oldService && serverChanged && current.apiKey !== 'placeholder') {
            try {
              await oldService.removeWebhook()
            } catch (cleanupErr) {
              this.log.warn(
                { error: cleanupErr },
                `Failed to cleanup old webhook for previous server of instance ${id}`,
              )
            }
          } else if (oldService && toPlaceholder) {
            // Remove webhook when transitioning to placeholder credentials
            try {
              await oldService.removeWebhook()
            } catch (cleanupErr) {
              this.log.warn(
                { error: cleanupErr },
                `Failed to cleanup webhook after transitioning ${id} to placeholder credentials`,
              )
            }
          }
          this.sonarrServices.set(id, sonarrService)
        } catch (initError) {
          this.log.error(
            { error: initError },
            `Failed to initialize Sonarr instance ${id}`,
          )
          throw initError
        }
      } else {
        // Server unchanged - just update configuration, no webhook changes needed
        await this.fastify.db.updateSonarrInstance(id, updates)

        // Update the existing service configuration if it exists
        if (oldService) {
          const updatedInstance = { ...current, ...updates }
          oldService.updateConfiguration(updatedInstance)
          this.log.debug(
            { instanceId: id },
            'Updated Sonarr instance configuration (no server change)',
          )
        }
      }
    } else {
      throw new Error(`Sonarr instance ${id} not found`)
    }
  }

  async getSonarrInstance(id: number): Promise<SonarrInstance | null> {
    return await this.fastify.db.getSonarrInstance(id)
  }

  getSonarrService(id: number): SonarrService | undefined {
    return this.sonarrServices.get(id)
  }
}
