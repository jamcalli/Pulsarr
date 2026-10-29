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
import {
  ArrExclusionIds,
  type ArrExclusions,
} from '@services/arr/arr-exclusion-ids.js'
import { RADARR } from '@services/arr/arr-product.js'
import {
  resolveQualityProfileId,
  resolveRootFolder,
} from '@services/arr/arr-profiles.js'
import { ArrService } from '@services/arr/arr-service.js'
import {
  extractRadarrId,
  extractTmdbId,
  normalizeGuid,
} from '@utils/guid-handler.js'
import { findQualityProfileName } from '@utils/quality-profile.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

const MOVIE_LIBRARY_ENDPOINT = 'movie?excludeLocalCovers=true'

export class RadarrService extends ArrService<RadarrInstance, RadarrMovie> {
  private config: RadarrConfiguration | null = null
  private readonly exclusions = new ArrExclusionIds(() =>
    this.fetchExclusions(),
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
      return await this.client.get<RadarrMovie[]>(MOVIE_LIBRARY_ENDPOINT)
    } catch (error) {
      this.log.error({ error }, 'Error fetching all movies:')
      throw error
    }
  }

  async fetchMovies(bypass = false): Promise<Set<Item>> {
    try {
      const movies = await this.client.get<RadarrMovie[]>(
        MOVIE_LIBRARY_ENDPOINT,
      )
      const exclusions = bypass ? [] : await this.exclusions.items()
      return new Set([
        ...movies.map((movie) => this.toItem(movie)),
        ...exclusions.map((item) => ({ ...item, isExclusion: true })),
      ])
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching movies')
      throw err
    }
  }

  isTmdbIdExcluded(tmdbId: number): Promise<boolean> {
    return this.exclusions.has(tmdbId)
  }

  private async fetchExclusions(): Promise<ArrExclusions<Item>> {
    try {
      const exclusions = await this.client.getAllPages<RadarrExclusion>(
        'exclusions/paged',
        'movieTitle',
      )
      this.log.debug(`Fetched all movie exclusions (${exclusions.length})`)
      return {
        items: exclusions.map((record) =>
          this.toItem({
            title: record.movieTitle,
            imdbId: undefined,
            tmdbId: record.tmdbId,
            id: record.id,
          }),
        ),
        ids: new Set(
          exclusions.map((record) => record.tmdbId).filter((id) => id > 0),
        ),
      }
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

      const tmdbId = extractTmdbId(item.guids)
      if (tmdbId === 0) {
        this.log.warn(
          `Unable to extract TMDB ID from movie to delete: ${JSON.stringify(item)}`,
        )
        return
      }

      const movie = await this.findInLibrary(tmdbId)
      if (!movie) {
        throw new Error(`Could not find movie with TMDB ID: ${tmdbId}`)
      }

      await this.deleteFromRadarrById(movie.id, deleteFiles)
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
}
