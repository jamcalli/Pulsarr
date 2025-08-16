import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type {
  DatabaseWatchlistItem,
  WatchlistInstanceStatus,
} from '@root/types/watchlist-status.types.js'
import { getGuidMatchScore, parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

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
          // Create user tags first
          await this.fastify.userTags.createSonarrUserTags()

          // Apply tags using already fetched data
          const tagResults =
            await this.fastify.userTags.tagSonarrContentWithData(
              existingSeries,
              watchlistItems,
            )

          this.log.info('Applied user tags to Sonarr content', tagResults)
        } catch (tagError) {
          this.log.error(
            'Error applying user tags to Sonarr content:',
            tagError,
          )
        }
      }

      return updateCount
    } catch (error) {
      this.log.error({ error }, 'Error syncing Sonarr statuses:')
      throw error
    }
  }

  async syncRadarrStatuses(): Promise<number> {
    try {
      // Pass true to bypass exclusions (dont include the exclusions in watchlist status)
      const existingMovies = await this.radarrManager.fetchAllMovies(true)
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
          // Create user tags first
          await this.fastify.userTags.createRadarrUserTags()

          // Apply tags using already fetched data
          const tagResults =
            await this.fastify.userTags.tagRadarrContentWithData(
              existingMovies,
              watchlistItems,
            )

          this.log.info('Applied user tags to Radarr content', tagResults)
        } catch (tagError) {
          this.log.error(
            'Error applying user tags to Radarr content:',
            tagError,
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
              this.log.debug(
                `Backfilling missing 'grabbed' status for notified show ${item.title} [${item.key}]`,
              )
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
                  `Failed to backfill grabbed status for ${item.title}:`,
                  error,
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
              this.log.debug(
                `Backfilling missing 'grabbed' status for notified movie ${item.title} [${item.key}]`,
              )
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
                  `Failed to backfill grabbed status for ${item.title}:`,
                  error,
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
  async processShowJunctionUpdates(
    sonarrItems: SonarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
  ): Promise<number> {
    let updateCount = 0

    try {
      // 1. Extract all watchlist IDs we need to process
      const watchlistIds = watchlistItems
        .filter(
          (item): item is DatabaseWatchlistItem & { id: string | number } =>
            item.id !== undefined,
        )
        .map((item) =>
          typeof item.id === 'string' ? Number(item.id) : (item.id as number),
        )

      if (watchlistIds.length === 0) return 0

      // 2. Prefetch ALL current junction associations in a single query
      const allJunctionEntries =
        await this.dbService.getAllWatchlistSonarrInstanceJunctions(
          watchlistIds,
        )

      // 3. Create lookup maps for efficient access
      const junctionMap = new Map<string, WatchlistInstanceStatus>()
      for (const entry of allJunctionEntries) {
        const key = `${entry.watchlist_id}-${entry.sonarr_instance_id}`
        junctionMap.set(key, {
          status: this.validateStatus(entry.status),
          is_primary: entry.is_primary,
          last_notified_at: entry.last_notified_at,
        })
      }

      // 4. Group Sonarr items by instance
      const instanceItemMap = new Map<number, SonarrItem[]>()
      for (const series of sonarrItems) {
        if (series.sonarr_instance_id) {
          if (!instanceItemMap.has(series.sonarr_instance_id)) {
            instanceItemMap.set(series.sonarr_instance_id, [])
          }
          instanceItemMap.get(series.sonarr_instance_id)?.push(series)
        }
      }

      // 5. Prepare batch operation collections
      const junctionsToAdd: Array<{
        watchlist_id: number
        sonarr_instance_id: number
        status: 'pending' | 'requested' | 'grabbed' | 'notified'
        is_primary: boolean
        last_notified_at?: string
      }> = []

      const junctionsToUpdate: Array<{
        watchlist_id: number
        sonarr_instance_id: number
        status?: 'pending' | 'requested' | 'grabbed' | 'notified'
        is_primary?: boolean
        last_notified_at?: string
      }> = []

      const junctionsToRemove: Array<{
        watchlist_id: number
        sonarr_instance_id: number
      }> = []

      // 6. Process each watchlist item (similar logic but without database round-trips)
      for (const item of watchlistItems) {
        if (item.id === undefined) continue

        const numericId =
          typeof item.id === 'string' ? Number(item.id) : item.id
        const mainTableStatus = item.status

        // Find which instances this show should exist in
        const existingInstances: number[] = []
        const currentInstanceMap = new Map<number, boolean>()

        // Build a map of current instance associations
        for (const entry of allJunctionEntries.filter(
          (entry) => entry.watchlist_id === numericId,
        )) {
          currentInstanceMap.set(entry.sonarr_instance_id, true)
        }

        // Process each Sonarr instance
        for (const [instanceId, instanceItems] of instanceItemMap.entries()) {
          // Use weighting system to find best matches (prioritize higher GUID match counts)
          const potentialMatches = instanceItems
            .map((series) => ({
              series,
              score: getGuidMatchScore(
                parseGuids(series.guids),
                parseGuids(item.guids),
              ),
            }))
            .filter((match) => match.score > 0)
            .sort((a, b) => b.score - a.score)

          if (potentialMatches.length > 0) {
            const matchingSeries = potentialMatches.map((match) => match.series)
            existingInstances.push(instanceId)
            const junctionKey = `${numericId}-${instanceId}`
            const currentJunction = junctionMap.get(junctionKey)

            // Add to junction if not exists
            if (!currentJunction) {
              junctionsToAdd.push({
                watchlist_id: numericId,
                sonarr_instance_id: instanceId,
                status:
                  mainTableStatus === 'notified'
                    ? 'notified'
                    : matchingSeries[0].status || 'pending',
                is_primary: !currentInstanceMap.size,
              })
              updateCount++
            } else {
              // Update junction if needed
              const updates: {
                watchlist_id: number
                sonarr_instance_id: number
                status?: 'pending' | 'requested' | 'grabbed' | 'notified'
                is_primary?: boolean
                last_notified_at?: string
              } = {
                watchlist_id: numericId,
                sonarr_instance_id: instanceId,
              }

              let needsUpdate = false

              // Status update logic
              if (
                mainTableStatus === 'notified' &&
                currentJunction.status !== 'notified'
              ) {
                updates.status = 'notified'
                updates.last_notified_at =
                  currentJunction.last_notified_at || undefined
                needsUpdate = true
              } else if (
                (!currentJunction.status && matchingSeries[0].status) ||
                (currentJunction.status &&
                  currentJunction.status !== matchingSeries[0].status &&
                  !(
                    currentJunction.status === 'notified' &&
                    matchingSeries[0].status !== 'notified'
                  ))
              ) {
                updates.status = this.validateStatus(matchingSeries[0].status)
                if (currentJunction.status === 'notified') {
                  updates.last_notified_at =
                    currentJunction.last_notified_at || undefined
                }
                needsUpdate = true
              }

              if (needsUpdate) {
                junctionsToUpdate.push(updates)
                updateCount++
              }
            }
          }
        }

        // Clean up instances where the show no longer exists
        currentInstanceMap.forEach((_, instanceId) => {
          if (!existingInstances.includes(instanceId)) {
            junctionsToRemove.push({
              watchlist_id: numericId,
              sonarr_instance_id: instanceId,
            })
            updateCount++
          }
        })

        // Ensure primary instance is set correctly
        if (existingInstances.length > 0) {
          const hasPrimary = allJunctionEntries
            .filter(
              (entry) =>
                entry.watchlist_id === numericId &&
                existingInstances.includes(entry.sonarr_instance_id),
            )
            .some((entry) => entry.is_primary)

          if (!hasPrimary) {
            junctionsToUpdate.push({
              watchlist_id: numericId,
              sonarr_instance_id: existingInstances[0],
              status: 'pending',
              is_primary: true,
            })
            updateCount++
          }
        }
      }

      // 7. Execute all batch operations
      if (junctionsToAdd.length > 0) {
        await this.dbService.bulkAddWatchlistToSonarrInstances(junctionsToAdd)
        this.log.debug(
          `Added ${junctionsToAdd.length} Sonarr junction records in bulk`,
        )
      }

      if (junctionsToUpdate.length > 0) {
        await this.dbService.bulkUpdateWatchlistSonarrInstanceStatuses(
          junctionsToUpdate,
        )
        this.log.debug(
          `Updated ${junctionsToUpdate.length} Sonarr junction records in bulk`,
        )
      }

      if (junctionsToRemove.length > 0) {
        await this.dbService.bulkRemoveWatchlistFromSonarrInstances(
          junctionsToRemove,
        )
        this.log.debug(
          `Removed ${junctionsToRemove.length} Sonarr junction records in bulk`,
        )
      }

      return updateCount
    } catch (error) {
      this.log.error(
        { error },
        'Error in bulk processing show junction updates:',
      )
      throw error
    }
  }

  // junction table updates for Radarr
  async processMovieJunctionUpdates(
    radarrItems: RadarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
  ): Promise<number> {
    let updateCount = 0

    try {
      // 1. Extract all watchlist IDs we need to process
      const watchlistIds = watchlistItems
        .filter(
          (item): item is DatabaseWatchlistItem & { id: string | number } =>
            item.id !== undefined,
        )
        .map((item) =>
          typeof item.id === 'string' ? Number(item.id) : (item.id as number),
        )

      if (watchlistIds.length === 0) return 0

      // 2. Prefetch ALL current junction associations in a single query
      const allJunctionEntries =
        await this.dbService.getAllWatchlistRadarrInstanceJunctions(
          watchlistIds,
        )

      // 3. Create lookup maps for efficient access
      const junctionMap = new Map<string, WatchlistInstanceStatus>()
      for (const entry of allJunctionEntries) {
        const key = `${entry.watchlist_id}-${entry.radarr_instance_id}`
        junctionMap.set(key, {
          status: this.validateStatus(entry.status),
          is_primary: entry.is_primary,
          last_notified_at: entry.last_notified_at,
        })
      }

      // 4. Group Radarr items by instance
      const instanceItemMap = new Map<number, RadarrItem[]>()
      for (const movie of radarrItems) {
        if (movie.radarr_instance_id) {
          if (!instanceItemMap.has(movie.radarr_instance_id)) {
            instanceItemMap.set(movie.radarr_instance_id, [])
          }
          instanceItemMap.get(movie.radarr_instance_id)?.push(movie)
        }
      }

      // 5. Prepare batch operation collections
      const junctionsToAdd: Array<{
        watchlist_id: number
        radarr_instance_id: number
        status: 'pending' | 'requested' | 'grabbed' | 'notified'
        is_primary: boolean
        last_notified_at?: string
      }> = []

      const junctionsToUpdate: Array<{
        watchlist_id: number
        radarr_instance_id: number
        status?: 'pending' | 'requested' | 'grabbed' | 'notified'
        is_primary?: boolean
        last_notified_at?: string
      }> = []

      const junctionsToRemove: Array<{
        watchlist_id: number
        radarr_instance_id: number
      }> = []

      // 6. Process each watchlist item (similar logic but without database round-trips)
      for (const item of watchlistItems) {
        if (item.id === undefined) continue

        const numericId =
          typeof item.id === 'string' ? Number(item.id) : item.id
        const mainTableStatus = item.status

        // Find which instances this movie should exist in
        const existingInstances: number[] = []
        const currentInstanceMap = new Map<number, boolean>()

        // Build a map of current instance associations
        for (const entry of allJunctionEntries.filter(
          (entry) => entry.watchlist_id === numericId,
        )) {
          currentInstanceMap.set(entry.radarr_instance_id, true)
        }

        // Process each Radarr instance
        for (const [instanceId, instanceItems] of instanceItemMap.entries()) {
          // Use weighting system to find best matches (prioritize higher GUID match counts)
          const potentialMatches = instanceItems
            .map((movie) => ({
              movie,
              score: getGuidMatchScore(
                parseGuids(movie.guids),
                parseGuids(item.guids),
              ),
            }))
            .filter((match) => match.score > 0)
            .sort((a, b) => b.score - a.score)

          if (potentialMatches.length > 0) {
            const matchingMovies = potentialMatches.map((match) => match.movie)
            existingInstances.push(instanceId)
            const junctionKey = `${numericId}-${instanceId}`
            const currentJunction = junctionMap.get(junctionKey)

            // Add to junction if not exists
            if (!currentJunction) {
              junctionsToAdd.push({
                watchlist_id: numericId,
                radarr_instance_id: instanceId,
                status:
                  mainTableStatus === 'notified'
                    ? 'notified'
                    : matchingMovies[0].status || 'pending',
                is_primary: !currentInstanceMap.size,
              })
              updateCount++
            } else {
              // Update junction if needed
              const updates: {
                watchlist_id: number
                radarr_instance_id: number
                status?: 'pending' | 'requested' | 'grabbed' | 'notified'
                is_primary?: boolean
                last_notified_at?: string
              } = {
                watchlist_id: numericId,
                radarr_instance_id: instanceId,
              }

              let needsUpdate = false

              // Status update logic
              if (
                mainTableStatus === 'notified' &&
                currentJunction.status !== 'notified'
              ) {
                updates.status = 'notified'
                updates.last_notified_at =
                  currentJunction.last_notified_at || undefined
                needsUpdate = true
              } else if (
                (!currentJunction.status && matchingMovies[0].status) ||
                (currentJunction.status &&
                  currentJunction.status !== matchingMovies[0].status &&
                  !(
                    currentJunction.status === 'notified' &&
                    matchingMovies[0].status !== 'notified'
                  ))
              ) {
                updates.status = this.validateStatus(matchingMovies[0].status)
                if (currentJunction.status === 'notified') {
                  updates.last_notified_at =
                    currentJunction.last_notified_at || undefined
                }
                needsUpdate = true
              }

              if (needsUpdate) {
                junctionsToUpdate.push(updates)
                updateCount++
              }
            }
          }
        }

        // Clean up instances where the movie no longer exists
        currentInstanceMap.forEach((_, instanceId) => {
          if (!existingInstances.includes(instanceId)) {
            junctionsToRemove.push({
              watchlist_id: numericId,
              radarr_instance_id: instanceId,
            })
            updateCount++
          }
        })

        // Ensure primary instance is set correctly
        if (existingInstances.length > 0) {
          const hasPrimary = allJunctionEntries
            .filter(
              (entry) =>
                entry.watchlist_id === numericId &&
                existingInstances.includes(entry.radarr_instance_id),
            )
            .some((entry) => entry.is_primary)

          if (!hasPrimary) {
            junctionsToUpdate.push({
              watchlist_id: numericId,
              radarr_instance_id: existingInstances[0],
              status: 'pending',
              is_primary: true,
            })
            updateCount++
          }
        }
      }

      // 7. Execute all batch operations
      if (junctionsToAdd.length > 0) {
        await this.dbService.bulkAddWatchlistToRadarrInstances(junctionsToAdd)
        this.log.debug(
          `Added ${junctionsToAdd.length} Radarr junction records in bulk`,
        )
      }

      if (junctionsToUpdate.length > 0) {
        await this.dbService.bulkUpdateWatchlistRadarrInstanceStatuses(
          junctionsToUpdate,
        )
        this.log.debug(
          `Updated ${junctionsToUpdate.length} Radarr junction records in bulk`,
        )
      }

      if (junctionsToRemove.length > 0) {
        await this.dbService.bulkRemoveWatchlistFromRadarrInstances(
          junctionsToRemove,
        )
        this.log.debug(
          `Removed ${junctionsToRemove.length} Radarr junction records in bulk`,
        )
      }

      return updateCount
    } catch (error) {
      this.log.error(
        { error },
        'Error in bulk processing movie junction updates:',
      )
      throw error
    }
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

  /**
   * Validates that a status string is one of the allowed status values
   *
   * @param status - Status string to validate
   * @param defaultStatus - Optional default status to use if invalid (defaults to 'pending')
   * @param logWarning - Whether to log a warning for invalid statuses (defaults to true)
   * @returns A valid status value
   */
  private validateStatus(
    status: string | undefined,
    defaultStatus: 'pending' | 'requested' | 'grabbed' | 'notified' = 'pending',
    logWarning = true,
  ): 'pending' | 'requested' | 'grabbed' | 'notified' {
    if (
      status === 'pending' ||
      status === 'requested' ||
      status === 'grabbed' ||
      status === 'notified'
    ) {
      return status
    }

    if (logWarning) {
      this.log.warn(
        `Invalid status '${status}' found, defaulting to '${defaultStatus}'`,
      )
    }
    return defaultStatus
  }
}
