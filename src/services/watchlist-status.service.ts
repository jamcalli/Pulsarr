import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  Item as SonarrItem,
  SonarrInstance,
} from '@root/types/sonarr.types.js'
import type {
  Item as RadarrItem,
  RadarrInstance,
} from '@root/types/radarr.types.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'

export class StatusService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly dbService: FastifyInstance['db'],
    private readonly sonarrManager: FastifyInstance['sonarrManager'],
    private readonly radarrManager: FastifyInstance['radarrManager'],
    private readonly fastify: FastifyInstance,
  ) {}

  async syncAllStatuses(): Promise<{ shows: number; movies: number }> {
    const [showUpdates, movieUpdates] = await Promise.all([
      this.syncSonarrStatuses(),
      this.syncRadarrStatuses(),
    ])
    return { shows: showUpdates, movies: movieUpdates }
  }

  async syncSonarrStatuses(): Promise<number> {
    try {
      // Pass true to bypass exclusions (dont include the exclusions in watchlist status)
      const existingSeries = await this.sonarrManager.fetchAllSeries(true)
      const watchlistItems = await this.dbService.getAllShowWatchlistItems()
      const dbWatchlistItems = this.convertToDbWatchlistItems(watchlistItems)
      const mainUpdates = this.processShowStatusUpdates(
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
      return updateCount
    } catch (error) {
      this.log.error('Error syncing Sonarr statuses:', error)
      throw error
    }
  }

  async syncRadarrStatuses(): Promise<number> {
    try {
      // Pass true to bypass exclusions (dont include the exclusions in watchlist status)
      const existingMovies = await this.radarrManager.fetchAllMovies(true)
      const watchlistItems = await this.dbService.getAllMovieWatchlistItems()
      const dbWatchlistItems = this.convertToDbWatchlistItems(watchlistItems)
      const mainUpdates = this.processMovieStatusUpdates(
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
      return updateCount
    } catch (error) {
      this.log.error('Error syncing Radarr statuses:', error)
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

  private processShowStatusUpdates(
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
            this.log.debug(
              `Preventing status downgrade for show ${item.title} [${item.key}]: keeping 'notified' instead of changing to '${sonarrMatch.status}'`,
            )
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

  private processMovieStatusUpdates(
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
            this.log.debug(
              `Preventing status downgrade for movie ${item.title} [${item.key}]: keeping 'notified' instead of changing to '${radarrMatch.status}'`,
            )
          }
        }
        if (item.movie_status !== radarrMatch.movie_status) {
          update.movie_status = radarrMatch.movie_status as
            | 'available'
            | 'unavailable'
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
  private async processShowJunctionUpdates(
    sonarrItems: SonarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
  ): Promise<number> {
    let updateCount = 0

    // Group items by Sonarr instance
    const instanceItemMap = new Map<number, SonarrItem[]>()

    for (const series of sonarrItems) {
      if (!series.sonarr_instance_id) continue

      if (!instanceItemMap.has(series.sonarr_instance_id)) {
        instanceItemMap.set(series.sonarr_instance_id, [])
      }

      instanceItemMap.get(series.sonarr_instance_id)?.push(series)
    }

    // Process each watchlist item
    for (const item of watchlistItems) {
      try {
        if (item.id === undefined) {
          this.log.debug(`Skipping show ${item.title} with undefined ID`)
          continue
        }

        // Find instances where this show exists
        const existingInstances: number[] = []

        for (const [instanceId, instanceItems] of instanceItemMap.entries()) {
          const matchingSeries = instanceItems.filter((series) =>
            this.isGuidMatch(series.guids, item.guids),
          )

          if (matchingSeries.length > 0) {
            existingInstances.push(instanceId)

            // Check if junction table needs to be updated
            const currentInstanceIds =
              await this.dbService.getWatchlistSonarrInstanceIds(item.id)

            // Add to junction table if not already there
            if (!currentInstanceIds.includes(instanceId)) {
              await this.dbService.addWatchlistToSonarrInstance(
                item.id,
                instanceId,
                matchingSeries[0].status || 'pending',
                currentInstanceIds.length === 0,
              )
              updateCount++
              this.log.debug(
                `Added show ${item.title} to Sonarr instance ${instanceId} in junction table`,
              )
            } else {
              // Update status if needed
              const currentStatus =
                await this.dbService.getWatchlistSonarrInstanceStatus(
                  item.id,
                  instanceId,
                )

              if (
                currentStatus &&
                currentStatus.status !== matchingSeries[0].status &&
                !(
                  currentStatus.status === 'notified' &&
                  matchingSeries[0].status !== 'notified'
                )
              ) {
                await this.dbService.updateWatchlistSonarrInstanceStatus(
                  item.id,
                  instanceId,
                  matchingSeries[0].status || 'pending',
                  currentStatus.status === 'notified'
                    ? currentStatus.last_notified_at
                    : null,
                )
                updateCount++
                this.log.debug(
                  `Updated show ${item.title} status in Sonarr instance ${instanceId} junction table`,
                )
              }
            }
          }
        }

        // Get all instances this item is currently associated with
        if (item.id !== undefined) {
          const numericId =
            typeof item.id === 'string' ? Number(item.id) : item.id
          const currentInstanceIds =
            await this.dbService.getWatchlistSonarrInstanceIds(numericId)

          // Clean up instances where the show no longer exists
          for (const instanceId of currentInstanceIds) {
            if (!existingInstances.includes(instanceId)) {
              await this.dbService.removeWatchlistFromSonarrInstance(
                numericId,
                instanceId,
              )
              updateCount++
              this.log.debug(
                `Removed show ${item.title} from Sonarr instance ${instanceId} in junction table (no longer exists there)`,
              )
            }
          }
        }

        // Ensure a primary instance is set if there are any instances
        if (existingInstances.length > 0 && item.id !== undefined) {
          const numericId =
            typeof item.id === 'string' ? Number(item.id) : item.id
          const currentInstanceStatuses = await Promise.all(
            existingInstances.map((id) =>
              this.dbService.getWatchlistSonarrInstanceStatus(numericId, id),
            ),
          )

          const hasPrimary = currentInstanceStatuses.some(
            (status) => status?.is_primary,
          )

          if (!hasPrimary && existingInstances.length > 0) {
            await this.dbService.setPrimarySonarrInstance(
              numericId,
              existingInstances[0],
            )
            updateCount++
            this.log.debug(
              `Set Sonarr instance ${existingInstances[0]} as primary for show ${item.title}`,
            )
          }
        }
      } catch (error) {
        this.log.error(
          `Error processing junction updates for show ${item.title}:`,
          error,
        )
      }
    }

    return updateCount
  }

  // Junction table updates for Radarr
  private async processMovieJunctionUpdates(
    radarrItems: RadarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
  ): Promise<number> {
    let updateCount = 0

    // Group items by Radarr instance
    const instanceItemMap = new Map<number, RadarrItem[]>()

    for (const movie of radarrItems) {
      if (!movie.radarr_instance_id) continue

      if (!instanceItemMap.has(movie.radarr_instance_id)) {
        instanceItemMap.set(movie.radarr_instance_id, [])
      }

      instanceItemMap.get(movie.radarr_instance_id)?.push(movie)
    }

    // Process each watchlist item
    for (const item of watchlistItems) {
      try {
        if (item.id === undefined) {
          this.log.debug(`Skipping movie ${item.title} with undefined ID`)
          continue
        }

        // Find instances where this movie exists
        const existingInstances: number[] = []

        for (const [instanceId, instanceItems] of instanceItemMap.entries()) {
          const matchingMovies = instanceItems.filter((movie) =>
            this.isGuidMatch(movie.guids, item.guids),
          )

          if (matchingMovies.length > 0) {
            existingInstances.push(instanceId)

            // Check if junction table needs to be updated
            const currentInstanceIds =
              await this.dbService.getWatchlistRadarrInstanceIds(item.id)

            // Add to junction table if not already there
            if (!currentInstanceIds.includes(instanceId)) {
              await this.dbService.addWatchlistToRadarrInstance(
                item.id,
                instanceId,
                matchingMovies[0].status || 'pending',
                currentInstanceIds.length === 0,
              )
              updateCount++
              this.log.debug(
                `Added movie ${item.title} to Radarr instance ${instanceId} in junction table`,
              )
            } else {
              // Update status if needed
              const currentStatus =
                await this.dbService.getWatchlistRadarrInstanceStatus(
                  item.id,
                  instanceId,
                )

              if (
                currentStatus &&
                currentStatus.status !== matchingMovies[0].status &&
                !(
                  currentStatus.status === 'notified' &&
                  matchingMovies[0].status !== 'notified'
                )
              ) {
                await this.dbService.updateWatchlistRadarrInstanceStatus(
                  item.id,
                  instanceId,
                  matchingMovies[0].status || 'pending',
                  currentStatus.status === 'notified'
                    ? currentStatus.last_notified_at
                    : null,
                )
                updateCount++
                this.log.debug(
                  `Updated movie ${item.title} status in Radarr instance ${instanceId} junction table`,
                )
              }
            }
          }
        }

        // Get all instances this item is currently associated with
        if (item.id !== undefined) {
          const numericId =
            typeof item.id === 'string' ? Number(item.id) : item.id
          const currentInstanceIds =
            await this.dbService.getWatchlistRadarrInstanceIds(numericId)

          // Clean up instances where the movie no longer exists
          for (const instanceId of currentInstanceIds) {
            if (!existingInstances.includes(instanceId)) {
              await this.dbService.removeWatchlistFromRadarrInstance(
                numericId,
                instanceId,
              )
              updateCount++
              this.log.debug(
                `Removed movie ${item.title} from Radarr instance ${instanceId} in junction table (no longer exists there)`,
              )
            }
          }
        }

        // Ensure a primary instance is set if there are any instances
        if (existingInstances.length > 0 && item.id !== undefined) {
          const numericId =
            typeof item.id === 'string' ? Number(item.id) : item.id
          const currentInstanceStatuses = await Promise.all(
            existingInstances.map((id) =>
              this.dbService.getWatchlistRadarrInstanceStatus(numericId, id),
            ),
          )

          const hasPrimary = currentInstanceStatuses.some(
            (status) => status?.is_primary,
          )

          if (!hasPrimary && existingInstances.length > 0) {
            await this.dbService.setPrimaryRadarrInstance(
              numericId,
              existingInstances[0],
            )
            updateCount++
            this.log.debug(
              `Set Radarr instance ${existingInstances[0]} as primary for movie ${item.title}`,
            )
          }
        }
      } catch (error) {
        this.log.error(
          `Error processing junction updates for movie ${item.title}:`,
          error,
        )
      }
    }

    return updateCount
  }

  private findMatch<T extends SonarrItem | RadarrItem>(
    items: T[],
    itemGuids: string[] | string | undefined,
  ): T | undefined {
    if (!itemGuids) return undefined
    const guids = Array.isArray(itemGuids)
      ? itemGuids
      : typeof itemGuids === 'string'
        ? JSON.parse(itemGuids)
        : []
    return items.find((item) =>
      item.guids.some((itemGuid) => guids.includes(itemGuid)),
    )
  }

  private isGuidMatch(
    itemGuids1: string[] | string | undefined,
    itemGuids2: string[] | string | undefined,
  ): boolean {
    if (!itemGuids1 || !itemGuids2) return false
    const guids1 = Array.isArray(itemGuids1)
      ? itemGuids1
      : typeof itemGuids1 === 'string'
        ? JSON.parse(itemGuids1)
        : []
    const guids2 = Array.isArray(itemGuids2)
      ? itemGuids2
      : typeof itemGuids2 === 'string'
        ? JSON.parse(itemGuids2)
        : []
    return guids1.some((guid: string) => guids2.includes(guid))
  }

  private parseGenres(genres: string[] | string | undefined): string[] {
    if (!genres) return []
    if (Array.isArray(genres)) return genres
    try {
      return JSON.parse(genres)
    } catch {
      return typeof genres === 'string' ? [genres] : []
    }
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
        `Error in syncInstance for ${instanceType} ${instanceId}:`,
        error,
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
        const guids = Array.isArray(item.guids)
          ? item.guids
          : typeof item.guids === 'string'
            ? JSON.parse(item.guids || '[]')
            : []
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
        const guids = Array.isArray(movie.guids)
          ? movie.guids
          : typeof movie.guids === 'string'
            ? JSON.parse(movie.guids || '[]')
            : []
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
                ? JSON.parse(instance.syncedInstances || '[]')
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
            const itemGuids = Array.isArray(item.guids)
              ? item.guids
              : typeof item.guids === 'string'
                ? JSON.parse(item.guids || '[]')
                : []

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
            `Error processing movie ${item.title} during analysis: ${itemError}`,
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

        const BATCH_SIZE = 5 // Number of items to process in parallel
        let completedCount = 0

        const queue = [...itemsToCopy]
        let processingCount = 0

        while (queue.length > 0 || processingCount > 0) {
          while (queue.length > 0 && processingCount < BATCH_SIZE) {
            const queueItem = queue.shift()
            if (queueItem) {
              processingCount++
              const { item, matchingMovie } = queueItem

              const dbItem: DatabaseWatchlistItem = {
                ...item,
                id:
                  typeof item.id === 'string'
                    ? Number.parseInt(item.id, 10)
                    : (item.id as number),
              }

              this.processSingleRadarrItem(
                dbItem as DatabaseWatchlistItem,
                matchingMovie,
                instanceId,
              )
                .then((success) => {
                  if (success) {
                    itemsCopied++
                  }
                  processingCount--
                  completedCount++

                  if (emitProgress) {
                    const progress = Math.min(
                      5 +
                        Math.floor((completedCount / itemsToCopy.length) * 90),
                      95,
                    )
                    this.emitProgress({
                      operationId,
                      type: 'sync' as const,
                      phase: 'copying',
                      progress,
                      message: `Copied ${completedCount} of ${itemsToCopy.length} movies to Radarr instance ${instanceId}`,
                    })
                  }
                })
                .catch((error) => {
                  this.log.error(`Error in batch processing movie: ${error}`)
                  processingCount--
                  completedCount++
                })
            }
          }

          if (
            processingCount >= BATCH_SIZE ||
            (processingCount > 0 && queue.length === 0)
          ) {
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
        }

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
      this.log.error(`Error syncing Radarr instance ${instanceId}: ${error}`)
      throw error
    }
  }

  private async processSingleRadarrItem(
    item: DatabaseWatchlistItem,
    matchingMovie: RadarrItem,
    instanceId: number,
  ): Promise<boolean> {
    try {
      // Get user information
      const userId =
        typeof item.user_id === 'number' ? item.user_id : Number(item.user_id)

      // First check if the user exists and can sync
      let userName: string | undefined
      let canSync = true

      if (!Number.isNaN(userId)) {
        const user = await this.dbService.getUser(userId)
        if (user) {
          userName = user.name
          canSync = user.can_sync !== false
        }
      }

      // If user cannot sync, don't route the item
      if (!canSync) {
        this.log.debug(
          `Skipping movie ${item.title} sync as user ${userId} has sync disabled`,
        )
        return false
      }

      // Use the content router with syncTargetInstanceId instead of forcedInstanceId
      // to respect routing rules during sync operations
      const routingResult = await this.fastify.contentRouter.routeContent(
        matchingMovie,
        item.key,
        {
          userId,
          userName,
          syncing: true,
          syncTargetInstanceId: instanceId, // Use sync target instead of forced instance
        },
      )

      // Check if the item was routed to the target instance
      if (routingResult.routedInstances.includes(instanceId)) {
        this.log.debug(
          `Copied movie ${item.title} to Radarr instance ${instanceId} via content router`,
        )
        return true
      }

      this.log.info(
        `Movie ${item.title} was not routed to Radarr instance ${instanceId} due to routing rules`,
      )
      return false
    } catch (error) {
      this.log.error(
        `Error copying movie ${item.title} to instance ${instanceId}: ${error}`,
      )
      return false
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
        const guids = Array.isArray(item.guids)
          ? item.guids
          : typeof item.guids === 'string'
            ? JSON.parse(item.guids || '[]')
            : []
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
        const guids = Array.isArray(series.guids)
          ? series.guids
          : typeof series.guids === 'string'
            ? JSON.parse(series.guids || '[]')
            : []
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
                ? JSON.parse(instance.syncedInstances || '[]')
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
            const itemGuids = Array.isArray(item.guids)
              ? item.guids
              : typeof item.guids === 'string'
                ? JSON.parse(item.guids || '[]')
                : []

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
            `Error processing show ${item.title} during analysis: ${itemError}`,
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

        const BATCH_SIZE = 5 // Number of items to process in parallel
        let completedCount = 0

        const queue = [...itemsToCopy]
        let processingCount = 0

        while (queue.length > 0 || processingCount > 0) {
          while (queue.length > 0 && processingCount < BATCH_SIZE) {
            const queueItem = queue.shift()
            if (queueItem) {
              processingCount++
              const { item, matchingSeries } = queueItem

              const dbItem: DatabaseWatchlistItem = {
                ...item,
                id:
                  typeof item.id === 'string'
                    ? Number.parseInt(item.id, 10)
                    : (item.id as number),
              }

              this.processSingleSonarrItem(
                dbItem as DatabaseWatchlistItem,
                matchingSeries,
                instanceId,
              )
                .then((success) => {
                  if (success) {
                    itemsCopied++
                  }
                  processingCount--
                  completedCount++

                  if (emitProgress) {
                    const progress = Math.min(
                      5 +
                        Math.floor((completedCount / itemsToCopy.length) * 90),
                      95,
                    )
                    this.emitProgress({
                      operationId,
                      type: 'sync' as const,
                      phase: 'copying',
                      progress,
                      message: `Copied ${completedCount} of ${itemsToCopy.length} shows to Sonarr instance ${instanceId}`,
                    })
                  }
                })
                .catch((error) => {
                  this.log.error(`Error in batch processing show: ${error}`)
                  processingCount--
                  completedCount++
                })
            }
          }

          if (
            processingCount >= BATCH_SIZE ||
            (processingCount > 0 && queue.length === 0)
          ) {
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
        }

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
      this.log.error(`Error syncing Sonarr instance ${instanceId}: ${error}`)
      throw error
    }
  }

  private async processSingleSonarrItem(
    item: DatabaseWatchlistItem,
    matchingSeries: SonarrItem,
    instanceId: number,
  ): Promise<boolean> {
    try {
      // Get user information if available
      const userId =
        typeof item.user_id === 'number' ? item.user_id : Number(item.user_id)

      // First check if the user exists and can sync
      let userName: string | undefined
      let canSync = true

      if (!Number.isNaN(userId)) {
        const user = await this.dbService.getUser(userId)
        if (user) {
          userName = user.name
          canSync = user.can_sync !== false
        }
      }

      // If user cannot sync, don't route the item
      if (!canSync) {
        this.log.debug(
          `Skipping show ${item.title} sync as user ${userId} has sync disabled`,
        )
        return false
      }

      // Use the content router with syncTargetInstanceId instead of forcedInstanceId
      // to respect routing rules during sync operations
      const routingResult = await this.fastify.contentRouter.routeContent(
        matchingSeries,
        item.key,
        {
          userId,
          userName,
          syncing: true,
          syncTargetInstanceId: instanceId, // Use sync target instead of forced instance
        },
      )

      // Check if the item was routed to the target instance
      if (routingResult.routedInstances.includes(instanceId)) {
        this.log.debug(
          `Copied show ${item.title} to Sonarr instance ${instanceId} via content router`,
        )
        return true
      }

      this.log.info(
        `Show ${item.title} was not routed to Sonarr instance ${instanceId} due to routing rules`,
      )
      return false
    } catch (error) {
      this.log.error(
        `Error copying show ${item.title} to instance ${instanceId}: ${error}`,
      )
      return false
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
                `Error syncing Radarr instance ${instance.id} (${instance.name}):`,
                error,
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
                `Error syncing Sonarr instance ${instance.id} (${instance.name}):`,
                error,
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

      this.log.info('Sync completed for all instances. Results:', {
        radarr: `${radarrResults.length} instances, ${totalRadarrItems} items copied`,
        sonarr: `${sonarrResults.length} instances, ${totalSonarrItems} items copied`,
      })

      return {
        radarr: radarrResults,
        sonarr: sonarrResults,
      }
    } catch (error) {
      this.log.error('Error syncing all configured instances:', error)

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
