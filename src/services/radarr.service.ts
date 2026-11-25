import type {
  MinimumAvailability,
  RadarrMonitorType,
} from '@root/schemas/radarr/add-options.schema.js'
import type {
  ArrQualityProfile,
  ArrTag,
} from '@root/types/arr-connection.types.js'
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
  type ArrCaches,
  type ArrExclusions,
  readArrCache,
} from '@services/arr/arr-caches.js'
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
import {
  findQualityProfileName,
  parseQualityProfileId,
} from '@utils/quality-profile.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

const MOVIE_LIBRARY_ENDPOINT = 'movie?excludeLocalCovers=true'

type RadarrAddOverrides = [
  overrideRootFolder?: string,
  overrideQualityProfileId?: number | string | null,
  overrideTags?: string[],
  overrideSearchOnAdd?: boolean | null,
  overrideMinimumAvailability?: MinimumAvailability,
  overrideMonitor?: RadarrMonitorType | null,
]

interface RadarrAddSettings {
  addOptions: RadarrAddOptions
  rootFolderPath: string
  qualityProfiles: ArrQualityProfile[]
  qualityProfileId: number | string | null
  tags: string[]
  existingTags: ArrTag[]
  minimumAvailability: MinimumAvailability
  monitored: boolean
}

/** Unmonitored with no file, so nothing in Radarr will ever deliver it. */
export function isDormantMovie(movie: RadarrMovie): boolean {
  return movie.monitored === false && movie.hasFile === false
}

export class RadarrService extends ArrService<RadarrInstance, RadarrMovie> {
  private config: RadarrConfiguration | null = null

  constructor(
    baseLog: FastifyBaseLogger,
    appBaseUrl: string,
    port: number,
    fastify: FastifyInstance,
    private readonly caches: ArrCaches<RadarrMovie, Item>,
  ) {
    super(RADARR, baseLog, appBaseUrl, port, fastify, caches)
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

  isDormant(movie: RadarrMovie): Promise<boolean> {
    return Promise.resolve(isDormantMovie(movie))
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

  private readLibrary(): Promise<RadarrMovie[]> {
    return readArrCache(
      this.caches.library,
      this.context,
      () => this.client.get<RadarrMovie[]>(MOVIE_LIBRARY_ENDPOINT),
      { fresh: true },
    )
  }

  private readExclusions(): Promise<ArrExclusions<Item>> {
    return readArrCache(this.caches.exclusions, this.context, () =>
      this.fetchExclusions(),
    )
  }

  async getAllMovies(): Promise<RadarrMovie[]> {
    try {
      return await this.readLibrary()
    } catch (error) {
      this.log.error({ error }, 'Error fetching all movies:')
      throw error
    }
  }

  async fetchMovies(bypass = false): Promise<Set<Item>> {
    try {
      const movies = await this.readLibrary()
      const exclusions = bypass ? [] : (await this.readExclusions()).items
      return new Set([
        ...movies.map((movie) => this.toItem(movie)),
        ...exclusions.map((item) => ({ ...item, isExclusion: true })),
      ])
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching movies')
      throw err
    }
  }

  async isTmdbIdExcluded(tmdbId: number): Promise<boolean> {
    return (await this.readExclusions()).ids.has(tmdbId)
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

  private async resolveAddSettings(
    ...[
      overrideRootFolder,
      overrideQualityProfileId,
      overrideTags,
      overrideSearchOnAdd,
      overrideMinimumAvailability,
      overrideMonitor,
    ]: RadarrAddOverrides
  ): Promise<RadarrAddSettings> {
    const config = this.radarrConfig
    const addOptions: RadarrAddOptions = {
      searchForMovie:
        overrideSearchOnAdd !== undefined && overrideSearchOnAdd !== null
          ? overrideSearchOnAdd
          : config.searchOnAdd !== undefined
            ? config.searchOnAdd
            : true,
      monitor: overrideMonitor ?? config.monitor ?? 'movieOnly',
    }

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

    const { ids: tags, existing: existingTags } = await this.tags.resolveForAdd(
      overrideTags,
      config.radarrTagIds,
    )

    return {
      addOptions,
      rootFolderPath,
      qualityProfiles,
      qualityProfileId,
      tags,
      existingTags,
      minimumAvailability:
        overrideMinimumAvailability ||
        config.minimumAvailability ||
        ('released' as MinimumAvailability),
      monitored: addOptions.monitor !== 'none',
    }
  }

  private addedSettings(
    settings: RadarrAddSettings,
    stored: RadarrMovie | undefined,
  ): ArrAddedSettings {
    const qualityProfileId =
      stored?.qualityProfileId ?? settings.qualityProfileId
    const labelById = new Map(settings.existingTags.map((t) => [t.id, t.label]))
    return {
      rootFolder: stored?.rootFolderPath ?? settings.rootFolderPath,
      qualityProfileId,
      qualityProfileName: findQualityProfileName(
        settings.qualityProfiles,
        qualityProfileId,
      ),
      tags: (stored?.tags ?? settings.tags.map(Number)).map(
        (id) => labelById.get(id) ?? String(id),
      ),
    }
  }

  async addToRadarr(
    item: Item,
    ...overrides: RadarrAddOverrides
  ): Promise<ArrAddedSettings> {
    try {
      const settings = await this.resolveAddSettings(...overrides)
      const { addOptions, qualityProfileId, rootFolderPath, tags } = settings

      const movie: RadarrPost = {
        title: item.title,
        tmdbId: extractTmdbId(item.guids),
        qualityProfileId,
        rootFolderPath,
        addOptions,
        tags,
        minimumAvailability: settings.minimumAvailability,
        monitored: settings.monitored,
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
      return this.addedSettings(settings, created)
    } catch (err) {
      this.log.debug(
        { error: err, title: item.title },
        'Send to Radarr failed (rethrowing upstream)',
      )
      throw err
    }
  }

  /** Writes a new add's settings onto an existing movie and searches it, and the movieAndCollection option monitors the movie only. */
  async reactivateInRadarr(
    existing: RadarrMovie,
    item: Item,
    ...overrides: RadarrAddOverrides
  ): Promise<ArrAddedSettings> {
    const movieId = existing.id
    const settings = await this.resolveAddSettings(...overrides)
    const { addOptions, rootFolderPath, tags } = settings
    const qualityProfileId = parseQualityProfileId(settings.qualityProfileId)

    const edited = await this.client.put<RadarrMovie[]>('movie/editor', {
      movieIds: [movieId],
      monitored: settings.monitored,
      ...(qualityProfileId !== undefined && { qualityProfileId }),
      minimumAvailability: settings.minimumAvailability,
      rootFolderPath,
      moveFiles: false,
      ...(tags.length > 0 && { tags: tags.map(Number), applyTags: 'add' }),
    })
    const stored =
      edited?.find((movie) => movie.id === movieId) ??
      (await this.client.get<RadarrMovie>(`movie/${movieId}`))

    // A manual MoviesSearch skips Radarr's availability check
    const searched = addOptions.searchForMovie && stored.isAvailable === true
    if (searched) {
      await this.client.post('command', {
        name: 'MoviesSearch',
        movieIds: [movieId],
      })
    }
    this.log.info(
      {
        title: item.title,
        movieId,
        qualityProfileId,
        rootFolder: rootFolderPath,
        minimumAvailability: settings.minimumAvailability,
        monitored: settings.monitored,
        searched,
      },
      `Reactivated ${item.title} in Radarr`,
    )
    return this.addedSettings(settings, {
      ...stored,
      tags: tags.map(Number),
    })
  }

  async deleteFromRadarr(item: Item, deleteFiles: boolean): Promise<void> {
    try {
      const radarrId = extractRadarrId(item.guids)

      if (radarrId > 0) {
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
