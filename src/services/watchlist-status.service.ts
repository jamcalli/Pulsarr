import type { User } from '@root/types/config.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'
import { parseGuids } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { BatchCopyItem } from './watchlist-status/instance-sync/index.js'
import { processBatchCopy } from './watchlist-status/instance-sync/index.js'
import {
  createRadarrJunctionConfig,
  createSonarrJunctionConfig,
  processJunctionUpdates,
} from './watchlist-status/junction/index.js'

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
      const mainUpdates = await this.processShowStatusUpdates(
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
          // Apply tags using already fetched data (tag creation happens inside per-instance)
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
      const mainUpdates = await this.processMovieStatusUpdates(
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
          // Apply tags using already fetched data (tag creation happens inside per-instance)
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

  private async processShowStatusUpdates(
    sonarrItems: SonarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
  ) {
    const updates: Array<{
      userId: number
      key: string
      added?: string
      status?: 'pending' | 'requested' | 'grabbed' | 'notified'
      series_status?: 'continuing' | 'ended'
      sonarr_instance_id?: number
    }> = []
    for (const item of watchlistItems) {
      const sonarrMatch = this.findMatch(sonarrItems, item.guids)
      if (sonarrMatch) {
        const instanceId = sonarrMatch.sonarr_instance_id || undefined
        const update: {
          userId: number
          key: string
          added?: string
          status?: 'pending' | 'requested' | 'grabbed' | 'notified'
          series_status?: 'continuing' | 'ended'
          sonarr_instance_id?: number
        } = {
          userId: item.user_id,
          key: item.key,
        }
        if (item.added !== sonarrMatch.added) {
          update.added = sonarrMatch.added
        }
        if (item.status !== sonarrMatch.status) {
          if (item.status !== 'notified') {
            update.status = sonarrMatch.status
          } else {
            // If item is notified but Sonarr shows it should be grabbed,
            // we need to backfill the missing grabbed status in history
            if (sonarrMatch.status === 'grabbed') {
              // Add the grabbed status to history with the correct timestamp
              try {
                if (item.id !== undefined && sonarrMatch.added) {
                  const itemId =
                    typeof item.id === 'string' ? Number(item.id) : item.id
                  await this.dbService.addStatusHistoryEntry(
                    itemId,
                    'grabbed',
                    sonarrMatch.added, // Use the timestamp from Sonarr
                  )
                }
              } catch (error) {
                this.log.error(
                  { error },
                  `Failed to backfill grabbed status for ${item.title}:`,
                )
              }
            } else {
              this.log.debug(
                `Preventing status downgrade for show ${item.title} [${item.key}]: keeping 'notified' instead of changing to '${sonarrMatch.status}'`,
              )
            }
          }
        }
        if (item.series_status !== sonarrMatch.series_status) {
          update.series_status = sonarrMatch.series_status
        }
        if (item.sonarr_instance_id !== instanceId) {
          update.sonarr_instance_id = instanceId
        }
        if (Object.keys(update).length > 2) {
          updates.push(update)
        }
      }
    }
    return updates
  }

  private async processMovieStatusUpdates(
    radarrItems: RadarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
  ) {
    const updates: Array<{
      userId: number
      key: string
      added?: string
      status?: 'pending' | 'requested' | 'grabbed' | 'notified'
      movie_status?: 'available' | 'unavailable'
      radarr_instance_id?: number
    }> = []
    for (const item of watchlistItems) {
      const radarrMatch = this.findMatch(radarrItems, item.guids)
      if (radarrMatch) {
        const instanceId = radarrMatch.radarr_instance_id || undefined
        const update: {
          userId: number
          key: string
          added?: string
          status?: 'pending' | 'requested' | 'grabbed' | 'notified'
          movie_status?: 'available' | 'unavailable'
          radarr_instance_id?: number
        } = {
          userId: item.user_id,
          key: item.key,
        }
        if (item.added !== radarrMatch.added) {
          update.added = radarrMatch.added
        }
        if (item.status !== radarrMatch.status) {
          if (item.status !== 'notified') {
            update.status = radarrMatch.status
          } else {
            // If item is notified but Radarr shows it should be grabbed,
            // we need to backfill the missing grabbed status in history
            if (radarrMatch.status === 'grabbed') {
              // Add the grabbed status to history with the correct timestamp
              try {
                if (item.id !== undefined && radarrMatch.added) {
                  const itemId =
                    typeof item.id === 'string' ? Number(item.id) : item.id
                  await this.dbService.addStatusHistoryEntry(
                    itemId,
                    'grabbed',
                    radarrMatch.added, // Use the timestamp from Radarr
                  )
                }
              } catch (error) {
                this.log.error(
                  { error },
                  `Failed to backfill grabbed status for ${item.title}:`,
                )
              }
            } else {
              this.log.debug(
                `Preventing status downgrade for movie ${item.title} [${item.key}]: keeping 'notified' instead of changing to '${radarrMatch.status}'`,
              )
            }
          }
        }
        if (item.movie_status !== radarrMatch.movie_status) {
          const ms = radarrMatch.movie_status
          if (ms === 'available' || ms === 'unavailable') {
            update.movie_status = ms
          } else {
            this.log.warn(
              { movie_status: ms, key: item.key },
              'Invalid movie_status; skipping update',
            )
          }
        }
        if (item.radarr_instance_id !== instanceId) {
          update.radarr_instance_id = instanceId
        }
        if (Object.keys(update).length > 2) {
          updates.push(update)
        }
      }
    }
    return updates
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

  async syncRadarrInstance(instanceId: number): Promise<number> {
    try {
      const operationId = `radarr-instance-sync-${instanceId}-${Date.now()}`
      const emitProgress = this.hasActiveProgressConnections()

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sync' as const,
          phase: 'start',
          progress: 0,
          message: `Initializing Radarr sync for instance ${instanceId}...`,
        })
      }

      this.log.info(`Starting sync for Radarr instance ${instanceId}`)
      const instance = await this.dbService.getRadarrInstance(instanceId)
      if (!instance) {
        throw new Error(`Radarr instance ${instanceId} not found`)
      }

      const defaultInstance = await this.dbService.getDefaultRadarrInstance()

      // Determine if this instance should receive content from the default instance
      const shouldSyncFromDefault =
        defaultInstance &&
        defaultInstance.id !== instanceId &&
        Array.isArray(defaultInstance.syncedInstances) &&
        defaultInstance.syncedInstances.includes(instanceId)

      this.log.debug(
        `Should sync from default to this instance: ${shouldSyncFromDefault}`,
      )

      // Get all watchlist items
      const watchlistItems = await this.dbService.getAllMovieWatchlistItems()

      // Deduplicate by GUID to get unique media items
      const uniqueByGuid = new Map<string, (typeof watchlistItems)[0]>()
      for (const item of watchlistItems) {
        // Use parseGuids utility function
        const guids = parseGuids(item.guids)
        if (guids.length > 0 && !uniqueByGuid.has(guids[0])) {
          uniqueByGuid.set(guids[0], item)
        }
      }
      const uniqueWatchlistItems = Array.from(uniqueByGuid.values())
      this.log.info(
        `Deduplicated watchlist items from ${watchlistItems.length} to ${uniqueWatchlistItems.length} unique media items`,
      )

      // Get all existing movies across all instances to check for duplicates
      const allExistingMovies = await this.radarrManager.fetchAllMovies()

      // Get movies already in the target instance
      const existingMoviesInInstance = allExistingMovies.filter(
        (movie) => movie.radarr_instance_id === instanceId,
      )

      // Create a map of GUIDs for quick lookup
      const existingGuidMap = new Map<string, boolean>()
      for (const movie of existingMoviesInInstance) {
        // Use parseGuids utility function
        const guids = parseGuids(movie.guids)
        for (const guid of guids) {
          existingGuidMap.set(guid, true)
        }
      }

      // Now that we have the content router, items should be routed based on
      // router rules rather than explicit genre matching
      const itemsToCopy: Array<{
        item: (typeof watchlistItems)[0]
        matchingMovie: RadarrItem
      }> = []

      for (const item of uniqueWatchlistItems) {
        try {
          if (item.id === undefined) continue

          const numericId =
            typeof item.id === 'string' ? Number(item.id) : item.id

          // Check if this item is already in the target instance
          const currentInstanceIds =
            await this.dbService.getWatchlistRadarrInstanceIds(numericId)
          if (currentInstanceIds.includes(instanceId)) continue

          // Items should be copied if they're in the default instance and this instance is synced
          let shouldBeInInstance = false

          if (shouldSyncFromDefault) {
            if (
              defaultInstance &&
              currentInstanceIds.includes(defaultInstance.id)
            ) {
              shouldBeInInstance = true
              this.log.debug(
                `Movie ${item.title} should be synced from default instance ${defaultInstance.id}`,
              )
            }
          }

          // Also check if this item is in any instance that syncs to this one
          if (!shouldBeInInstance) {
            const syncedInstances = Array.isArray(instance.syncedInstances)
              ? instance.syncedInstances
              : typeof instance.syncedInstances === 'string'
                ? (() => {
                    try {
                      return JSON.parse(instance.syncedInstances || '[]')
                    } catch {
                      return []
                    }
                  })()
                : []

            for (const syncedId of syncedInstances) {
              const isInSyncedInstance = currentInstanceIds.includes(syncedId)
              if (isInSyncedInstance) {
                shouldBeInInstance = true
                this.log.debug(
                  `Movie ${item.title} should be synced from instance ${syncedId}`,
                )
                break
              }
            }
          }

          if (shouldBeInInstance) {
            // Check if the item actually exists in the target instance but isn't in the junction table
            // Use parseGuids utility function
            const itemGuids = parseGuids(item.guids)

            const alreadyExists = itemGuids.some((guid: string) =>
              existingGuidMap.has(guid),
            )

            if (alreadyExists) {
              this.log.debug(
                `Movie ${item.title} exists in Radarr instance ${instanceId} but not in junction table, updating database`,
              )
              await this.dbService.addWatchlistToRadarrInstance(
                numericId,
                instanceId,
                'pending',
                currentInstanceIds.length === 0,
              )
              continue
            }

            // Find a matching movie in other instances that we can copy
            const matchingMovie = this.findMatch(allExistingMovies, item.guids)
            if (matchingMovie) {
              itemsToCopy.push({
                item,
                matchingMovie,
              })
            } else {
              this.log.debug(
                `No matching movie found for ${item.title} to copy to instance ${instanceId}`,
              )
            }
          }
        } catch (itemError) {
          this.log.error(
            {
              error:
                itemError instanceof Error
                  ? itemError
                  : new Error(String(itemError)),
              title: item.title,
            },
            'Error processing movie during analysis',
          )
        }
      }

      let itemsCopied = 0

      if (itemsToCopy.length > 0) {
        if (emitProgress) {
          this.emitProgress({
            operationId,
            type: 'sync' as const,
            phase: 'copying',
            progress: 5,
            message: `Starting to process ${itemsToCopy.length} movies for Radarr instance ${instanceId}`,
          })
        }

        // Pre-fetch users to avoid N+1 queries
        const userIds = new Set(itemsToCopy.map(({ item }) => item.user_id))
        const allUsers = await this.dbService.getAllUsers()
        const userMap = new Map<number, User>(
          allUsers.filter((u) => userIds.has(u.id)).map((u) => [u.id, u]),
        )

        // Build batch items with proper types
        const batchItems: BatchCopyItem[] = itemsToCopy.map(
          ({ item, matchingMovie }) => ({
            item: {
              ...item,
              id:
                typeof item.id === 'string'
                  ? Number.parseInt(item.id, 10)
                  : (item.id as number),
            },
            matchingContent: matchingMovie,
          }),
        )

        // Use p-limit batch processor instead of setTimeout polling
        itemsCopied = await processBatchCopy(
          { contentRouter: this.fastify.contentRouter, logger: this.log },
          batchItems,
          instanceId,
          'movie',
          userMap,
          emitProgress
            ? (completed, total) => {
                const progress = Math.min(
                  5 + Math.floor((completed / total) * 90),
                  95,
                )
                this.emitProgress({
                  operationId,
                  type: 'sync' as const,
                  phase: 'copying',
                  progress,
                  message: `Copied ${completed} of ${total} movies to Radarr instance ${instanceId}`,
                })
              }
            : undefined,
        )

        if (emitProgress) {
          this.emitProgress({
            operationId,
            type: 'sync' as const,
            phase: 'complete',
            progress: 100,
            message: `Completed sync for Radarr instance ${instanceId}, copied ${itemsCopied} items`,
          })
        }
      } else {
        if (emitProgress) {
          this.emitProgress({
            operationId,
            type: 'sync' as const,
            phase: 'complete',
            progress: 100,
            message: `No items needed to be copied to Radarr instance ${instanceId}`,
          })
        }
      }

      this.log.info(
        `Completed sync for Radarr instance ${instanceId}, copied ${itemsCopied} items`,
      )
      return itemsCopied
    } catch (error) {
      this.log.error({ error, instanceId }, 'Error syncing Radarr instance')
      throw error
    }
  }

  async syncSonarrInstance(instanceId: number): Promise<number> {
    try {
      const operationId = `sonarr-instance-sync-${instanceId}-${Date.now()}`
      const emitProgress = this.hasActiveProgressConnections()

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sync' as const,
          phase: 'start',
          progress: 0,
          message: `Initializing Sonarr sync for instance ${instanceId}...`,
        })
      }

      this.log.info(`Starting sync for Sonarr instance ${instanceId}`)
      const instance = await this.dbService.getSonarrInstance(instanceId)
      if (!instance) {
        throw new Error(`Sonarr instance ${instanceId} not found`)
      }

      const defaultInstance = await this.dbService.getDefaultSonarrInstance()

      // Determine if this instance should receive content from the default instance
      const shouldSyncFromDefault =
        defaultInstance &&
        defaultInstance.id !== instanceId &&
        Array.isArray(defaultInstance.syncedInstances) &&
        defaultInstance.syncedInstances.includes(instanceId)

      this.log.debug(
        `Should sync from default to this instance: ${shouldSyncFromDefault}`,
      )

      // Get all watchlist items
      const watchlistItems = await this.dbService.getAllShowWatchlistItems()

      // Deduplicate by GUID to get unique media items
      const uniqueByGuid = new Map<string, (typeof watchlistItems)[0]>()
      for (const item of watchlistItems) {
        // Use GuidHandler to parse GUIDs
        const guids = parseGuids(item.guids)
        if (guids.length > 0 && !uniqueByGuid.has(guids[0])) {
          uniqueByGuid.set(guids[0], item)
        }
      }
      const uniqueWatchlistItems = Array.from(uniqueByGuid.values())
      this.log.info(
        `Deduplicated watchlist items from ${watchlistItems.length} to ${uniqueWatchlistItems.length} unique media items`,
      )

      // Get all existing series across all instances to check for duplicates
      const allExistingSeries = await this.sonarrManager.fetchAllSeries()

      // Get series already in the target instance
      const existingSeriesInInstance = allExistingSeries.filter(
        (series) => series.sonarr_instance_id === instanceId,
      )

      // Create a map of GUIDs for quick lookup
      const existingGuidMap = new Map<string, boolean>()
      for (const series of existingSeriesInInstance) {
        // Use parseGuids utility function
        const guids = parseGuids(series.guids)
        for (const guid of guids) {
          existingGuidMap.set(guid, true)
        }
      }

      // Items should be routed based on router rules rather than explicit genre matching
      const itemsToCopy: Array<{
        item: (typeof watchlistItems)[0]
        matchingSeries: SonarrItem
      }> = []

      for (const item of uniqueWatchlistItems) {
        try {
          if (item.id === undefined) continue

          const numericId =
            typeof item.id === 'string' ? Number(item.id) : item.id

          // Check if this item is already in the target instance
          const currentInstanceIds =
            await this.dbService.getWatchlistSonarrInstanceIds(numericId)
          if (currentInstanceIds.includes(instanceId)) continue

          // Items should be copied if they're in the default instance and this instance is synced
          let shouldBeInInstance = false

          if (shouldSyncFromDefault) {
            if (
              defaultInstance &&
              currentInstanceIds.includes(defaultInstance.id)
            ) {
              shouldBeInInstance = true
              this.log.debug(
                `Show ${item.title} should be synced from default instance ${defaultInstance.id}`,
              )
            }
          }

          // Also check if this item is in any instance that syncs to this one
          if (!shouldBeInInstance) {
            const syncedInstances = Array.isArray(instance.syncedInstances)
              ? instance.syncedInstances
              : typeof instance.syncedInstances === 'string'
                ? (() => {
                    try {
                      return JSON.parse(instance.syncedInstances || '[]')
                    } catch {
                      return []
                    }
                  })()
                : []

            for (const syncedId of syncedInstances) {
              const isInSyncedInstance = currentInstanceIds.includes(syncedId)
              if (isInSyncedInstance) {
                shouldBeInInstance = true
                this.log.debug(
                  `Show ${item.title} should be synced from instance ${syncedId}`,
                )
                break
              }
            }
          }

          if (shouldBeInInstance) {
            // Check if the item actually exists in the target instance but isn't in the junction table
            // Use parseGuids utility function
            const itemGuids = parseGuids(item.guids)

            const alreadyExists = itemGuids.some((guid: string) =>
              existingGuidMap.has(guid),
            )

            if (alreadyExists) {
              this.log.debug(
                `Show ${item.title} exists in Sonarr instance ${instanceId} but not in junction table, updating database`,
              )
              await this.dbService.addWatchlistToSonarrInstance(
                numericId,
                instanceId,
                'pending',
                currentInstanceIds.length === 0,
              )
              continue
            }

            // Find a matching series in other instances that we can copy
            const matchingSeries = this.findMatch(allExistingSeries, item.guids)
            if (matchingSeries) {
              itemsToCopy.push({
                item,
                matchingSeries,
              })
            } else {
              this.log.debug(
                `No matching series found for ${item.title} to copy to instance ${instanceId}`,
              )
            }
          }
        } catch (itemError) {
          this.log.error(
            {
              error:
                itemError instanceof Error
                  ? itemError
                  : new Error(String(itemError)),
              title: item.title,
            },
            'Error processing show during analysis',
          )
        }
      }

      let itemsCopied = 0

      if (itemsToCopy.length > 0) {
        if (emitProgress) {
          this.emitProgress({
            operationId,
            type: 'sync' as const,
            phase: 'copying',
            progress: 5,
            message: `Starting to process ${itemsToCopy.length} shows for Sonarr instance ${instanceId}`,
          })
        }

        // Pre-fetch users to avoid N+1 queries
        const userIds = new Set(itemsToCopy.map(({ item }) => item.user_id))
        const allUsers = await this.dbService.getAllUsers()
        const userMap = new Map<number, User>(
          allUsers.filter((u) => userIds.has(u.id)).map((u) => [u.id, u]),
        )

        // Build batch items with proper types
        const batchItems: BatchCopyItem[] = itemsToCopy.map(
          ({ item, matchingSeries }) => ({
            item: {
              ...item,
              id:
                typeof item.id === 'string'
                  ? Number.parseInt(item.id, 10)
                  : (item.id as number),
            },
            matchingContent: matchingSeries,
          }),
        )

        // Use p-limit batch processor instead of setTimeout polling
        itemsCopied = await processBatchCopy(
          { contentRouter: this.fastify.contentRouter, logger: this.log },
          batchItems,
          instanceId,
          'show',
          userMap,
          emitProgress
            ? (completed, total) => {
                const progress = Math.min(
                  5 + Math.floor((completed / total) * 90),
                  95,
                )
                this.emitProgress({
                  operationId,
                  type: 'sync' as const,
                  phase: 'copying',
                  progress,
                  message: `Copied ${completed} of ${total} shows to Sonarr instance ${instanceId}`,
                })
              }
            : undefined,
        )

        if (emitProgress) {
          this.emitProgress({
            operationId,
            type: 'sync' as const,
            phase: 'complete',
            progress: 100,
            message: `Completed sync for Sonarr instance ${instanceId}, copied ${itemsCopied} items`,
          })
        }
      } else {
        if (emitProgress) {
          this.emitProgress({
            operationId,
            type: 'sync' as const,
            phase: 'complete',
            progress: 100,
            message: `No items needed to be copied to Sonarr instance ${instanceId}`,
          })
        }
      }

      this.log.info(
        `Completed sync for Sonarr instance ${instanceId}, copied ${itemsCopied} items`,
      )
      return itemsCopied
    } catch (error) {
      this.log.error({ error, instanceId }, 'Error syncing Sonarr instance')
      throw error
    }
  }

  async syncAllConfiguredInstances(): Promise<{
    radarr: Array<{ id: number; name: string; itemsCopied: number }>
    sonarr: Array<{ id: number; name: string; itemsCopied: number }>
  }> {
    const operationId = `all-instances-sync-${Date.now()}`
    const emitProgress = this.hasActiveProgressConnections()

    if (emitProgress) {
      this.emitProgress({
        operationId,
        type: 'sync' as const,
        phase: 'start',
        progress: 0,
        message: 'Initializing sync for all non-default instances...',
      })
    }

    try {
      this.log.info('Fetching all Radarr instances')
      const radarrInstances = await this.dbService.getAllRadarrInstances()
      const radarrToSync = radarrInstances.filter(
        (instance) => !instance.isDefault,
      )

      this.log.info('Fetching all Sonarr instances')
      const sonarrInstances = await this.dbService.getAllSonarrInstances()
      const sonarrToSync = sonarrInstances.filter(
        (instance) => !instance.isDefault,
      )

      const totalInstances = radarrToSync.length + sonarrToSync.length

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sync' as const,
          phase: 'processing',
          progress: 5,
          message: `Found ${totalInstances} instances to sync (${radarrToSync.length} Radarr, ${sonarrToSync.length} Sonarr)`,
        })
      }

      let instancesProcessed = 0
      const radarrResults: Array<{
        id: number
        name: string
        itemsCopied: number
      }> = []
      const sonarrResults: Array<{
        id: number
        name: string
        itemsCopied: number
      }> = []

      const BATCH_SIZE = 3 // Process 3 instances at a time

      for (let i = 0; i < radarrToSync.length; i += BATCH_SIZE) {
        const batch = radarrToSync.slice(i, i + BATCH_SIZE)

        if (emitProgress) {
          this.emitProgress({
            operationId,
            type: 'sync' as const,
            phase: 'processing',
            progress:
              5 + Math.floor((instancesProcessed / totalInstances) * 90),
            message: `Processing Radarr instances ${i + 1} to ${Math.min(i + batch.length, radarrToSync.length)} of ${radarrToSync.length}`,
          })
        }

        const batchResults = await Promise.all(
          batch.map(async (instance) => {
            try {
              this.log.info(
                `Syncing Radarr instance ${instance.id} (${instance.name})`,
              )
              const itemsCopied = await this.syncRadarrInstance(instance.id)
              return {
                id: instance.id,
                name: instance.name,
                itemsCopied,
              }
            } catch (error) {
              this.log.error(
                { error },
                `Error syncing Radarr instance ${instance.id} (${instance.name}):`,
              )
              return {
                id: instance.id,
                name: instance.name,
                itemsCopied: 0,
                error: String(error),
              }
            }
          }),
        )

        radarrResults.push(...batchResults)
        instancesProcessed += batch.length
      }

      for (let i = 0; i < sonarrToSync.length; i += BATCH_SIZE) {
        const batch = sonarrToSync.slice(i, i + BATCH_SIZE)

        if (emitProgress) {
          this.emitProgress({
            operationId,
            type: 'sync' as const,
            phase: 'processing',
            progress:
              5 + Math.floor((instancesProcessed / totalInstances) * 90),
            message: `Processing Sonarr instances ${i + 1} to ${Math.min(i + batch.length, sonarrToSync.length)} of ${sonarrToSync.length}`,
          })
        }

        const batchResults = await Promise.all(
          batch.map(async (instance) => {
            try {
              this.log.info(
                `Syncing Sonarr instance ${instance.id} (${instance.name})`,
              )
              const itemsCopied = await this.syncSonarrInstance(instance.id)
              return {
                id: instance.id,
                name: instance.name,
                itemsCopied,
              }
            } catch (error) {
              this.log.error(
                { error },
                `Error syncing Sonarr instance ${instance.id} (${instance.name}):`,
              )
              return {
                id: instance.id,
                name: instance.name,
                itemsCopied: 0,
                error: String(error),
              }
            }
          }),
        )

        sonarrResults.push(...batchResults)
        instancesProcessed += batch.length
      }

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sync' as const,
          phase: 'complete',
          progress: 100,
          message: `Completed sync for all ${totalInstances} instances`,
        })
      }

      const totalRadarrItems = radarrResults.reduce(
        (sum, result) => sum + result.itemsCopied,
        0,
      )
      const totalSonarrItems = sonarrResults.reduce(
        (sum, result) => sum + result.itemsCopied,
        0,
      )

      this.log.info(
        {
          radarr: `${radarrResults.length} instances, ${totalRadarrItems} items copied`,
          sonarr: `${sonarrResults.length} instances, ${totalSonarrItems} items copied`,
        },
        'Completed sync for all configured instances',
      )

      return {
        radarr: radarrResults,
        sonarr: sonarrResults,
      }
    } catch (error) {
      this.log.error({ error }, 'Error syncing all configured instances:')

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sync' as const,
          phase: 'error',
          progress: 100,
          message: `Error syncing instances: ${error}`,
        })
      }

      throw error
    }
  }
}
