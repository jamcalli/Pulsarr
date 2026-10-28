import type {
  MinimumAvailability,
  RadarrMonitorType,
} from '@root/schemas/radarr/add-options.schema.js'
import type {
  Item,
  RadarrAddOptions,
  RadarrConfiguration,
  RadarrExclusion,
  RadarrInstance,
  RadarrMovie,
  RadarrPost,
  RadarrTagDetail,
} from '@root/types/radarr.types.js'
import type { ArrAddedSettings } from '@root/types/router.types.js'
import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import { ArrExclusionIds } from '@services/arr/arr-exclusion-ids.js'
import { RADARR } from '@services/arr/arr-product.js'
import {
  resolveQualityProfileId,
  resolveRootFolder,
} from '@services/arr/arr-profiles.js'
import { ArrService } from '@services/arr/arr-service.js'
import { errorMessage } from '@utils/error-message.js'
import {
  extractRadarrId,
  extractTmdbId,
  hasMatchingGuids,
  normalizeGuid,
} from '@utils/guid-handler.js'
import { findQualityProfileName } from '@utils/quality-profile.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'

const BULK_TAG_CONCURRENCY = 4

export class RadarrService extends ArrService<RadarrInstance> {
  private config: RadarrConfiguration | null = null
  private readonly exclusionTmdbIds = new ArrExclusionIds(() =>
    this.fetchExclusionTmdbIds(),
  )

  constructor(
    baseLog: FastifyBaseLogger,
    appBaseUrl: string,
    port: number,
    fastify: FastifyInstance,
  ) {
    super(RADARR, baseLog, appBaseUrl, port, fastify)
  }

  protected applyInstance(instance: RadarrInstance): void {
    this.config = {
      radarrQualityProfileId: instance.qualityProfile || null,
      radarrRootFolder: instance.rootFolder || null,
      radarrTagIds: instance.tags,
      searchOnAdd:
        instance.searchOnAdd !== undefined ? instance.searchOnAdd : true,
      minimumAvailability: instance.minimumAvailability || 'released',
      monitor: instance.monitor || 'movieOnly',
    }
  }

  private get radarrConfig(): RadarrConfiguration {
    if (!this.config) {
      throw new Error('Radarr service not initialized')
    }
    return this.config
  }

  private toItem(movie: RadarrMovie): Item {
    return {
      title: movie.title,
      guids: [
        movie.imdbId ? normalizeGuid(`imdb:${movie.imdbId}`) : undefined,
        movie.tmdbId ? normalizeGuid(`tmdb:${movie.tmdbId}`) : undefined,
        normalizeGuid(`radarr:${movie.id}`),
      ].filter((x): x is string => !!x),
      type: 'movie',
      ended: undefined,
      added: movie.added,
      status: movie.hasFile ? 'grabbed' : 'requested',
      movie_status: movie.isAvailable ? 'available' : 'unavailable',
      tags: movie.tags,
    }
  }

  async getAllMovies(): Promise<RadarrMovie[]> {
    try {
      return await this.client.get<RadarrMovie[]>('movie')
    } catch (error) {
      this.log.error({ error }, 'Error fetching all movies:')
      throw error
    }
  }

  async fetchMovies(bypass = false): Promise<Set<Item>> {
    try {
      const movies = await this.client.get<RadarrMovie[]>('movie')

      let exclusions: Set<Item> = new Set()
      if (!bypass) {
        exclusions = await this.fetchExclusions()
      }

      const movieItems = movies.map((movie) => this.toItem(movie))

      // Mark exclusions so they can be filtered out from tagging
      const exclusionItems = Array.from(exclusions).map((item) => ({
        ...item,
        isExclusion: true,
      }))

      const allItems = [...movieItems, ...exclusionItems]

      return new Set(allItems)
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching movies')
      throw err
    }
  }

  /**
   * Check if a movie exists in Radarr using efficient lookup
   * @param tmdbId - The TMDB ID to check
   * @returns Promise resolving to ExistenceCheckResult with availability info
   */
  async movieExistsByTmdbId(tmdbId: number): Promise<ExistenceCheckResult> {
    try {
      const movies = await this.client.get<RadarrMovie[]>(
        `movie/lookup?term=tmdb:${tmdbId}`,
      )

      // Movie exists if it has a valid internal ID (> 0)
      const found = movies.length > 0 && movies[0].id > 0

      return {
        found,
        checked: true,
        serviceName: 'Radarr',
      }
    } catch (err) {
      this.log.error(
        { error: err, tmdbId },
        'Error checking movie existence for TMDB',
      )
      return {
        found: false,
        checked: false,
        serviceName: 'Radarr',
        error: errorMessage(err),
      }
    }
  }

  isTmdbIdExcluded(tmdbId: number): Promise<boolean> {
    return this.exclusionTmdbIds.has(tmdbId)
  }

  private async fetchExclusionTmdbIds(): Promise<Set<number>> {
    const ids = new Set<number>()
    for (const item of await this.fetchExclusions()) {
      const id = extractTmdbId(item.guids)
      if (id) ids.add(id)
    }
    return ids
  }

  async fetchExclusions(): Promise<Set<Item>> {
    try {
      const exclusions = await this.client.getAllPages<RadarrExclusion>(
        'exclusions/paged',
        'movieTitle',
      )
      this.log.debug(`Fetched all movie exclusions (${exclusions.length})`)
      return new Set(
        exclusions.map((record) =>
          this.toItem({
            title: record.movieTitle,
            imdbId: undefined,
            tmdbId: record.tmdbId,
            id: record.id,
          }),
        ),
      )
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching exclusions')
      throw err
    }
  }

  async addToRadarr(
    item: Item,
    overrideRootFolder?: string,
    overrideQualityProfileId?: number | string | null,
    overrideTags?: string[],
    overrideSearchOnAdd?: boolean | null,
    overrideMinimumAvailability?: MinimumAvailability,
    overrideMonitor?: RadarrMonitorType | null,
  ): Promise<ArrAddedSettings> {
    const config = this.radarrConfig
    try {
      const addOptions: RadarrAddOptions = {
        searchForMovie:
          overrideSearchOnAdd !== undefined && overrideSearchOnAdd !== null
            ? overrideSearchOnAdd
            : config.searchOnAdd !== undefined
              ? config.searchOnAdd
              : true, // Default to true for backward compatibility
        monitor: overrideMonitor ?? config.monitor ?? 'movieOnly',
      }

      const tmdbId = extractTmdbId(item.guids)

      const rootFolderPath = await resolveRootFolder(
        this.context,
        config.radarrRootFolder,
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
              config.radarrQualityProfileId,
            )

      const { ids: tags, existing: existingTags } =
        await this.tags.resolveForAdd(overrideTags, config.radarrTagIds)

      // When monitor is 'none', the movie should not be monitored
      const shouldMonitor = addOptions.monitor !== 'none'

      const movie: RadarrPost = {
        title: item.title,
        tmdbId,
        qualityProfileId,
        rootFolderPath,
        addOptions,
        tags,
        minimumAvailability:
          overrideMinimumAvailability ||
          config.minimumAvailability ||
          ('released' as MinimumAvailability),
        monitored: shouldMonitor,
      }

      const created = await this.client.post<RadarrMovie>('movie', movie)
      this.log.debug(
        {
          title: item.title,
          qualityProfileId,
          rootFolder: rootFolderPath,
          tags: tags.length > 0 ? tags : undefined,
          searchOnAdd: addOptions.searchForMovie,
          minimumAvailability: movie.minimumAvailability,
          monitor: addOptions.monitor,
          monitored: movie.monitored,
        },
        `Sent ${item.title} to Radarr`,
      )
      const labelById = new Map(existingTags.map((t) => [t.id, t.label]))
      return {
        rootFolder: created?.rootFolderPath ?? rootFolderPath,
        qualityProfileId: created?.qualityProfileId ?? qualityProfileId,
        qualityProfileName: findQualityProfileName(
          qualityProfiles,
          created?.qualityProfileId ?? qualityProfileId,
        ),
        tags: (created?.tags ?? tags.map(Number)).map(
          (id) => labelById.get(id) ?? String(id),
        ),
      }
    } catch (err) {
      this.log.debug(
        { error: err, title: item.title },
        'Send to Radarr failed (rethrowing upstream)',
      )
      throw err
    }
  }

  async deleteFromRadarr(item: Item, deleteFiles: boolean): Promise<void> {
    try {
      const radarrId = extractRadarrId(item.guids)

      if (radarrId > 0) {
        // Use the extracted Radarr ID directly
        await this.deleteFromRadarrById(radarrId, deleteFiles)
        this.log.debug(`Deleted ${item.title} from Radarr`)
        return
      }

      // Fallback: try to find by TMDB ID
      const tmdbId = extractTmdbId(item.guids)
      if (tmdbId === 0) {
        this.log.warn(
          `Unable to extract TMDB ID from movie to delete: ${JSON.stringify(item)}`,
        )
        return
      }

      const allMovies = await this.fetchMovies(true)
      const matchingMovie = [...allMovies].find((movie) =>
        hasMatchingGuids(movie.guids, [`tmdb:${tmdbId}`]),
      )

      if (!matchingMovie) {
        throw new Error(`Could not find movie with TMDB ID: ${tmdbId}`)
      }

      const matchingRadarrId = extractRadarrId(matchingMovie.guids)
      if (matchingRadarrId === 0) {
        throw new Error('Could not find Radarr ID for movie')
      }

      await this.deleteFromRadarrById(matchingRadarrId, deleteFiles)
      this.log.debug(`Deleted ${item.title} from Radarr`)
    } catch (err) {
      this.log.error({ error: err }, 'Error deleting from Radarr')
      throw err
    }
  }

  private async deleteFromRadarrById(
    id: number,
    deleteFiles: boolean,
  ): Promise<void> {
    await this.client.delete(
      `movie/${id}?deleteFiles=${deleteFiles}&addImportExclusion=false`,
    )
  }

  getTagDetails(): Promise<RadarrTagDetail[]> {
    return this.client.get<RadarrTagDetail[]>('tag/detail')
  }

  /**
   * Bulk update tags for multiple movies using the movieeditor endpoint
   * This provides significant performance improvements over individual updates
   *
   * @param updates Array of movie updates containing movieId and tagIds
   * @returns Promise resolving when all updates are complete
   */
  async bulkUpdateMovieTags(
    updates: Array<{ movieId: number; tagIds: number[] }>,
    applyTags: 'add' | 'remove' | 'replace' = 'replace',
  ): Promise<void> {
    if (updates.length === 0) {
      return
    }

    try {
      // Group updates by identical tag sets for efficiency
      const tagGroups = new Map<string, number[]>()

      for (const update of updates) {
        // Create a key from sorted tag IDs for grouping
        const tagKey = [...new Set(update.tagIds)].sort().join(',')
        if (!tagGroups.has(tagKey)) {
          tagGroups.set(tagKey, [])
        }
        tagGroups.get(tagKey)?.push(update.movieId)
      }

      // Process each tag group as a bulk operation with concurrency limit
      const limit = pLimit(BULK_TAG_CONCURRENCY)
      const promises = Array.from(tagGroups.entries()).map(
        ([tagKey, movieIds]) =>
          limit(async () => {
            const tagIds =
              tagKey === ''
                ? []
                : tagKey.split(',').map((id) => Number.parseInt(id, 10))

            const payload = {
              movieIds: movieIds,
              tags: tagIds,
              applyTags,
            }

            await this.client.put('movie/editor', payload)

            this.log.debug(
              `Bulk updated ${movieIds.length} movies with tags [${tagIds.join(', ')}] (mode: ${applyTags})`,
            )
          }),
      )

      await Promise.all(promises)

      this.log.debug(
        `Bulk updated tags for ${updates.length} movies across ${tagGroups.size} tag groups (mode: ${applyTags})`,
      )
    } catch (error) {
      this.log.error({ error }, 'Failed to bulk update movie tags:')
      throw error
    }
  }
}
