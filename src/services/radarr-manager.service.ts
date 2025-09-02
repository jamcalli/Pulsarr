import type {
  ConnectionTestResult,
  MinimumAvailability,
  RadarrInstance,
  Item as RadarrItem,
} from '@root/types/radarr.types.js'
import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import { RadarrService } from '@services/radarr.service.js'
import { createServiceLogger } from '@utils/logger.js'
import {
  delayWithBackoffAndJitter,
  isSameServerEndpoint,
  normalizeEndpointWithPath,
} from '@utils/url.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class RadarrManagerService {
  private radarrServices: Map<number, RadarrService> = new Map()
  /** Creates a fresh service logger that inherits current log level */

  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'RADARR_MANAGER')
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
      this.log.debug('Starting Radarr manager initialization')
      const instances = await this.fastify.db.getAllRadarrInstances()
      this.log.debug(
        {
          count: instances.length,
          instanceIds: instances.map((i) => i.id),
          instanceNames: instances.map((i) => i.name),
        },
        'Found Radarr instances',
      )

      if (instances.length === 0) {
        this.log.warn('No Radarr instances found')
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
          const radarrService = new RadarrService(
            this.baseLog,
            this.appBaseUrl,
            this.port,
            this.fastify,
          )
          await radarrService.initialize(instance)
          this.radarrServices.set(instance.id, radarrService)
          this.log.debug(
            { instanceId: instance.id, instanceName: instance.name },
            'Successfully initialized Radarr service',
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

          // Use bounded backoff with jitter for retry
          await delayWithBackoffAndJitter(0, 500, 2000)
          try {
            const radarrService = new RadarrService(
              this.baseLog,
              this.appBaseUrl,
              this.port,
              this.fastify,
            )
            await radarrService.initialize(instance)
            this.radarrServices.set(instance.id, radarrService)
            this.log.debug(
              { instanceId: instance.id, instanceName: instance.name },
              'Successfully initialized Radarr service on retry',
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

    const tasks = instances.map(async (instance) => {
      const radarrService = this.radarrServices.get(instance.id)
      if (!radarrService) {
        this.log.warn(
          { instanceId: instance.id, instanceName: instance.name },
          'Radarr service not initialized',
        )
        return []
      }
      const movies = await radarrService.fetchMovies(bypassExclusions)
      return Array.from(movies).map((m) => ({
        ...m,
        radarr_instance_id: instance.id,
      }))
    })

    const results = await Promise.allSettled(tasks)
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled') {
        allMovies.push(...r.value)
      } else {
        this.log.error(
          {
            error: r.reason,
            instanceId: instances[i]?.id,
            instanceName: instances[i]?.name,
          },
          'Error fetching movies from Radarr instance',
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
        qpSource == null ? undefined : toNum(qpSource)

      // Use provided tags or instance default tags
      const targetTags = [...new Set(tags ?? instance.tags ?? [])]

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

      this.log.debug(
        {
          instanceId: targetInstanceId,
          qualityProfileId: targetQualityProfileId ?? 'default',
          tags: targetTags,
          searchOnAdd: targetSearchOnAdd,
          minimumAvailability: targetMinimumAvailability,
          title: radarrItem.title,
          userId,
          key,
        },
        'Successfully routed item to Radarr',
      )
    } catch (error) {
      this.log.error(
        {
          error,
          instanceId: targetInstanceId,
          title: radarrItem.title,
          userId,
          key,
        },
        'Failed to route item to Radarr',
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
    let radarrService: RadarrService | undefined
    try {
      radarrService = new RadarrService(
        this.baseLog,
        this.appBaseUrl,
        this.port,
        this.fastify,
      )
      await radarrService.initialize({ ...instance, id })
      this.radarrServices.set(id, radarrService)
      return id
    } catch (error) {
      const originalError = error
      this.log.error(
        {
          error,
          instanceName: instance.name,
          instanceBaseUrl: instance.baseUrl,
        },
        'Failed to initialize new Radarr instance; rolling back',
      )
      if (radarrService) {
        try {
          await radarrService.removeWebhook()
        } catch (cleanupErr) {
          this.log.warn(
            { error: cleanupErr },
            `Failed to cleanup webhook for new instance ${id}`,
          )
        }
      }
      try {
        await this.fastify.db.deleteRadarrInstance(id)
      } catch (dbDelErr) {
        this.log.warn(
          { error: dbDelErr, id },
          'Failed to rollback created Radarr instance record',
        )
      }
      throw originalError
    }
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
    const current = await this.fastify.db.getRadarrInstance(id)
    if (current) {
      const candidate = { ...current, ...updates }
      const oldService = this.radarrServices.get(id)

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
        const radarrService = new RadarrService(
          this.baseLog,
          this.appBaseUrl,
          this.port,
          this.fastify,
        )

        try {
          await radarrService.initialize(candidate)
          // Only persist after successful init; cleanup on persist failure
          try {
            await this.fastify.db.updateRadarrInstance(id, updates)
          } catch (dbErr) {
            this.log.error(
              { error: dbErr, instanceId: id },
              'Failed to persist Radarr instance update',
            )
            try {
              await radarrService.removeWebhook()
            } catch (_) {
              // ignore cleanup failure
            }
            throw new Error('Failed to persist Radarr instance update', {
              cause: dbErr as Error,
            })
          }

          // Clean up old webhook only when server actually changed
          // Skip cleanup when transitioning from placeholder credentials (no real webhook existed)
          const toPlaceholder =
            current.apiKey !== 'placeholder' &&
            candidate.apiKey === 'placeholder'

          if (serverChanged && oldService && current.apiKey !== 'placeholder') {
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
          this.radarrServices.set(id, radarrService)
        } catch (initError) {
          this.log.error(
            { error: initError },
            `Failed to initialize Radarr instance ${id}`,
          )
          throw initError
        }
      } else {
        // Server unchanged - just update configuration, no webhook changes needed
        await this.fastify.db.updateRadarrInstance(id, updates)

        // Update the existing service configuration if it exists
        if (oldService) {
          const updatedInstance = { ...current, ...updates }
          oldService.updateConfiguration(updatedInstance)
          this.log.debug(
            { instanceId: id },
            'Updated Radarr instance configuration (no server change)',
          )
        }
      }
    } else {
      throw new Error(`Radarr instance ${id} not found`)
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
        this.baseLog,
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
