import type { SonarrSeriesType } from '@root/schemas/sonarr/series-type.schema.js'
import {
  type ArrQualityProfile,
  type ArrTag,
  HttpError,
} from '@root/types/arr-connection.types.js'
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
import {
  findQualityProfileName,
  parseQualityProfileId,
} from '@utils/quality-profile.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

type SonarrAddOverrides = [
  overrideRootFolder?: string,
  overrideQualityProfileId?: number | string | null,
  overrideTags?: string[],
  overrideSearchOnAdd?: boolean | null,
  overrideSeasonMonitoring?: string | null,
  overrideSeriesType?: SonarrSeriesType | null,
  overrideCreateSeasonFolders?: boolean | null,
]

interface SonarrAddSettings {
  addOptions: SonarrAddOptions
  shouldSearch: boolean
  rootFolderPath: string
  qualityProfiles: ArrQualityProfile[]
  qualityProfileId: number | string | null
  tags: string[]
  existingTags: ArrTag[]
  monitorNewItems: 'all' | 'none'
  seriesType: SonarrSeriesType
  seasonFolder: boolean | undefined
}

/** Nothing monitored, and either no file at all or an aired regular episode without one, so nothing in Sonarr will deliver it. */
export function isDormantSeries(
  series: Pick<SonarrSeries, 'monitored'>,
  episodes: ReadonlyArray<
    Pick<SonarrEpisode, 'monitored' | 'hasFile' | 'seasonNumber' | 'airDateUtc'>
  >,
  now: number = Date.now(),
): boolean {
  const nothingMonitored =
    series.monitored === false ||
    (episodes.length > 0 && episodes.every((episode) => !episode.monitored))
  if (!nothingMonitored) return false
  const hasFiles = episodes.some((episode) => episode.hasFile)
  const missingAired = episodes.some(
    (episode) =>
      episode.seasonNumber > 0 &&
      !episode.hasFile &&
      episode.airDateUtc !== undefined &&
      Date.parse(episode.airDateUtc) < now,
  )
  return !hasFiles || missingAired
}

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

  async isDormant(series: SonarrSeries): Promise<boolean> {
    return isDormantSeries(series, await this.getEpisodes(series.id))
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

  /** Null when the series does not exist, and any other failure rethrows. */
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

  private async resolveAddSettings(
    ...[
      overrideRootFolder,
      overrideQualityProfileId,
      overrideTags,
      overrideSearchOnAdd,
      overrideSeasonMonitoring,
      overrideSeriesType,
      overrideCreateSeasonFolders,
    ]: SonarrAddOverrides
  ): Promise<SonarrAddSettings> {
    const config = this.sonarrConfig
    const shouldSearch =
      overrideSearchOnAdd !== undefined && overrideSearchOnAdd !== null
        ? overrideSearchOnAdd
        : config.searchOnAdd !== undefined
          ? config.searchOnAdd
          : true

    const addOptions: SonarrAddOptions = {
      monitor: overrideSeasonMonitoring
        ? overrideSeasonMonitoring
        : config.sonarrSeasonMonitoring || 'all',
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

    const { ids: tags, existing: existingTags } = await this.tags.resolveForAdd(
      overrideTags,
      config.sonarrTagIds,
    )

    return {
      addOptions,
      shouldSearch,
      rootFolderPath,
      qualityProfiles,
      qualityProfileId,
      tags,
      existingTags,
      monitorNewItems: config.sonarrMonitorNewItems || 'all',
      seriesType: overrideSeriesType
        ? overrideSeriesType
        : config.sonarrSeriesType || 'standard',
      // Undefined leaves Sonarr's own season folder default
      seasonFolder:
        overrideCreateSeasonFolders !== undefined &&
        overrideCreateSeasonFolders !== null
          ? overrideCreateSeasonFolders
          : config.createSeasonFolders,
    }
  }

  private addedSettings(
    settings: SonarrAddSettings,
    stored: SonarrSeries,
  ): ArrAddedSettings & { seriesId: number } {
    const qualityProfileId =
      stored.qualityProfileId ?? settings.qualityProfileId
    const labelById = new Map(settings.existingTags.map((t) => [t.id, t.label]))
    return {
      seriesId: stored.id,
      rootFolder: stored.rootFolderPath ?? settings.rootFolderPath,
      qualityProfileId,
      qualityProfileName: findQualityProfileName(
        settings.qualityProfiles,
        qualityProfileId,
      ),
      tags: (stored.tags ?? settings.tags.map(Number)).map(
        (id) => labelById.get(id) ?? String(id),
      ),
    }
  }

  async addToSonarr(
    item: Item,
    ...overrides: SonarrAddOverrides
  ): Promise<ArrAddedSettings & { seriesId: number }> {
    try {
      const settings = await this.resolveAddSettings(...overrides)
      const { addOptions, qualityProfileId, rootFolderPath, tags, seriesType } =
        settings

      const show: SonarrPost = {
        title: item.title,
        tvdbId: extractTvdbId(item.guids),
        qualityProfileId,
        rootFolderPath,
        addOptions,
        languageProfileId: null,
        monitored: true,
        monitorNewItems: settings.monitorNewItems,
        tags,
        seriesType,
        seasonFolder: settings.seasonFolder,
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
      return this.addedSettings(settings, createdSeries)
    } catch (err) {
      this.log.debug(
        { error: err, title: item.title },
        'Send to Sonarr failed (rethrowing upstream)',
      )
      throw err
    }
  }

  /** Writes a new add's settings and monitor preset onto an existing series and searches it, keeping the root folder when it has files. */
  async reactivateInSonarr(
    existing: SonarrSeries,
    item: Item,
    ...overrides: SonarrAddOverrides
  ): Promise<ArrAddedSettings & { seriesId: number }> {
    const settings = await this.resolveAddSettings(...overrides)
    const { addOptions, tags, seriesType, seasonFolder } = settings
    const seriesId = existing.id
    const qualityProfileId = parseQualityProfileId(settings.qualityProfileId)
    // Missing statistics count as files, so an unknown series never moves root folder
    const hasFiles = existing.statistics?.episodeFileCount !== 0
    const rootFolderPath = hasFiles
      ? (existing.rootFolderPath ?? settings.rootFolderPath)
      : settings.rootFolderPath

    const edited = await this.client.put<SonarrSeries[]>('series/editor', {
      seriesIds: [seriesId],
      monitorNewItems: settings.monitorNewItems,
      ...(qualityProfileId !== undefined && { qualityProfileId }),
      seriesType,
      ...(seasonFolder !== undefined && { seasonFolder }),
      moveFiles: false,
      ...(tags.length > 0 && { tags: tags.map(Number), applyTags: 'add' }),
      ...(!hasFiles && { rootFolderPath }),
    })
    // Monitoring flips only here so a failed earlier write leaves the series dormant and retryable
    await this.client.post('seasonpass', {
      series: [{ id: seriesId, monitored: true }],
      monitoringOptions: { monitor: addOptions.monitor },
    })
    const searched =
      settings.shouldSearch &&
      (await this.searchBestEffort(item.title, {
        name: 'MissingEpisodeSearch',
        seriesId,
        monitored: true,
      }))

    const stored =
      edited?.find((series) => series.id === seriesId) ??
      (await this.client.get<SonarrSeries>(`series/${seriesId}`))
    this.log.info(
      {
        title: item.title,
        seriesId,
        qualityProfileId,
        rootFolder: rootFolderPath,
        seriesType,
        seasonMonitoring: addOptions.monitor,
        searched,
      },
      `Reactivated ${item.title} in Sonarr`,
    )
    return this.addedSettings(
      { ...settings, rootFolderPath },
      { ...stored, tags: tags.map(Number) },
    )
  }

  async deleteFromSonarr(item: Item, deleteFiles: boolean): Promise<void> {
    try {
      const sonarrId = extractSonarrId(item.guids)

      if (sonarrId > 0) {
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

  async getAllSeries(): Promise<SonarrSeries[]> {
    try {
      return await this.readLibrary()
    } catch (error) {
      this.log.error({ error }, 'Error fetching all series:')
      throw error
    }
  }

  /** Monitors the series and the season first when they are not, then searches the season. */
  async searchSeason(seriesId: number, seasonNumber: number): Promise<void> {
    try {
      const series = await this.client.get<SonarrSeries>(`series/${seriesId}`)

      const season = series.seasons?.find(
        (s) => s.seasonNumber === seasonNumber,
      )
      if (!season) {
        throw new Error(
          `Season ${seasonNumber} not found in series ${seriesId}`,
        )
      }

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

      if (needsUpdate) {
        await this.client.put(`series/${seriesId}`, series)
        this.log.debug(
          `Updated monitoring for series ${seriesId} season ${seasonNumber}`,
        )
      }

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

  async updateSeasonMonitoring(
    seriesId: number,
    seasonNumber: number,
    monitored: boolean,
  ): Promise<void> {
    try {
      const series = await this.client.get<SonarrSeries>(`series/${seriesId}`)

      if (!series.seasons) {
        throw new Error('Series has no seasons')
      }

      const seasonIndex = series.seasons.findIndex(
        (s) => s.seasonNumber === seasonNumber,
      )
      if (seasonIndex === -1) {
        throw new Error(`Season ${seasonNumber} not found`)
      }

      series.seasons[seasonIndex].monitored = monitored

      await this.client.put(`series/${seriesId}`, series)

      this.log.debug(
        `Updated monitoring for series ${seriesId} season ${seasonNumber} to ${monitored}`,
      )
    } catch (error) {
      this.log.error({ error }, 'Error updating season monitoring:')
      throw error
    }
  }

  async updateSeriesMonitoring(
    seriesId: number,
    updates: { monitored?: boolean; monitorNewItems?: 'all' | 'none' },
  ): Promise<void> {
    try {
      const series = await this.client.get<SonarrSeries>(`series/${seriesId}`)

      const updatedSeries = {
        ...series,
        ...updates,
      }

      await this.client.put(`series/${seriesId}`, updatedSeries)

      this.log.debug(`Updated series ${seriesId} monitoring settings`)
    } catch (error) {
      this.log.error({ error }, 'Error updating series monitoring:')
      throw error
    }
  }

  /** Sonarr re-applies the add's monitor preset until its post-add refresh clears addOptions, so this polls for that before episode changes. */
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

  /** Reads the indexed episode endpoint, which skips the costly statistics of the series endpoint. */
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

  async updateEpisodeMonitoring(
    episodeId: number,
    monitored: boolean,
  ): Promise<void> {
    try {
      const episode = await this.client.get<SonarrEpisode>(
        `episode/${episodeId}`,
      )

      episode.monitored = monitored

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

  async deleteEpisodeFile(episodeFileId: number): Promise<void> {
    try {
      await this.client.delete(`episodefile/${episodeFileId}`)

      this.log.debug(`Deleted episode file ${episodeFileId}`)
    } catch (error) {
      this.log.error({ error }, `Error deleting episode file ${episodeFileId}:`)
      throw error
    }
  }

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

        const failedIds = episodeFileIds.filter(
          (_, index) => results[index].status === 'rejected',
        )
        this.log.error({ failedIds }, 'Failed episode file IDs')

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
      if (
        error instanceof Error &&
        error.message.includes('Failed to delete')
      ) {
        throw error
      }

      this.log.error({ error }, 'Unexpected error deleting episode files:')
      throw error
    }
  }
}
