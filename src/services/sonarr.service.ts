import type { FastifyBaseLogger } from 'fastify'
import type { FastifyInstance } from 'fastify'
import type {
  SonarrAddOptions,
  SonarrPost,
  SonarrSeries,
  Item,
  SonarrConfiguration,
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
        series.tvdbId ? `tvdb://${series.tvdbId}` : undefined,
        `sonarr://${series.id}`,
      ].filter((x): x is string => !!x),
      type: 'show',
      ended: series.ended,
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

      let exclusions: SonarrSeries[] = []
      if (!bypass) {
        exclusions = await this.getFromSonarr<SonarrSeries[]>(
          baseUrl,
          apiKey,
          'importlistexclusion',
        )
      }

      return new Set([...shows, ...exclusions].map((show) => this.toItem(show)))
    } catch (err) {
      this.log.error(`Error fetching series: ${err}`)
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
        .find((guid) => guid.startsWith('tvdb://'))
        ?.replace('tvdb://', '')

      const show: SonarrPost = {
        title: item.title,
        tvdbId: tvdbId ? Number.parseInt(tvdbId, 10) : 0,
        qualityProfileId: config.sonarrQualityProfileId,
        rootFolderPath: config.sonarrRootFolder,
        addOptions,
        languageProfileId: config.sonarrLanguageProfileId,
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
      const showId = item.guids
        .find((guid) => guid.startsWith('sonarr://'))
        ?.replace('sonarr://', '')

      if (!showId) {
        this.log.warn(
          `Unable to extract Sonarr ID from show to delete: ${JSON.stringify(item)}`,
        )
        return
      }

      await this.deleteFromSonarrById(
        config.sonarrBaseUrl,
        config.sonarrApiKey,
        Number.parseInt(showId, 10),
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
