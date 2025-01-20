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
    private readonly config: FastifyInstance['config'],
  ) {}

  private toItem(series: SonarrSeries): Item {
    return {
      title: series.title,
      guids: [
        series.imdbId,
        series.tvdbId ? `tvdb:${series.tvdbId}` : undefined,
        `sonarr:${series.id}`,
      ].filter((x): x is string => !!x),
      type: 'show',
      ended: series.ended,
    }
  }

  async fetchQualityProfiles(
    apiKey: string,
    baseUrl: string,
  ): Promise<QualityProfile[]> {
    try {
      const profiles = await this.getFromSonarr<QualityProfile[]>(
        baseUrl,
        apiKey,
        'qualityprofile',
      )
      return profiles
    } catch (err) {
      this.log.error(`Error fetching quality profiles: ${err}`)
      throw err
    }
  }

  async fetchRootFolders(
    apiKey: string,
    baseUrl: string,
  ): Promise<RootFolder[]> {
    try {
      const rootFolders = await this.getFromSonarr<RootFolder[]>(
        baseUrl,
        apiKey,
        'rootfolder',
      )
      return rootFolders
    } catch (err) {
      this.log.error(`Error fetching root folders: ${err}`)
      throw err
    }
  }

  async fetchSeries(
    apiKey: string,
    baseUrl: string,
    bypass = false,
  ): Promise<Set<Item>> {
    try {
      const shows = await this.getFromSonarr<SonarrSeries[]>(
        baseUrl,
        apiKey,
        'series',
      )

      let exclusions: Set<Item> = new Set()
      if (!bypass) {
        exclusions = await this.fetchExclusions(apiKey, baseUrl)
      }

      const showItems = shows.map((show) => this.toItem(show))
      return new Set([...showItems, ...exclusions])
    } catch (err) {
      this.log.error(`Error fetching series: ${err}`)
      throw err
    }
  }

  async fetchExclusions(
    apiKey: string,
    baseUrl: string,
    pageSize = 1000,
  ): Promise<Set<Item>> {
    try {
      let currentPage = 1
      let totalRecords = 0
      const allExclusions: SonarrSeries[] = []

      do {
        const url = new URL(`${baseUrl}/api/v3/importlistexclusion/paged`)
        url.searchParams.append('page', currentPage.toString())
        url.searchParams.append('pageSize', pageSize.toString())
        url.searchParams.append('sortDirection', 'ascending')
        url.searchParams.append('sortKey', 'title')

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'X-Api-Key': apiKey,
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

      this.log.info(`Fetched all ${allExclusions.length} exclusions`)
      return new Set(allExclusions.map((show) => this.toItem(show)))
    } catch (err) {
      this.log.error(`Error fetching exclusions: ${err}`)
      throw err
    }
  }

  async addToSonarr(config: SonarrConfiguration, item: Item): Promise<void> {
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
        const rootFolders = await this.fetchRootFolders(
          config.sonarrApiKey,
          config.sonarrBaseUrl,
        )
        if (rootFolders.length === 0) {
          throw new Error('No root folders configured in Sonarr')
        }
        rootFolderPath = rootFolders[0].path
        this.log.info(`Using root folder: ${rootFolderPath}`)
      }
  
      let qualityProfileId = config.sonarrQualityProfileId
      const qualityProfiles = await this.fetchQualityProfiles(
        config.sonarrApiKey,
        config.sonarrBaseUrl,
      )
  
      if (qualityProfiles.length === 0) {
        throw new Error('No quality profiles configured in Sonarr')
      }
  
      if (config.sonarrQualityProfileId !== null) {
        if (typeof config.sonarrQualityProfileId === 'string') {
          const matchingProfile = qualityProfiles.find(
            profile => profile.name.toLowerCase() === config.sonarrQualityProfileId?.toString().toLowerCase()
          )
          
          if (matchingProfile) {
            qualityProfileId = matchingProfile.id
            this.log.info(
              `Using matched quality profile: ${matchingProfile.name} (ID: ${qualityProfileId})`,
            )
          } else {
            this.log.warn(
              `Could not find quality profile "${config.sonarrQualityProfileId}". Available profiles: ${qualityProfiles.map(p => p.name).join(', ')}`
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
  
      await this.postToSonarr<void>(
        config.sonarrBaseUrl,
        config.sonarrApiKey,
        'series',
        show,
      )
  
      this.log.info(`Sent ${item.title} to Sonarr`)
    } catch (err) {
      this.log.debug(
        `Received warning for sending ${item.title} to Sonarr: ${err}`,
      )
      throw err
    }
  }

  async deleteFromSonarr(
    config: SonarrConfiguration,
    item: Item,
    deleteFiles: boolean,
  ): Promise<void> {
    try {
      const sonarrGuid = item.guids.find((guid) => guid.startsWith('sonarr:'))
      const tvdbGuid = item.guids.find((guid) => guid.startsWith('tvdb:'))

      if (!sonarrGuid && !tvdbGuid) {
        this.log.warn(
          `Unable to extract ID from show to delete: ${JSON.stringify(item)}`,
        )
        return
      }

      let sonarrId: number
      if (sonarrGuid) {
        sonarrId = Number.parseInt(sonarrGuid.replace('sonarr:', ''), 10)
      } else {
        const tvdbId = tvdbGuid!.replace('tvdb:', '')
        const allSeries = await this.fetchSeries(
          config.sonarrApiKey,
          config.sonarrBaseUrl,
          true,
        )

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

      await this.deleteFromSonarrById(
        config.sonarrBaseUrl,
        config.sonarrApiKey,
        sonarrId,
        deleteFiles,
      )

      this.log.info(`Deleted ${item.title} from Sonarr`)
    } catch (err) {
      this.log.error(`Error deleting from Sonarr: ${err}`)
      throw err
    }
  }

  private async getFromSonarr<T>(
    baseUrl: string,
    apiKey: string,
    endpoint: string,
  ): Promise<T> {
    const url = new URL(`${baseUrl}/api/v3/${endpoint}`)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Sonarr API error: ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  private async postToSonarr<T>(
    baseUrl: string,
    apiKey: string,
    endpoint: string,
    payload: unknown,
  ): Promise<T> {
    const url = new URL(`${baseUrl}/api/v3/${endpoint}`)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
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
    baseUrl: string,
    apiKey: string,
    id: number,
    deleteFiles: boolean,
  ): Promise<void> {
    const url = new URL(`${baseUrl}/api/v3/series/${id}`)
    url.searchParams.append('deleteFiles', deleteFiles.toString())
    url.searchParams.append('addImportListExclusion', 'false')

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'X-Api-Key': apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Sonarr API error: ${response.statusText}`)
    }
  }
}
