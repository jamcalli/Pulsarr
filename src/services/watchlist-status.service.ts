import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'
import { parseGuids } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  createRadarrSyncConfig,
  createSonarrSyncConfig,
  syncInstance,
} from './watchlist-status/instance-sync/index.js'
import {
  createRadarrJunctionConfig,
  createSonarrJunctionConfig,
  processJunctionUpdates,
} from './watchlist-status/junction/index.js'
import {
  createRadarrStatusConfig,
  createSonarrStatusConfig,
  processStatusUpdates,
} from './watchlist-status/status-sync/index.js'

export class StatusService {
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly dbService: FastifyInstance['db'],
    private readonly sonarrManager: FastifyInstance['sonarrManager'],
    private readonly radarrManager: FastifyInstance['radarrManager'],
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'WATCHLIST_STATUS')
  }

  /**
   * Syncs status information for all watchlist items from Sonarr and Radarr instances.
   *
   * @param prefetchedData - Optional pre-fetched data to avoid duplicate API calls.
   *   When provided, this method will use the already-fetched series/movies data instead of
   *   making new API requests to Sonarr/Radarr. This is useful when the caller has already
   *   fetched this data (e.g., during reconciliation workflows) to improve performance.
   * @param prefetchedData.existingSeries - Pre-fetched Sonarr series data (bypasses exclusions)
   * @param prefetchedData.existingMovies - Pre-fetched Radarr movies data (bypasses exclusions)
   * @returns Promise resolving to counts of updated shows and movies
   */
  async syncAllStatuses(prefetchedData?: {
    existingSeries?: SonarrItem[]
    existingMovies?: RadarrItem[]
  }): Promise<{ shows: number; movies: number }> {
    const [showUpdates, movieUpdates] = await Promise.all([
      this.syncSonarrStatuses(prefetchedData?.existingSeries),
      this.syncRadarrStatuses(prefetchedData?.existingMovies),
    ])
    return { shows: showUpdates, movies: movieUpdates }
  }

  async syncSonarrStatuses(prefetchedSeries?: SonarrItem[]): Promise<number> {
    try {
      const existingSeries =
        prefetchedSeries ?? (await this.sonarrManager.fetchAllSeries(true))
      const watchlistItems = await this.dbService.getAllShowWatchlistItems()
      const dbWatchlistItems = this.convertToDbWatchlistItems(watchlistItems)

      // Process status updates using unified processor
      const mainUpdates = await processStatusUpdates(
        { db: this.dbService, logger: this.log },
        createSonarrStatusConfig(),
        existingSeries,
        dbWatchlistItems,
      )
      let updateCount = 0
      if (mainUpdates.length > 0) {
        updateCount = await this.dbService.bulkUpdateWatchlistItems(mainUpdates)
      }

      // Process junction updates for Sonarr items
      const junctionUpdates = await this.processShowJunctionUpdates(
        existingSeries,
        dbWatchlistItems,
      )
      updateCount += junctionUpdates

      // Apply user tags if the service is available and enabled
      if (this.fastify.userTags && this.fastify.config.tagUsersInSonarr) {
        try {
          const tagResults =
            await this.fastify.userTags.tagSonarrContentWithData(
              existingSeries,
              watchlistItems,
            )
          this.log.debug({ tagResults }, 'Applied user tags to Sonarr content')
        } catch (tagError) {
          this.log.error(
            { error: tagError },
            'Error applying user tags to Sonarr content',
          )
        }
      }

      return updateCount
    } catch (error) {
      this.log.error({ error }, 'Error syncing Sonarr statuses:')
      throw error
    }
  }

  async syncRadarrStatuses(prefetchedMovies?: RadarrItem[]): Promise<number> {
    try {
      const existingMovies =
        prefetchedMovies ?? (await this.radarrManager.fetchAllMovies(true))
      const watchlistItems = await this.dbService.getAllMovieWatchlistItems()
      const dbWatchlistItems = this.convertToDbWatchlistItems(watchlistItems)

      // Process status updates using unified processor
      const mainUpdates = await processStatusUpdates(
        { db: this.dbService, logger: this.log },
        createRadarrStatusConfig(this.log),
        existingMovies,
        dbWatchlistItems,
      )
      let updateCount = 0
      if (mainUpdates.length > 0) {
        updateCount = await this.dbService.bulkUpdateWatchlistItems(mainUpdates)
      }

      // Process junction updates for Radarr items
      const junctionUpdates = await this.processMovieJunctionUpdates(
        existingMovies,
        dbWatchlistItems,
      )
      updateCount += junctionUpdates

      // Apply user tags if the service is available and enabled
      if (this.fastify.userTags && this.fastify.config.tagUsersInRadarr) {
        try {
          const tagResults =
            await this.fastify.userTags.tagRadarrContentWithData(
              existingMovies,
              watchlistItems,
            )
          this.log.debug({ tagResults }, 'Applied user tags to Radarr content')
        } catch (tagError) {
          this.log.error(
            { error: tagError },
            'Error applying user tags to Radarr content',
          )
        }
      }

      return updateCount
    } catch (error) {
      this.log.error({ error }, 'Error syncing Radarr statuses:')
      throw error
    }
  }

  private convertToDbWatchlistItems<T extends { id: string | number }>(
    items: T[],
  ): (Omit<T, 'id'> & { id: number })[] {
    return items.map((item) => ({
      ...item,
      id: typeof item.id === 'string' ? Number(item.id) : item.id,
    })) as (Omit<T, 'id'> & { id: number })[]
  }

  // Junction table updates for Sonarr
  async processShowJunctionUpdates(
    sonarrItems: SonarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
  ): Promise<number> {
    return processJunctionUpdates(
      { db: this.dbService, logger: this.log },
      createSonarrJunctionConfig(this.dbService),
      sonarrItems,
      watchlistItems,
    )
  }

  // junction table updates for Radarr
  async processMovieJunctionUpdates(
    radarrItems: RadarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
  ): Promise<number> {
    return processJunctionUpdates(
      { db: this.dbService, logger: this.log },
      createRadarrJunctionConfig(this.dbService),
      radarrItems,
      watchlistItems,
    )
  }

  private findMatch<T extends SonarrItem | RadarrItem>(
    items: T[],
    itemGuids: string[] | string | undefined,
  ): T | undefined {
    if (!itemGuids) return undefined
    // Use parseGuids utility function
    const guids = parseGuids(itemGuids)
    return items.find((item) =>
      item.guids.some((itemGuid) => guids.includes(itemGuid)),
    )
  }

  async syncInstance(
    instanceId: number,
    instanceType: 'radarr' | 'sonarr',
  ): Promise<number> {
    try {
      const itemsCopied =
        instanceType === 'radarr'
          ? await this.syncRadarrInstance(instanceId)
          : await this.syncSonarrInstance(instanceId)

      this.log.info(
        `Syncing statuses for ${instanceType} instance ${instanceId}`,
      )

      await this.syncAllStatuses()

      this.log.info(
        `Completed sync for ${instanceType} instance ${instanceId}: ${itemsCopied} items copied and statuses updated`,
      )

      return itemsCopied
    } catch (error) {
      this.log.error(
        { error },
        `Error in syncInstance for ${instanceType} ${instanceId}:`,
      )
      throw error
    }
  }

  private hasActiveProgressConnections(): boolean {
    return this.fastify?.progress?.hasActiveConnections() || false
  }

  private emitProgress(progressData: {
    operationId: string
    type: 'sync'
    phase: string
    progress: number
    message: string
  }): void {
    if (this.fastify?.progress) {
      this.fastify.progress.emit(progressData)
    }
  }

  /**
   * Process instances in batches with progress reporting
   */
  private async processInstanceBatch<
    T extends { id: number; name: string; isDefault: boolean },
  >(opts: {
    instances: T[]
    instanceType: 'radarr' | 'sonarr'
    syncFn: (id: number) => Promise<number>
    operationId: string
    totalInstances: number
    instancesProcessed: number
    emitProgress: boolean
    batchSize: number
  }): Promise<{
    results: Array<{ id: number; name: string; itemsCopied: number }>
    processedCount: number
  }> {
    const { instances, instanceType, syncFn, batchSize } = opts
    const results: Array<{ id: number; name: string; itemsCopied: number }> = []
    let processed = opts.instancesProcessed
    const label = instanceType.charAt(0).toUpperCase() + instanceType.slice(1)

    for (let i = 0; i < instances.length; i += batchSize) {
      const batch = instances.slice(i, i + batchSize)

      if (opts.emitProgress) {
        this.emitProgress({
          operationId: opts.operationId,
          type: 'sync',
          phase: 'processing',
          progress: 5 + Math.floor((processed / opts.totalInstances) * 90),
          message: `Processing ${label} instances ${i + 1} to ${Math.min(i + batch.length, instances.length)} of ${instances.length}`,
        })
      }

      const batchResults = await Promise.all(
        batch.map(async (instance) => {
          try {
            this.log.info(
              `Syncing ${label} instance ${instance.id} (${instance.name})`,
            )
            const itemsCopied = await syncFn(instance.id)
            return { id: instance.id, name: instance.name, itemsCopied }
          } catch (error) {
            this.log.error(
              { error },
              `Error syncing ${label} instance ${instance.id} (${instance.name}):`,
            )
            return { id: instance.id, name: instance.name, itemsCopied: 0 }
          }
        }),
      )

      results.push(...batchResults)
      processed += batch.length
    }

    return { results, processedCount: processed }
  }

  async syncRadarrInstance(instanceId: number): Promise<number> {
    const emitProgress = this.hasActiveProgressConnections()
    const config = createRadarrSyncConfig(
      this.dbService,
      this.radarrManager,
      (items, guids) => this.findMatch(items, guids ?? undefined) ?? null,
    )

    return syncInstance(
      {
        db: this.dbService,
        contentRouter: this.fastify.contentRouter,
        logger: this.log,
      },
      config,
      instanceId,
      emitProgress ? (event) => this.emitProgress(event) : undefined,
    )
  }

  async syncSonarrInstance(instanceId: number): Promise<number> {
    const emitProgress = this.hasActiveProgressConnections()
    const config = createSonarrSyncConfig(
      this.dbService,
      this.sonarrManager,
      (items, guids) => this.findMatch(items, guids ?? undefined) ?? null,
    )

    return syncInstance(
      {
        db: this.dbService,
        contentRouter: this.fastify.contentRouter,
        logger: this.log,
      },
      config,
      instanceId,
      emitProgress ? (event) => this.emitProgress(event) : undefined,
    )
  }

  async syncAllConfiguredInstances(): Promise<{
    radarr: Array<{ id: number; name: string; itemsCopied: number }>
    sonarr: Array<{ id: number; name: string; itemsCopied: number }>
  }> {
    const operationId = `all-instances-sync-${Date.now()}`
    const emitProgress = this.hasActiveProgressConnections()
    const BATCH_SIZE = 3

    if (emitProgress) {
      this.emitProgress({
        operationId,
        type: 'sync',
        phase: 'start',
        progress: 0,
        message: 'Initializing sync for all non-default instances...',
      })
    }

    try {
      // Fetch all instances in parallel
      const [radarrInstances, sonarrInstances] = await Promise.all([
        this.dbService.getAllRadarrInstances(),
        this.dbService.getAllSonarrInstances(),
      ])

      const radarrToSync = radarrInstances.filter((i) => !i.isDefault)
      const sonarrToSync = sonarrInstances.filter((i) => !i.isDefault)
      const totalInstances = radarrToSync.length + sonarrToSync.length

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sync',
          phase: 'processing',
          progress: 5,
          message: `Found ${totalInstances} instances to sync (${radarrToSync.length} Radarr, ${sonarrToSync.length} Sonarr)`,
        })
      }

      // Process Radarr instances
      const radarrResult = await this.processInstanceBatch({
        instances: radarrToSync,
        instanceType: 'radarr',
        syncFn: (id) => this.syncRadarrInstance(id),
        operationId,
        totalInstances,
        instancesProcessed: 0,
        emitProgress,
        batchSize: BATCH_SIZE,
      })

      // Process Sonarr instances
      const sonarrResult = await this.processInstanceBatch({
        instances: sonarrToSync,
        instanceType: 'sonarr',
        syncFn: (id) => this.syncSonarrInstance(id),
        operationId,
        totalInstances,
        instancesProcessed: radarrResult.processedCount,
        emitProgress,
        batchSize: BATCH_SIZE,
      })

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sync',
          phase: 'complete',
          progress: 100,
          message: `Completed sync for all ${totalInstances} instances`,
        })
      }

      const totalRadarrItems = radarrResult.results.reduce(
        (sum, r) => sum + r.itemsCopied,
        0,
      )
      const totalSonarrItems = sonarrResult.results.reduce(
        (sum, r) => sum + r.itemsCopied,
        0,
      )

      this.log.info(
        {
          radarr: `${radarrResult.results.length} instances, ${totalRadarrItems} items copied`,
          sonarr: `${sonarrResult.results.length} instances, ${totalSonarrItems} items copied`,
        },
        'Completed sync for all configured instances',
      )

      return {
        radarr: radarrResult.results,
        sonarr: sonarrResult.results,
      }
    } catch (error) {
      this.log.error({ error }, 'Error syncing all configured instances:')

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sync',
          phase: 'error',
          progress: 100,
          message: `Error syncing instances: ${error}`,
        })
      }

      throw error
    }
  }
}
