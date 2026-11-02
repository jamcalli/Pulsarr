import type { SonarrSeriesType } from '@root/schemas/sonarr/series-type.schema.js'
import { HttpError } from '@root/types/arr-connection.types.js'
import type { ArrAddedSettings } from '@root/types/router.types.js'
import type {
  SonarrItem as Item,
  SonarrAddOptions,
  SonarrConfiguration,
  SonarrEpisode,
  SonarrInstance,
  SonarrPost,
  SonarrSeries,
  SonarrTagDetail,
} from '@root/types/sonarr.types.js'
import {
  type ArrCaches,
  type ArrExclusions,
  readArrCache,
} from '@services/arr/arr-caches.js'
import { SONARR } from '@services/arr/arr-product.js'
import {
  resolveQualityProfileId,
  resolveRootFolder,
} from '@services/arr/arr-profiles.js'
import { ArrService } from '@services/arr/arr-service.js'
import {
  extractSonarrId,
  extractTvdbId,
  normalizeGuid,
} from '@utils/guid-handler.js'
import { findQualityProfileName } from '@utils/quality-profile.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class SonarrService extends ArrService<SonarrInstance, SonarrSeries> {
  private config: SonarrConfiguration | null = null

  constructor(
    baseLog: FastifyBaseLogger,
    appBaseUrl: string,
    port: number,
    fastify: FastifyInstance,
    private readonly caches: ArrCaches<SonarrSeries, Item>,
  ) {
    super(SONARR, baseLog, appBaseUrl, port, fastify, caches)
  }

  protected applyInstance(instance: SonarrInstance): void {
    this.config = {
      sonarrQualityProfileId: instance.qualityProfile || null,
      sonarrRootFolder: instance.rootFolder || null,
      sonarrTagIds: instance.tags,
      sonarrSeasonMonitoring: instance.seasonMonitoring,
      sonarrMonitorNewItems: instance.monitorNewItems || 'all',
      searchOnAdd:
        instance.searchOnAdd !== undefined ? instance.searchOnAdd : true,
      sonarrSeriesType: instance.seriesType || 'standard',
      createSeasonFolders: instance.createSeasonFolders,
    }
  }

  private get sonarrConfig(): SonarrConfiguration {
    if (!this.config) {
      throw new Error('Sonarr service not initialized')
    }
    return this.config
  }

  private toItem(series: SonarrSeries): Item {
    const hasEpisodes =
      series.seasons?.some(
        (season) =>
          season.statistics?.episodeFileCount &&
          season.statistics.episodeFileCount > 0,
      ) ?? false
    return {
      title: series.title,
      guids: [
        series.imdbId ? normalizeGuid(`imdb:${series.imdbId}`) : undefined,
        series.tmdbId ? normalizeGuid(`tmdb:${series.tmdbId}`) : undefined,
        series.tvdbId ? normalizeGuid(`tvdb:${series.tvdbId}`) : undefined,
        normalizeGuid(`sonarr:${series.id}`),
      ].filter((x): x is string => !!x),
      type: 'show',
      ended: series.ended,
      added: series.added,
      status: hasEpisodes ? 'grabbed' : 'requested',
      series_status: series.ended ? 'ended' : 'continuing',
      tags: series.tags,
    }
  }

  private readLibrary(): Promise<SonarrSeries[]> {
    return readArrCache(
      this.caches.library,
      this.context,
      () => this.client.get<SonarrSeries[]>('series'),
      { fresh: true },
    )
  }

  private readExclusions(): Promise<ArrExclusions<Item>> {
    return readArrCache(this.caches.exclusions, this.context, () =>
      this.fetchExclusions(),
    )
  }

  async fetchSeries(bypass = false): Promise<Set<Item>> {
    try {
      const shows = await this.readLibrary()
      const exclusions = bypass ? [] : (await this.readExclusions()).items
      return new Set([
        ...shows.map((show) => this.toItem(show)),
        ...exclusions.map((item) => ({ ...item, isExclusion: true })),
      ])
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching series')
      throw err
    }
  }

  /**
   * Get full series data by Sonarr series ID, including season statistics.
   * Returns null when the series does not exist; rethrows other errors so
   * callers can distinguish a missing series from a failed lookup.
   */
  async getSeriesById(seriesId: number): Promise<SonarrSeries | null> {
    try {
      return await this.client.get<SonarrSeries>(`series/${seriesId}`)
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return null
      }
      this.log.error(
        { error: err, seriesId },
        'Error fetching series by Sonarr ID',
      )
      throw err
    }
  }

  async isTvdbIdExcluded(tvdbId: number): Promise<boolean> {
    return (await this.readExclusions()).ids.has(tvdbId)
  }

  private async fetchExclusions(): Promise<ArrExclusions<Item>> {
    try {
      const exclusions = await this.client.getAllPages<SonarrSeries>(
        'importlistexclusion/paged',
        'title',
      )
      this.log.debug(`Fetched all exclusions (${exclusions.length} shows)`)
      return {
        items: exclusions.map((show) => this.toItem(show)),
        ids: new Set(
          exclusions
            .map((show) => show.tvdbId)
            .filter((id): id is number => id !== undefined && id > 0),
        ),
      }
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching exclusions')
      throw err
    }
  }

  async addToSonarr(
    item: Item,
    overrideRootFolder?: string,
    overrideQualityProfileId?: number | string | null,
    overrideTags?: string[],
    overrideSearchOnAdd?: boolean | null,
    overrideSeasonMonitoring?: string | null,
    overrideSeriesType?: SonarrSeriesType | null,
    overrideCreateSeasonFolders?: boolean | null,
  ): Promise<ArrAddedSettings & { seriesId: number }> {
    const config = this.sonarrConfig
    try {
      // Check if searchOnAdd parameter or property exists and use it, otherwise default to true
      const shouldSearch =
        overrideSearchOnAdd !== undefined && overrideSearchOnAdd !== null
          ? overrideSearchOnAdd
          : config.searchOnAdd !== undefined
            ? config.searchOnAdd
            : true

      // Season monitoring strategy - prefer override, then config, then default to 'all'
      const monitorStrategy = overrideSeasonMonitoring
        ? overrideSeasonMonitoring
        : config.sonarrSeasonMonitoring || 'all'

      const addOptions: SonarrAddOptions = {
        monitor: monitorStrategy,
        searchForCutoffUnmetEpisodes: shouldSearch,
        searchForMissingEpisodes: shouldSearch,
      }

      const rootFolderPath = await resolveRootFolder(
        this.context,
        config.sonarrRootFolder,
        overrideRootFolder,
      )

      const qualityProfiles =
        overrideQualityProfileId !== undefined
          ? await this.getQualityProfiles().catch(() => [])
          : await this.getQualityProfiles()
      const qualityProfileId =
        overrideQualityProfileId !== undefined
          ? overrideQualityProfileId
          : resolveQualityProfileId(
              this.context,
              qualityProfiles,
              config.sonarrQualityProfileId,
            )

      const { ids: tags, existing: existingTags } =
        await this.tags.resolveForAdd(overrideTags, config.sonarrTagIds)

      // Series type - prefer override, then config, then default to 'standard'
      const seriesType = overrideSeriesType
        ? overrideSeriesType
        : config.sonarrSeriesType || 'standard'

      // Create season folders - prefer override, then config, then default to undefined (Sonarr default)
      const createSeasonFolders =
        overrideCreateSeasonFolders !== undefined &&
        overrideCreateSeasonFolders !== null
          ? overrideCreateSeasonFolders
          : config.createSeasonFolders

      const show: SonarrPost = {
        title: item.title,
        tvdbId: extractTvdbId(item.guids),
        qualityProfileId,
        rootFolderPath,
        addOptions,
        languageProfileId: null,
        monitored: true,
        monitorNewItems: config.sonarrMonitorNewItems || 'all',
        tags,
        seriesType,
        seasonFolder: createSeasonFolders,
      }

      const createdSeries = await this.client.post<SonarrSeries>('series', show)
      if (!createdSeries || typeof createdSeries.id !== 'number') {
        throw new Error('Unexpected Sonarr response when creating series')
      }
      this.log.debug(
        {
          title: item.title,
          qualityProfileId,
          rootFolder: rootFolderPath,
          tags: tags.length > 0 ? tags : undefined,
          seriesType,
          seasonMonitoring: addOptions.monitor,
          searchOnAdd: addOptions.searchForMissingEpisodes,
        },
        `Sent ${item.title} to Sonarr`,
      )
      const labelById = new Map(existingTags.map((t) => [t.id, t.label]))
      return {
        seriesId: createdSeries.id,
        rootFolder: createdSeries.rootFolderPath ?? rootFolderPath,
        qualityProfileId: createdSeries.qualityProfileId ?? qualityProfileId,
        qualityProfileName: findQualityProfileName(
          qualityProfiles,
          createdSeries.qualityProfileId ?? qualityProfileId,
        ),
        tags: (createdSeries.tags ?? tags.map(Number)).map(
          (id) => labelById.get(id) ?? String(id),
        ),
      }
    } catch (err) {
      this.log.debug(
        { error: err, title: item.title },
        'Send to Sonarr failed (rethrowing upstream)',
      )
      throw err
    }
  }

  async deleteFromSonarr(item: Item, deleteFiles: boolean): Promise<void> {
    try {
      const sonarrId = extractSonarrId(item.guids)

      if (sonarrId > 0) {
        // Use the extracted Sonarr ID directly
        await this.deleteFromSonarrById(sonarrId, deleteFiles)
        this.log.debug(`Deleted ${item.title} from Sonarr`)
        return
      }

      const tvdbId = extractTvdbId(item.guids)
      if (tvdbId === 0) {
        this.log.warn(
          `Unable to extract any valid ID from show to delete: ${JSON.stringify(item)}`,
        )
        return
      }

      const series = await this.findInLibrary(tvdbId)
      if (!series) {
        throw new Error(`Could not find show with TVDB ID: ${tvdbId}`)
      }

      await this.deleteFromSonarrById(series.id, deleteFiles)
      this.log.debug(`Deleted ${item.title} from Sonarr`)
    } catch (err) {
      this.log.error({ error: err }, 'Error deleting from Sonarr')
      throw err
    }
  }

  private async deleteFromSonarrById(
    id: number,
    deleteFiles: boolean,
  ): Promise<void> {
    await this.client.delete(
      `series/${id}?deleteFiles=${deleteFiles}&addImportListExclusion=false`,
    )
  }

  getTagDetails(): Promise<SonarrTagDetail[]> {
    return this.client.get<SonarrTagDetail[]>('tag/detail')
  }

  /**
   * Get all series from Sonarr (raw data)
   * @returns Promise resolving to array of series
   */
  async getAllSeries(): Promise<SonarrSeries[]> {
    try {
      return await this.readLibrary()
    } catch (error) {
      this.log.error({ error }, 'Error fetching all series:')
      throw error
    }
  }

  /**
   * Search for episodes in a specific season
   * Enables monitoring first if needed, then searches
   * @param seriesId The Sonarr series ID
   * @param seasonNumber The season number to search
   */
  async searchSeason(seriesId: number, seasonNumber: number): Promise<void> {
    try {
      // STEP 1: Get current series data
      const series = await this.client.get<SonarrSeries>(`series/${seriesId}`)

      // STEP 2: Check if season exists
      const season = series.seasons?.find(
        (s) => s.seasonNumber === seasonNumber,
      )
      if (!season) {
        throw new Error(
          `Season ${seasonNumber} not found in series ${seriesId}`,
        )
      }

      // STEP 3: Enable monitoring if needed
      let needsUpdate = false
      if (!season.monitored) {
        season.monitored = true
        needsUpdate = true
        this.log.debug(
          `Enabling monitoring for series ${seriesId} season ${seasonNumber}`,
        )
      }
      if (!series.monitored) {
        series.monitored = true
        needsUpdate = true
        this.log.debug(`Enabling monitoring for series ${seriesId}`)
      }

      // STEP 4: Update series if monitoring changed
      if (needsUpdate) {
        await this.client.put(`series/${seriesId}`, series)
        this.log.debug(
          `Updated monitoring for series ${seriesId} season ${seasonNumber}`,
        )
      }

      // STEP 5: Now trigger the search
      await this.client.post('command', {
        name: 'SeasonSearch',
        seriesId,
        seasonNumber,
      })

      this.log.debug(
        `Triggered search for series ${seriesId} season ${seasonNumber}`,
      )
    } catch (error) {
      this.log.error({ error }, 'Error searching season')
      throw error
    }
  }

  /**
   * Search for specific episodes by their IDs
   * Uses Sonarr's EpisodeSearch command for targeted episode searching
   * @param episodeIds Array of Sonarr episode IDs to search for
   */
  async searchEpisodes(episodeIds: number[]): Promise<void> {
    if (episodeIds.length === 0) return

    try {
      await this.client.post('command', {
        name: 'EpisodeSearch',
        episodeIds,
      })

      this.log.debug(`Triggered search for ${episodeIds.length} episodes`)
    } catch (error) {
      this.log.error({ error }, 'Error searching episodes')
      throw error
    }
  }

  /**
   * Update monitoring for a specific season
   * @param seriesId The Sonarr series ID
   * @param seasonNumber The season number
   * @param monitored Whether to monitor the season
   */
  async updateSeasonMonitoring(
    seriesId: number,
    seasonNumber: number,
    monitored: boolean,
  ): Promise<void> {
    try {
      // First get the series to find the season
      const series = await this.client.get<SonarrSeries>(`series/${seriesId}`)

      if (!series.seasons) {
        throw new Error('Series has no seasons')
      }

      // Find and update the season
      const seasonIndex = series.seasons.findIndex(
        (s) => s.seasonNumber === seasonNumber,
      )
      if (seasonIndex === -1) {
        throw new Error(`Season ${seasonNumber} not found`)
      }

      series.seasons[seasonIndex].monitored = monitored

      // Update the series
      await this.client.put(`series/${seriesId}`, series)

      this.log.debug(
        `Updated monitoring for series ${seriesId} season ${seasonNumber} to ${monitored}`,
      )
    } catch (error) {
      this.log.error({ error }, 'Error updating season monitoring:')
      throw error
    }
  }

  /**
   * Update series monitoring settings
   * @param seriesId The Sonarr series ID
   * @param updates Object containing monitoring updates
   */
  async updateSeriesMonitoring(
    seriesId: number,
    updates: { monitored?: boolean; monitorNewItems?: 'all' | 'none' },
  ): Promise<void> {
    try {
      // Get current series data
      const series = await this.client.get<SonarrSeries>(`series/${seriesId}`)

      // Apply updates
      const updatedSeries = {
        ...series,
        ...updates,
      }

      // Send update
      await this.client.put(`series/${seriesId}`, updatedSeries)

      this.log.debug(`Updated series ${seriesId} monitoring settings`)
    } catch (error) {
      this.log.error({ error }, 'Error updating series monitoring:')
      throw error
    }
  }

  /**
   * Wait for Sonarr to finish its post-add background refresh.
   * Sonarr queues a RefreshSeriesCommand after adding a series. Until that
   * completes, addOptions is non-null and Sonarr will re-apply its monitoring
   * preset, clobbering any episode-level changes we make. Poll until
   * addOptions is cleared, then it's safe to set custom monitoring.
   */
  async waitForAddComplete(
    seriesId: number,
    timeoutMs = 30_000,
    intervalMs = 1_000,
  ): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const series = await this.client.get<SonarrSeries>(`series/${seriesId}`)
      if (!series.addOptions) return
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    this.log.warn(
      `Timed out waiting for Sonarr to finish post-add refresh for series ${seriesId}`,
    )
  }

  /**
   * Get all episodes for a series
   * @param seriesId The Sonarr series ID
   * @returns Array of episodes
   */
  async getEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
    try {
      const episodes = await this.client.get<SonarrEpisode[]>(
        `episode?seriesId=${seriesId}`,
      )
      return episodes || []
    } catch (error) {
      this.log.error(
        { error },
        `Error fetching episodes for series ${seriesId}:`,
      )
      throw error
    }
  }

  /**
   * Get episodes for a specific season
   * @param seriesId The Sonarr series ID
   * @param seasonNumber The season number
   * @returns Array of episodes in the season
   */
  async getSeasonEpisodes(
    seriesId: number,
    seasonNumber: number,
  ): Promise<SonarrEpisode[]> {
    try {
      const allEpisodes = await this.getEpisodes(seriesId)
      return allEpisodes.filter((ep) => ep.seasonNumber === seasonNumber)
    } catch (error) {
      this.log.error(
        { error, seriesId, seasonNumber },
        'Error fetching episodes for series season',
      )
      throw error
    }
  }

  /**
   * Get the episode count for a specific season using the fast episode endpoint.
   * Uses /episode?seriesId=X&seasonNumber=Y which is a direct indexed query,
   * avoiding the expensive statistics computation of the /series endpoint.
   */
  async getSeasonEpisodeCount(
    seriesId: number,
    seasonNumber: number,
  ): Promise<number | null> {
    try {
      const episodes = await this.client.get<SonarrEpisode[]>(
        `episode?seriesId=${seriesId}&seasonNumber=${seasonNumber}`,
      )
      return episodes.length
    } catch (err) {
      this.log.error(
        { error: err, seriesId, seasonNumber },
        'Error fetching season episode count',
      )
      return null
    }
  }

  /**
   * Update monitoring for specific episodes
   * @param episodes Array of episode updates with id and monitored status
   */
  async updateEpisodesMonitoring(
    episodes: Array<{ id: number; monitored: boolean }>,
  ): Promise<void> {
    if (episodes.length === 0) return

    try {
      const toMonitor = episodes.filter((ep) => ep.monitored)
      const toUnmonitor = episodes.filter((ep) => !ep.monitored)

      if (toMonitor.length > 0) {
        await this.client.put('episode/monitor', {
          episodeIds: toMonitor.map((ep) => ep.id),
          monitored: true,
        })
      }

      if (toUnmonitor.length > 0) {
        await this.client.put('episode/monitor', {
          episodeIds: toUnmonitor.map((ep) => ep.id),
          monitored: false,
        })
      }

      this.log.debug(
        `Updated monitoring for ${episodes.length} episodes (${toMonitor.length} monitored, ${toUnmonitor.length} unmonitored)`,
      )
    } catch (error) {
      this.log.error({ error }, 'Error updating episode monitoring:')
      throw error
    }
  }

  /**
   * Update monitoring for a single episode
   * @param episodeId The episode ID
   * @param monitored Whether to monitor the episode
   */
  async updateEpisodeMonitoring(
    episodeId: number,
    monitored: boolean,
  ): Promise<void> {
    try {
      // First get the episode
      const episode = await this.client.get<SonarrEpisode>(
        `episode/${episodeId}`,
      )

      // Update monitoring status
      episode.monitored = monitored

      // Send update
      await this.client.put(`episode/${episodeId}`, episode)

      this.log.debug(`Updated episode ${episodeId} monitoring to ${monitored}`)
    } catch (error) {
      this.log.error(
        { error },
        `Error updating episode ${episodeId} monitoring:`,
      )
      throw error
    }
  }

  /**
   * Delete episode file from Sonarr and filesystem
   * @param episodeFileId The episode file ID
   */
  async deleteEpisodeFile(episodeFileId: number): Promise<void> {
    try {
      await this.client.delete(`episodefile/${episodeFileId}`)

      this.log.debug(`Deleted episode file ${episodeFileId}`)
    } catch (error) {
      this.log.error({ error }, `Error deleting episode file ${episodeFileId}:`)
      throw error
    }
  }

  /**
   * Delete multiple episode files from Sonarr and filesystem
   * @param episodeFileIds Array of episode file IDs to delete
   */
  async deleteEpisodeFiles(episodeFileIds: number[]): Promise<void> {
    if (episodeFileIds.length === 0) {
      this.log.debug('No episode files to delete')
      return
    }

    try {
      const deletePromises = episodeFileIds.map((id) =>
        this.deleteEpisodeFile(id),
      )
      const results = await Promise.allSettled(deletePromises)

      const failures = results.filter((r) => r.status === 'rejected')
      const successCount = results.length - failures.length

      if (failures.length > 0) {
        this.log.error(
          `Failed to delete ${failures.length} of ${episodeFileIds.length} episode files`,
        )

        // Log details about which files failed
        const failedIds = episodeFileIds.filter(
          (_, index) => results[index].status === 'rejected',
        )
        this.log.error({ failedIds }, 'Failed episode file IDs')

        // Log the actual errors for debugging
        const rejectedResults = results.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        )
        rejectedResults.forEach((failure, index) => {
          const failedId = failedIds[index]
          this.log.error(
            { error: failure.reason, episodeFileId: failedId },
            'Episode file deletion error',
          )
        })

        throw new Error(
          `Failed to delete ${failures.length} of ${episodeFileIds.length} episode files. Failed IDs: ${failedIds.join(', ')}`,
        )
      }

      this.log.debug(`Successfully deleted ${successCount} episode files`)
    } catch (error) {
      // Re-throw errors from Promise.allSettled analysis above
      if (
        error instanceof Error &&
        error.message.includes('Failed to delete')
      ) {
        throw error
      }

      // Handle unexpected errors
      this.log.error({ error }, 'Unexpected error deleting episode files:')
      throw error
    }
  }
}
