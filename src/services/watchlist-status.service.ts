import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  Item as SonarrItem,
  SonarrGenreRoute,
  SonarrInstance,
} from '@root/types/sonarr.types.js'
import type {
  Item as RadarrItem,
  RadarrGenreRoute,
  RadarrInstance,
} from '@root/types/radarr.types.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'

export class StatusService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly dbService: FastifyInstance['db'],
    private readonly sonarrManager: FastifyInstance['sonarrManager'],
    private readonly radarrManager: FastifyInstance['radarrManager'],
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
      const existingSeries = await this.sonarrManager.fetchAllSeries()
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

      const genreRoutes = await this.dbService.getSonarrGenreRoutes()
      const defaultInstance = await this.dbService.getDefaultSonarrInstance()

      const junctionUpdates = await this.processShowJunctionUpdates(
        existingSeries,
        dbWatchlistItems,
        genreRoutes,
        defaultInstance,
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
      const existingMovies = await this.radarrManager.fetchAllMovies()
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

      const genreRoutes = await this.dbService.getRadarrGenreRoutes()
      const defaultInstance = await this.dbService.getDefaultRadarrInstance()

      const junctionUpdates = await this.processMovieJunctionUpdates(
        existingMovies,
        dbWatchlistItems,
        genreRoutes,
        defaultInstance,
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

  // Junction table updates

  private async processShowJunctionUpdates(
    sonarrItems: SonarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
    genreRoutes: SonarrGenreRoute[],
    defaultInstance: SonarrInstance | null,
  ): Promise<number> {
    let updateCount = 0

    for (const item of watchlistItems) {
      try {
        if (item.id === undefined) {
          this.log.debug(`Skipping show ${item.title} with undefined ID`)
          continue
        }

        const matchingSeries = sonarrItems.filter((series) =>
          this.isGuidMatch(series.guids, item.guids),
        )

        if (matchingSeries.length === 0) continue

        const currentInstanceIds =
          await this.dbService.getWatchlistSonarrInstanceIds(item.id)

        const itemGenres = this.parseGenres(item.genres)
        const targetInstanceIds = new Set<number>()

        for (const route of genreRoutes) {
          if (itemGenres.includes(route.genre)) {
            targetInstanceIds.add(route.sonarrInstanceId)
          }
        }

        if (targetInstanceIds.size === 0 && defaultInstance) {
          targetInstanceIds.add(defaultInstance.id)

          const syncedInstances = Array.isArray(defaultInstance.syncedInstances)
            ? defaultInstance.syncedInstances
            : typeof defaultInstance.syncedInstances === 'string'
              ? JSON.parse(defaultInstance.syncedInstances || '[]')
              : []

          for (const syncedId of syncedInstances) {
            targetInstanceIds.add(syncedId)
          }
        }

        for (const series of matchingSeries) {
          const instanceId = series.sonarr_instance_id
          if (!instanceId) continue

          if (targetInstanceIds.has(instanceId)) {
            if (!currentInstanceIds.includes(instanceId)) {
              await this.dbService.addWatchlistToSonarrInstance(
                item.id,
                instanceId,
                series.status || 'pending',
                currentInstanceIds.length === 0,
              )
              updateCount++
              this.log.debug(
                `Added show ${item.title} to Sonarr instance ${instanceId}`,
              )
            } else {
              const currentStatus =
                await this.dbService.getWatchlistSonarrInstanceStatus(
                  item.id,
                  instanceId,
                )

              if (
                currentStatus &&
                currentStatus.status !== series.status &&
                !(
                  currentStatus.status === 'notified' &&
                  series.status !== 'notified'
                )
              ) {
                await this.dbService.updateWatchlistSonarrInstanceStatus(
                  item.id,
                  instanceId,
                  series.status || 'pending',
                  currentStatus.status === 'notified'
                    ? currentStatus.last_notified_at
                    : null,
                )
                updateCount++
                this.log.debug(
                  `Updated show ${item.title} status in Sonarr instance ${instanceId}`,
                )
              }
            }
          }
        }

        const instancesToRemove = currentInstanceIds.filter(
          (id) => !targetInstanceIds.has(id),
        )

        if (instancesToRemove.length > 0) {
          if (targetInstanceIds.size > 0) {
            const validInstanceIds = Array.from(targetInstanceIds)
            let needNewPrimary = false

            for (const instanceId of instancesToRemove) {
              const status =
                await this.dbService.getWatchlistSonarrInstanceStatus(
                  item.id,
                  instanceId,
                )
              if (status?.is_primary) {
                needNewPrimary = true
              }

              await this.dbService.removeWatchlistFromSonarrInstance(
                item.id,
                instanceId,
              )
              updateCount++
              this.log.debug(
                `Removed show ${item.title} from Sonarr instance ${instanceId} (genre routing)`,
              )
            }

            if (needNewPrimary && validInstanceIds.length > 0) {
              await this.dbService.setPrimarySonarrInstance(
                item.id,
                validInstanceIds[0],
              )
              updateCount++
            }
          } else {
            for (const instanceId of instancesToRemove) {
              await this.dbService.removeWatchlistFromSonarrInstance(
                item.id,
                instanceId,
              )
              updateCount++
              this.log.debug(
                `Removed show ${item.title} from Sonarr instance ${instanceId} (no genre matches)`,
              )
            }
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

  private async processMovieJunctionUpdates(
    radarrItems: RadarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
    genreRoutes: RadarrGenreRoute[],
    defaultInstance: RadarrInstance | null,
  ): Promise<number> {
    let updateCount = 0

    for (const item of watchlistItems) {
      try {
        if (item.id === undefined) {
          this.log.debug(`Skipping movie ${item.title} with undefined ID`)
          continue
        }

        const matchingMovies = radarrItems.filter((movie) =>
          this.isGuidMatch(movie.guids, item.guids),
        )

        if (matchingMovies.length === 0) continue

        const currentInstanceIds =
          await this.dbService.getWatchlistRadarrInstanceIds(item.id)

        const itemGenres = this.parseGenres(item.genres)
        const targetInstanceIds = new Set<number>()

        for (const route of genreRoutes) {
          if (itemGenres.includes(route.genre)) {
            targetInstanceIds.add(route.radarrInstanceId)
          }
        }

        if (targetInstanceIds.size === 0 && defaultInstance) {
          targetInstanceIds.add(defaultInstance.id)

          const syncedInstances = Array.isArray(defaultInstance.syncedInstances)
            ? defaultInstance.syncedInstances
            : typeof defaultInstance.syncedInstances === 'string'
              ? JSON.parse(defaultInstance.syncedInstances || '[]')
              : []

          for (const syncedId of syncedInstances) {
            targetInstanceIds.add(syncedId)
          }
        }

        for (const movie of matchingMovies) {
          const instanceId = movie.radarr_instance_id
          if (!instanceId) continue

          if (targetInstanceIds.has(instanceId)) {
            if (!currentInstanceIds.includes(instanceId)) {
              await this.dbService.addWatchlistToRadarrInstance(
                item.id,
                instanceId,
                movie.status || 'pending',
                currentInstanceIds.length === 0,
              )
              updateCount++
              this.log.debug(
                `Added movie ${item.title} to Radarr instance ${instanceId}`,
              )
            } else {
              const currentStatus =
                await this.dbService.getWatchlistRadarrInstanceStatus(
                  item.id,
                  instanceId,
                )

              if (
                currentStatus &&
                currentStatus.status !== movie.status &&
                !(
                  currentStatus.status === 'notified' &&
                  movie.status !== 'notified'
                )
              ) {
                await this.dbService.updateWatchlistRadarrInstanceStatus(
                  item.id,
                  instanceId,
                  movie.status || 'pending',
                  currentStatus.status === 'notified'
                    ? currentStatus.last_notified_at
                    : null,
                )
                updateCount++
                this.log.debug(
                  `Updated movie ${item.title} status in Radarr instance ${instanceId}`,
                )
              }
            }
          }
        }

        const instancesToRemove = currentInstanceIds.filter(
          (id) => !targetInstanceIds.has(id),
        )

        if (instancesToRemove.length > 0) {
          if (targetInstanceIds.size > 0) {
            const validInstanceIds = Array.from(targetInstanceIds)
            let needNewPrimary = false

            for (const instanceId of instancesToRemove) {
              const status =
                await this.dbService.getWatchlistRadarrInstanceStatus(
                  item.id,
                  instanceId,
                )
              if (status?.is_primary) {
                needNewPrimary = true
              }

              await this.dbService.removeWatchlistFromRadarrInstance(
                item.id,
                instanceId,
              )
              updateCount++
              this.log.debug(
                `Removed movie ${item.title} from Radarr instance ${instanceId} (genre routing)`,
              )
            }

            if (needNewPrimary && validInstanceIds.length > 0) {
              await this.dbService.setPrimaryRadarrInstance(
                item.id,
                validInstanceIds[0],
              )
              updateCount++
            }
          } else {
            for (const instanceId of instancesToRemove) {
              await this.dbService.removeWatchlistFromRadarrInstance(
                item.id,
                instanceId,
              )
              updateCount++
              this.log.debug(
                `Removed movie ${item.title} from Radarr instance ${instanceId} (no genre matches)`,
              )
            }
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

  private async verifyItemExistsInSonarrInstance(
    instanceId: number,
    item: { title: string; guids: string[] | string | undefined; key: string },
  ): Promise<boolean> {
    try {
      if (!item.guids) {
        this.log.debug(`Show ${item.title} has no GUIDs to verify against`)
        return false
      }

      const tempItem = {
        title: item.title,
        guids:
          typeof item.guids === 'string' ? JSON.parse(item.guids) : item.guids,
        type: 'show',
        key: item.key,
      }

      const exists = await this.sonarrManager.verifyItemExists(
        instanceId,
        tempItem,
      )
      if (exists) {
        this.log.debug(
          `Show ${item.title} already exists in Sonarr instance ${instanceId}, skipping addition`,
        )
        return true
      }

      return false
    } catch (error) {
      this.log.error(
        `Error verifying show ${item.title} in Sonarr instance ${instanceId}: ${error}`,
      )
      return false
    }
  }

  private async verifyItemExistsInRadarrInstance(
    instanceId: number,
    item: { title: string; guids: string[] | string | undefined; key: string },
  ): Promise<boolean> {
    try {
      if (!item.guids) {
        this.log.debug(`Movie ${item.title} has no GUIDs to verify against`)
        return false
      }

      const tempItem = {
        title: item.title,
        guids:
          typeof item.guids === 'string' ? JSON.parse(item.guids) : item.guids,
        type: 'movie',
        key: item.key,
      }

      const exists = await this.radarrManager.verifyItemExists(
        instanceId,
        tempItem,
      )
      if (exists) {
        this.log.debug(
          `Movie ${item.title} already exists in Radarr instance ${instanceId}, skipping addition`,
        )
        return true
      }

      return false
    } catch (error) {
      this.log.error(
        `Error verifying movie ${item.title} in Radarr instance ${instanceId}: ${error}`,
      )
      return false
    }
  }

  async syncRadarrInstance(instanceId: number): Promise<number> {
    try {
      this.log.info(`Starting sync for Radarr instance ${instanceId}`)

      const instance = await this.dbService.getRadarrInstance(instanceId)
      if (!instance) {
        throw new Error(`Radarr instance ${instanceId} not found`)
      }

      const defaultInstance = await this.dbService.getDefaultRadarrInstance()

      this.log.debug(
        `Instance syncedInstances: ${JSON.stringify(instance.syncedInstances)}`,
      )
      this.log.debug(`Instance isDefault: ${instance.isDefault}`)

      if (defaultInstance) {
        this.log.debug(`Default instance ID: ${defaultInstance.id}`)
        this.log.debug(
          `Default instance syncedInstances: ${JSON.stringify(defaultInstance.syncedInstances)}`,
        )
      }

      const shouldSyncFromDefault =
        defaultInstance &&
        defaultInstance.id !== instanceId &&
        Array.isArray(defaultInstance.syncedInstances) &&
        defaultInstance.syncedInstances.includes(instanceId)

      this.log.debug(
        `Should sync from default to this instance: ${shouldSyncFromDefault}`,
      )

      const watchlistItems = await this.dbService.getAllMovieWatchlistItems()

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

      const allExistingMovies = await this.radarrManager.fetchAllMovies()

      const existingMoviesInInstance = allExistingMovies.filter(
        (movie) => movie.radarr_instance_id === instanceId,
      )

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

      this.log.debug(
        `Found ${uniqueWatchlistItems.length} unique movies to evaluate for sync`,
      )

      const genreRoutes = await this.dbService.getRadarrGenreRoutes()
      this.log.debug(`Found ${genreRoutes.length} genre routes for Radarr`)

      let itemsCopied = 0

      for (const item of uniqueWatchlistItems) {
        try {
          if (item.id === undefined) continue

          const numericId =
            typeof item.id === 'string' ? Number(item.id) : item.id

          const currentInstanceIds =
            await this.dbService.getWatchlistRadarrInstanceIds(numericId)

          if (currentInstanceIds.includes(instanceId)) continue

          let shouldBeInInstance = false

          const itemGenres = this.parseGenres(item.genres)
          for (const route of genreRoutes) {
            if (
              route.radarrInstanceId === instanceId &&
              itemGenres.includes(route.genre)
            ) {
              shouldBeInInstance = true
              this.log.debug(
                `Movie ${item.title} matches genre route: ${route.genre}`,
              )
              break
            }
          }

          if (!shouldBeInInstance && shouldSyncFromDefault) {
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
              itemsCopied++
              continue
            }

            const matchingMovie = this.findMatch(allExistingMovies, item.guids)

            if (matchingMovie) {
              try {
                await this.radarrManager.routeItemToRadarr(
                  matchingMovie,
                  item.key,
                  instanceId,
                )
                itemsCopied++
                this.log.debug(
                  `Copied movie ${item.title} to Radarr instance ${instanceId}`,
                )
              } catch (error) {
                this.log.error(
                  `Error copying movie ${item.title} to instance ${instanceId}: ${error}`,
                )
              }
            } else {
              this.log.debug(
                `No matching movie found for ${item.title} to copy to instance ${instanceId}`,
              )
            }
          }
        } catch (itemError) {
          this.log.error(
            `Error processing movie ${item.title} during sync: ${itemError}`,
          )
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

  async syncSonarrInstance(instanceId: number): Promise<number> {
    try {
      this.log.info(`Starting sync for Sonarr instance ${instanceId}`)

      const instance = await this.dbService.getSonarrInstance(instanceId)
      if (!instance) {
        throw new Error(`Sonarr instance ${instanceId} not found`)
      }

      const defaultInstance = await this.dbService.getDefaultSonarrInstance()

      this.log.debug(
        `Instance syncedInstances: ${JSON.stringify(instance.syncedInstances)}`,
      )
      this.log.debug(`Instance isDefault: ${instance.isDefault}`)

      if (defaultInstance) {
        this.log.debug(`Default instance ID: ${defaultInstance.id}`)
        this.log.debug(
          `Default instance syncedInstances: ${JSON.stringify(defaultInstance.syncedInstances)}`,
        )
      }

      const shouldSyncFromDefault =
        defaultInstance &&
        defaultInstance.id !== instanceId &&
        Array.isArray(defaultInstance.syncedInstances) &&
        defaultInstance.syncedInstances.includes(instanceId)

      this.log.debug(
        `Should sync from default to this instance: ${shouldSyncFromDefault}`,
      )

      const watchlistItems = await this.dbService.getAllShowWatchlistItems()

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

      const allExistingSeries = await this.sonarrManager.fetchAllSeries()

      const existingSeriesInInstance = allExistingSeries.filter(
        (series) => series.sonarr_instance_id === instanceId,
      )

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

      this.log.debug(
        `Found ${uniqueWatchlistItems.length} unique shows to evaluate for sync`,
      )

      const genreRoutes = await this.dbService.getSonarrGenreRoutes()
      this.log.debug(`Found ${genreRoutes.length} genre routes for Sonarr`)

      let itemsCopied = 0

      for (const item of uniqueWatchlistItems) {
        try {
          if (item.id === undefined) continue

          const numericId =
            typeof item.id === 'string' ? Number(item.id) : item.id

          const currentInstanceIds =
            await this.dbService.getWatchlistSonarrInstanceIds(numericId)

          if (currentInstanceIds.includes(instanceId)) continue

          let shouldBeInInstance = false

          const itemGenres = this.parseGenres(item.genres)
          for (const route of genreRoutes) {
            if (
              route.sonarrInstanceId === instanceId &&
              itemGenres.includes(route.genre)
            ) {
              shouldBeInInstance = true
              this.log.debug(
                `Show ${item.title} matches genre route: ${route.genre}`,
              )
              break
            }
          }

          if (!shouldBeInInstance && shouldSyncFromDefault) {
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
              itemsCopied++
              continue
            }

            const matchingSeries = this.findMatch(allExistingSeries, item.guids)

            if (matchingSeries) {
              try {
                await this.sonarrManager.routeItemToSonarr(
                  matchingSeries,
                  item.key,
                  instanceId,
                )

                itemsCopied++
                this.log.debug(
                  `Copied show ${item.title} to Sonarr instance ${instanceId}`,
                )
              } catch (error) {
                this.log.error(
                  `Error copying show ${item.title} to instance ${instanceId}: ${error}`,
                )
              }
            } else {
              this.log.debug(
                `No matching series found for ${item.title} to copy to instance ${instanceId}`,
              )
            }
          }
        } catch (itemError) {
          this.log.error(
            `Error processing show ${item.title} during sync: ${itemError}`,
          )
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

  async syncInstance(
    instanceId: number,
    instanceType: 'radarr' | 'sonarr',
  ): Promise<number> {
    if (instanceType === 'radarr') {
      return this.syncRadarrInstance(instanceId)
    }
    return this.syncSonarrInstance(instanceId)
  }
}
