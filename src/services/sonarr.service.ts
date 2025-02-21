import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  SonarrAddOptions,
  SonarrPost,
  SonarrSeries,
  SonarrItem as Item,
  SonarrConfiguration,
  PagedResult,
  RootFolder,
  QualityProfile,
  SonarrInstance,
  ConnectionTestResult,
  PingResponse,
  WebhookNotification,
} from '@root/types/sonarr.types.js'

export class SonarrService {
  private config: SonarrConfiguration | null = null
  private webhookInitialized = false

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly appBaseUrl: string,
    private readonly port: number,
    private readonly fastify: FastifyInstance,
  ) {}

  private get sonarrConfig(): SonarrConfiguration {
    if (!this.config) {
      throw new Error('Sonarr service not initialized')
    }
    return this.config
  }

  private constructWebhookUrl(): string {
    const url = new URL(this.appBaseUrl)
    url.port = this.port.toString()
    url.pathname = '/v1/notifications/webhook'
    return url.toString()
  }

  private async setupWebhook(): Promise<void> {
    if (this.webhookInitialized) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))

    try {
      const expectedWebhookUrl = this.constructWebhookUrl()
      this.log.info(
        `Credentials verified, attempting to setup webhook with URL for Sonarr: ${expectedWebhookUrl}`,
      )

      const existingWebhooks =
        await this.getFromSonarr<WebhookNotification[]>('notification')
      const existingPulsarrWebhook = existingWebhooks.find(
        (hook) => hook.name === 'Pulsarr',
      )

      if (existingPulsarrWebhook) {
        const currentWebhookUrl = existingPulsarrWebhook.fields.find(
          (field) => field.name === 'url',
        )?.value

        if (currentWebhookUrl === expectedWebhookUrl) {
          this.log.info('Pulsarr Sonarr webhook exists with correct URL')
          return
        }

        this.log.info(
          'Pulsarr webhook URL mismatch, recreating webhook for Sonarr',
        )
        await this.deleteNotification(existingPulsarrWebhook.id)
      }

      const webhookConfig = {
        onGrab: false,
        onDownload: false,
        onUpgrade: false,
        onImportComplete: true,
        onRename: false,
        onSeriesAdd: false,
        onSeriesDelete: false,
        onEpisodeFileDelete: false,
        onEpisodeFileDeleteForUpgrade: false,
        onHealthIssue: false,
        includeHealthWarnings: false,
        onHealthRestored: false,
        onApplicationUpdate: false,
        onManualInteractionRequired: false,
        supportsOnGrab: true,
        supportsOnDownload: true,
        supportsOnUpgrade: true,
        supportsOnImportComplete: true,
        supportsOnRename: true,
        supportsOnSeriesAdd: true,
        supportsOnSeriesDelete: true,
        supportsOnEpisodeFileDelete: true,
        supportsOnEpisodeFileDeleteForUpgrade: true,
        supportsOnHealthIssue: true,
        supportsOnHealthRestored: true,
        supportsOnApplicationUpdate: true,
        supportsOnManualInteractionRequired: true,
        name: 'Pulsarr',
        fields: [
          {
            order: 0,
            name: 'url',
            label: 'Webhook URL',
            value: expectedWebhookUrl,
            type: 'url',
            advanced: false,
          },
          {
            order: 1,
            name: 'method',
            label: 'Method',
            value: 1,
            type: 'select',
            advanced: false,
          },
        ],
        implementationName: 'Webhook',
        implementation: 'Webhook',
        configContract: 'WebhookSettings',
        infoLink: 'https://wiki.servarr.com/sonarr/supported#webhook',
        tags: [],
      }

      try {
        const response = await this.postToSonarr('notification', webhookConfig)
        this.log.info(
          `Successfully created Pulsarr webhook with URL for Sonarr: ${expectedWebhookUrl}`,
        )
        this.log.debug('Webhook creation response:', response)
      } catch (createError) {
        this.log.error(
          'Error creating webhook for Sonarr. Full config:',
          webhookConfig,
        )
        this.log.error('Creation error details for Sonarr:', createError)
        throw createError
      }
      this.webhookInitialized = true
    } catch (error) {
      this.log.error('Failed to setup webhook for Sonarr:', error)
      throw error
    }
  }

  async removeWebhook(): Promise<void> {
    try {
      const existingWebhooks =
        await this.getFromSonarr<WebhookNotification[]>('notification')
      const pulsarrWebhook = existingWebhooks.find(
        (hook) => hook.name === 'Pulsarr',
      )

      if (pulsarrWebhook) {
        await this.deleteNotification(pulsarrWebhook.id)
        this.log.info('Successfully removed Pulsarr webhook for Sonarr')
      }
    } catch (error) {
      this.log.error('Failed to remove webhook for Sonarr:', error)
      throw error
    }
  }

  private async deleteNotification(notificationId: number): Promise<void> {
    const config = this.sonarrConfig
    const url = new URL(
      `${config.sonarrBaseUrl}/api/v3/notification/${notificationId}`,
    )

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

  async initialize(instance: SonarrInstance): Promise<void> {
    try {
      if (!instance.baseUrl || !instance.apiKey) {
        throw new Error(
          'Invalid Sonarr configuration: baseUrl and apiKey are required',
        )
      }

      // Skip webhook setup for placeholder credentials
      if (instance.apiKey === 'placeholder') {
        this.log.info(
          `Basic initialization only for ${instance.name} (placeholder credentials)`,
        )
        this.config = {
          sonarrBaseUrl: instance.baseUrl,
          sonarrApiKey: instance.apiKey,
          sonarrQualityProfileId: instance.qualityProfile || null,
          sonarrLanguageProfileId: 1,
          sonarrRootFolder: instance.rootFolder || null,
          sonarrTagIds: instance.tags,
          sonarrSeasonMonitoring: instance.seasonMonitoring,
        }
        return
      }

      this.config = {
        sonarrBaseUrl: instance.baseUrl,
        sonarrApiKey: instance.apiKey,
        sonarrQualityProfileId: instance.qualityProfile || null,
        sonarrLanguageProfileId: 1,
        sonarrRootFolder: instance.rootFolder || null,
        sonarrTagIds: instance.tags,
        sonarrSeasonMonitoring: instance.seasonMonitoring,
      }

      this.log.info(
        `Successfully initialized base Sonarr service for ${instance.name}`,
      )

      if (this.fastify.server.listening) {
        await this.setupWebhook()
      } else {
        this.fastify.server.prependOnceListener('listening', async () => {
          try {
            await this.setupWebhook()
          } catch (error) {
            this.log.error(
              `Failed to setup webhook for instance ${instance.name} after server start for Sonarr:`,
              error,
            )
          }
        })
      }
    } catch (error) {
      this.log.error(
        `Failed to initialize Sonarr service for instance ${instance.name}:`,
        error,
      )
      throw error
    }
  }

  async testConnection(
    baseUrl: string,
    apiKey: string,
  ): Promise<ConnectionTestResult> {
    try {
      if (!baseUrl || !apiKey) {
        return {
          success: false,
          message: 'Base URL and API key are required',
        }
      }

      const url = new URL(`${baseUrl}/ping`)
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-Api-Key': apiKey,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        return {
          success: false,
          message: `Connection failed: ${response.statusText}`,
        }
      }

      const pingResponse = (await response.json()) as PingResponse
      if (pingResponse.status !== 'OK') {
        return {
          success: false,
          message: 'Invalid ping response from server',
        }
      }

      return {
        success: true,
        message: 'Connection successful',
      }
    } catch (error) {
      this.log.error('Connection test error:', error)
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Unknown connection error',
      }
    }
  }

  private async verifyConnection(instance: SonarrInstance): Promise<unknown> {
    const url = new URL(`${instance.baseUrl}/api/v3/system/status`)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Api-Key': instance.apiKey,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Connection verification failed: ${response.statusText}`)
    }

    return response.json()
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

  private isNumericQualityProfile(
    value: string | number | null,
  ): value is number {
    if (value === null) return false
    if (typeof value === 'number') return true
    return /^\d+$/.test(value)
  }

  private async resolveRootFolder(
    overrideRootFolder?: string,
  ): Promise<string> {
    const rootFolderPath =
      overrideRootFolder || this.sonarrConfig.sonarrRootFolder
    if (rootFolderPath) return rootFolderPath

    const rootFolders = await this.fetchRootFolders()
    if (rootFolders.length === 0) {
      throw new Error('No root folders configured in Sonarr')
    }

    const defaultPath = rootFolders[0].path
    this.log.info(`Using root folder: ${defaultPath}`)
    return defaultPath
  }

  private async resolveQualityProfileId(
    profiles: QualityProfile[],
  ): Promise<number> {
    const configProfile = this.sonarrConfig.sonarrQualityProfileId

    if (profiles.length === 0) {
      throw new Error('No quality profiles configured in Sonarr')
    }

    if (configProfile === null) {
      const defaultId = profiles[0].id
      this.log.info(
        `Using default quality profile: ${profiles[0].name} (ID: ${defaultId})`,
      )
      return defaultId
    }

    if (this.isNumericQualityProfile(configProfile)) {
      return Number(configProfile)
    }

    const matchingProfile = profiles.find(
      (profile) =>
        profile.name.toLowerCase() === configProfile.toString().toLowerCase(),
    )

    if (matchingProfile) {
      this.log.info(
        `Using matched quality profile: ${matchingProfile.name} (ID: ${matchingProfile.id})`,
      )
      return matchingProfile.id
    }

    this.log.warn(
      `Could not find quality profile "${configProfile}". Available profiles: ${profiles.map((p) => p.name).join(', ')}`,
    )
    const fallbackId = profiles[0].id
    this.log.info(
      `Falling back to first quality profile: ${profiles[0].name} (ID: ${fallbackId})`,
    )
    return fallbackId
  }

  async addToSonarr(
    item: Item,
    overrideRootFolder?: string,
    overrideQualityProfileId?: number | string | null,
  ): Promise<void> {
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

      const rootFolderPath = await this.resolveRootFolder(overrideRootFolder)

      const qualityProfiles = await this.fetchQualityProfiles()
      const qualityProfileId =
        overrideQualityProfileId !== undefined
          ? overrideQualityProfileId
          : await this.resolveQualityProfileId(qualityProfiles)

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
      this.log.info(
        `Sent ${item.title} to Sonarr (Quality Profile: ${qualityProfileId}, Root Folder: ${rootFolderPath})`,
      )
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
