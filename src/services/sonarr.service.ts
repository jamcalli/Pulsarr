import type { FastifyBaseLogger } from 'fastify'
import type { FastifyInstance } from 'fastify'
import type {
  SonarrAddOptions,
  SonarrPost,
  SonarrSeries,
  Item,
  SonarrConfiguration,
  PagedResult,
  RootFolder,
  QualityProfile,
} from '@root/types/sonarr.types.js'

export class SonarrService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  private get sonarrConfig(): SonarrConfiguration {
    return {
      sonarrBaseUrl: this.fastify.config.sonarrBaseUrl,
      sonarrApiKey: this.fastify.config.sonarrApiKey,
      sonarrQualityProfileId: this.fastify.config.sonarrQualityProfile,
      sonarrLanguageProfileId: 1,
      sonarrRootFolder: this.fastify.config.sonarrRootFolder,
      sonarrTagIds: this.fastify.config.sonarrTags,
      sonarrSeasonMonitoring: this.fastify.config.sonarrSeasonMonitoring,
    }
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
        series.imdbId,
        series.tvdbId ? `tvdb:${series.tvdbId}` : undefined,
        `sonarr:${series.id}`,
      ].filter((x): x is string => !!x),
      type: 'show',
      ended: series.ended,
      added: series.added,
      status: hasEpisodes ? 'grabbed' : 'requested',
      series_status: series.ended ? 'ended' : 'continuing',
    }
  }

  async fetchQualityProfiles(): Promise<QualityProfile[]> {
    try {
      const profiles =
        await this.getFromSonarr<QualityProfile[]>('qualityprofile')
      return profiles
    } catch (err) {
      this.log.error(`Error fetching quality profiles: ${err}`)
      throw err
    }
  }

  async fetchRootFolders(): Promise<RootFolder[]> {
    try {
      const rootFolders = await this.getFromSonarr<RootFolder[]>('rootfolder')
      return rootFolders
    } catch (err) {
      this.log.error(`Error fetching root folders: ${err}`)
      throw err
    }
  }

  async fetchSeries(bypass = false): Promise<Set<Item>> {
    try {
      const shows = await this.getFromSonarr<SonarrSeries[]>('series')

      let exclusions: Set<Item> = new Set()
      if (!bypass) {
        exclusions = await this.fetchExclusions()
      }

      const showItems = shows.map((show) => this.toItem(show))
      return new Set([...showItems, ...exclusions])
    } catch (err) {
      this.log.error(`Error fetching series: ${err}`)
      throw err
    }
  }

  async fetchExclusions(pageSize = 1000): Promise<Set<Item>> {
    const config = this.sonarrConfig
    try {
      let currentPage = 1
      let totalRecords = 0
      const allExclusions: SonarrSeries[] = []

      do {
        const url = new URL(
          `${config.sonarrBaseUrl}/api/v3/importlistexclusion/paged`,
        )
        url.searchParams.append('page', currentPage.toString())
        url.searchParams.append('pageSize', pageSize.toString())
        url.searchParams.append('sortDirection', 'ascending')
        url.searchParams.append('sortKey', 'title')

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'X-Api-Key': config.sonarrApiKey,
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`Sonarr API error: ${response.statusText}`)
        }

        const pagedResult = (await response.json()) as PagedResult<SonarrSeries>
        totalRecords = pagedResult.totalRecords
        allExclusions.push(...pagedResult.records)

        this.log.debug(
          `Fetched page ${currentPage} of exclusions (${pagedResult.records.length} records)`,
        )
        currentPage++
      } while (allExclusions.length < totalRecords)

      this.log.info(`Fetched all show ${allExclusions.length} exclusions`)
      return new Set(allExclusions.map((show) => this.toItem(show)))
    } catch (err) {
      this.log.error(`Error fetching exclusions: ${err}`)
      throw err
    }
  }

  async addToSonarr(item: Item): Promise<void> {
    const config = this.sonarrConfig
    try {
      const addOptions: SonarrAddOptions = {
        monitor: config.sonarrSeasonMonitoring,
        searchForCutoffUnmetEpisodes: true,
        searchForMissingEpisodes: true,
      }

      const tvdbId = item.guids
        .find((guid) => guid.startsWith('tvdb:'))
        ?.replace('tvdb:', '')

      let rootFolderPath = config.sonarrRootFolder
      if (!rootFolderPath) {
        const rootFolders = await this.fetchRootFolders()
        if (rootFolders.length === 0) {
          throw new Error('No root folders configured in Sonarr')
        }
        rootFolderPath = rootFolders[0].path
        this.log.info(`Using root folder: ${rootFolderPath}`)
      }

      let qualityProfileId = config.sonarrQualityProfileId
      const qualityProfiles = await this.fetchQualityProfiles()

      if (qualityProfiles.length === 0) {
        throw new Error('No quality profiles configured in Sonarr')
      }

      if (config.sonarrQualityProfileId !== null) {
        if (typeof config.sonarrQualityProfileId === 'string') {
          const matchingProfile = qualityProfiles.find(
            (profile) =>
              profile.name.toLowerCase() ===
              config.sonarrQualityProfileId?.toString().toLowerCase(),
          )

          if (matchingProfile) {
            qualityProfileId = matchingProfile.id
            this.log.info(
              `Using matched quality profile: ${matchingProfile.name} (ID: ${qualityProfileId})`,
            )
          } else {
            this.log.warn(
              `Could not find quality profile "${config.sonarrQualityProfileId}". Available profiles: ${qualityProfiles.map((p) => p.name).join(', ')}`,
            )
            qualityProfileId = qualityProfiles[0].id
            this.log.info(
              `Falling back to first quality profile: ${qualityProfiles[0].name} (ID: ${qualityProfileId})`,
            )
          }
        } else if (typeof config.sonarrQualityProfileId === 'number') {
          qualityProfileId = config.sonarrQualityProfileId
        }
      }

      if (!qualityProfileId) {
        qualityProfileId = qualityProfiles[0].id
        this.log.info(
          `Using default quality profile: ${qualityProfiles[0].name} (ID: ${qualityProfileId})`,
        )
      }

      const show: SonarrPost = {
        title: item.title,
        tvdbId: tvdbId ? Number.parseInt(tvdbId, 10) : 0,
        qualityProfileId,
        rootFolderPath,
        addOptions,
        languageProfileId: null,
        monitored: true,
        tags: config.sonarrTagIds,
      }

      await this.postToSonarr<void>('series', show)
      this.log.info(`Sent ${item.title} to Sonarr`)
    } catch (err) {
      this.log.debug(
        `Received warning for sending ${item.title} to Sonarr: ${err}`,
      )
      throw err
    }
  }

  async deleteFromSonarr(item: Item, deleteFiles: boolean): Promise<void> {
    const config = this.sonarrConfig
    try {
      const sonarrGuid = item.guids.find((guid) => guid.startsWith('sonarr:'))
      const tvdbGuid = item.guids.find((guid) => guid.startsWith('tvdb:'))

      if (!sonarrGuid && !tvdbGuid) {
        this.log.warn(
          `Unable to extract ID from show to delete: ${JSON.stringify(item)}`,
        )
        return
      }

      let sonarrId: number | undefined

      if (sonarrGuid) {
        sonarrId = Number.parseInt(sonarrGuid.replace('sonarr:', ''), 10)
      } else if (tvdbGuid) {
        const tvdbId = tvdbGuid.replace('tvdb:', '')
        const allSeries = await this.fetchSeries(true)
        const matchingSeries = [...allSeries].find((show) =>
          show.guids.some(
            (guid) =>
              guid.startsWith('tvdb:') && guid.replace('tvdb:', '') === tvdbId,
          ),
        )
        if (!matchingSeries) {
          throw new Error(`Could not find show with TVDB ID: ${tvdbId}`)
        }
        const matchingSonarrGuid = matchingSeries.guids.find((guid) =>
          guid.startsWith('sonarr:'),
        )
        if (!matchingSonarrGuid) {
          throw new Error('Could not find Sonarr ID for show')
        }
        sonarrId = Number.parseInt(
          matchingSonarrGuid.replace('sonarr:', ''),
          10,
        )
      }

      if (sonarrId === undefined || Number.isNaN(sonarrId)) {
        throw new Error('Failed to obtain valid Sonarr ID')
      }

      await this.deleteFromSonarrById(sonarrId, deleteFiles)
      this.log.info(`Deleted ${item.title} from Sonarr`)
    } catch (err) {
      this.log.error(`Error deleting from Sonarr: ${err}`)
      throw err
    }
  }

  private async getFromSonarr<T>(endpoint: string): Promise<T> {
    const config = this.sonarrConfig
    const url = new URL(`${config.sonarrBaseUrl}/api/v3/${endpoint}`)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Api-Key': config.sonarrApiKey,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Sonarr API error: ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  private async postToSonarr<T>(
    endpoint: string,
    payload: unknown,
  ): Promise<T> {
    const config = this.sonarrConfig
    const url = new URL(`${config.sonarrBaseUrl}/api/v3/${endpoint}`)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'X-Api-Key': config.sonarrApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Sonarr API error: ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  private async deleteFromSonarrById(
    id: number,
    deleteFiles: boolean,
  ): Promise<void> {
    const config = this.sonarrConfig
    const url = new URL(`${config.sonarrBaseUrl}/api/v3/series/${id}`)
    url.searchParams.append('deleteFiles', deleteFiles.toString())
    url.searchParams.append('addImportListExclusion', 'false')

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'X-Api-Key': config.sonarrApiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Sonarr API error: ${response.statusText}`)
    }
  }
}
