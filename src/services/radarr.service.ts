import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  RadarrAddOptions,
  RadarrPost,
  RadarrMovie,
  Item,
  RadarrConfiguration,
  RootFolder,
  QualityProfile,
  PagedResult,
  RadarrInstance,
  PingResponse,
  ConnectionTestResult,
  WebhookNotification,
} from '@root/types/radarr.types.js'

export class RadarrService {
  private config: RadarrConfiguration | null = null
  private webhookInitialized = false

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly appBaseUrl: string,
    private readonly port: number,
    private readonly fastify: FastifyInstance,
  ) {}

  private get radarrConfig(): RadarrConfiguration {
    if (!this.config) {
      throw new Error('Radarr service not initialized')
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
        `Credentials verified, attempting to setup webhook with URL for Radarr: ${expectedWebhookUrl}`,
      )

      const existingWebhooks =
        await this.getFromRadarr<WebhookNotification[]>('notification')
      const existingPulsarrWebhook = existingWebhooks.find(
        (hook) => hook.name === 'Pulsarr',
      )

      if (existingPulsarrWebhook) {
        const currentWebhookUrl = existingPulsarrWebhook.fields.find(
          (field) => field.name === 'url',
        )?.value
        if (currentWebhookUrl === expectedWebhookUrl) {
          this.log.info('Pulsarr Radarr webhook exists with correct URL')
          return
        }
        this.log.info('Pulsarr Radarr webhook URL mismatch, recreating webhook')
        await this.deleteNotification(existingPulsarrWebhook.id)
      }

      const webhookConfig = {
        onGrab: false,
        onDownload: true,
        onUpgrade: false,
        onRename: false,
        onMovieAdded: false,
        onMovieDelete: false,
        onMovieFileDelete: false,
        onMovieFileDeleteForUpgrade: false,
        onHealthIssue: false,
        includeHealthWarnings: false,
        onHealthRestored: false,
        onApplicationUpdate: false,
        onManualInteractionRequired: false,
        supportsOnGrab: true,
        supportsOnDownload: true,
        supportsOnUpgrade: true,
        supportsOnRename: true,
        supportsOnMovieAdded: true,
        supportsOnMovieDelete: true,
        supportsOnMovieFileDelete: true,
        supportsOnMovieFileDeleteForUpgrade: true,
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
            privacy: 'normal',
            isFloat: false,
          },
          {
            order: 1,
            name: 'method',
            label: 'Method',
            helpText: 'Which HTTP method to use submit to the Webservice',
            value: 1,
            type: 'select',
            advanced: false,
            selectOptions: [
              {
                value: 1,
                name: 'POST',
                order: 1,
                dividerAfter: false,
              },
              {
                value: 2,
                name: 'PUT',
                order: 2,
                dividerAfter: false,
              },
            ],
            privacy: 'normal',
            isFloat: false,
          },
          {
            order: 2,
            name: 'username',
            label: 'Username',
            type: 'textbox',
            advanced: false,
            privacy: 'userName',
            isFloat: false,
          },
          {
            order: 3,
            name: 'password',
            label: 'Password',
            type: 'password',
            advanced: false,
            privacy: 'password',
            isFloat: false,
          },
          {
            order: 4,
            name: 'headers',
            label: 'Headers',
            value: [],
            type: 'keyValueList',
            advanced: true,
            privacy: 'normal',
            isFloat: false,
          },
        ],
        implementationName: 'Webhook',
        implementation: 'Webhook',
        configContract: 'WebhookSettings',
        infoLink: 'https://wiki.servarr.com/radarr/supported#webhook',
        tags: [],
      }

      try {
        const response = await this.postToRadarr('notification', webhookConfig)
        this.log.info(
          `Successfully created Pulsarr webhook with URL for Radarr: ${expectedWebhookUrl}`,
        )
        this.log.debug('Webhook creation response for Radarr:', response)
      } catch (createError) {
        this.log.error(
          'Error creating webhook for Radarr. Full config:',
          webhookConfig,
        )
        this.log.error('Creation error details:', createError)
        throw createError
      }

      this.webhookInitialized = true
    } catch (error) {
      this.log.error('Failed to setup webhook for Radarr:', error)
      throw error
    }
  }

  async removeWebhook(): Promise<void> {
    try {
      const existingWebhooks =
        await this.getFromRadarr<WebhookNotification[]>('notification')
      const pulsarrWebhook = existingWebhooks.find(
        (hook) => hook.name === 'Pulsarr',
      )
      if (pulsarrWebhook) {
        await this.deleteNotification(pulsarrWebhook.id)
        this.log.info('Successfully removed Pulsarr webhook for Radarr')
      }
    } catch (error) {
      this.log.error('Failed to remove webhook for Radarr:', error)
      throw error
    }
  }

  private async deleteNotification(notificationId: number): Promise<void> {
    const config = this.radarrConfig
    const url = new URL(
      `${config.radarrBaseUrl}/api/v3/notification/${notificationId}`,
    )
    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'X-Api-Key': config.radarrApiKey,
      },
    })
    if (!response.ok) {
      throw new Error(`Radarr API error: ${response.statusText}`)
    }
  }

  async initialize(instance: RadarrInstance): Promise<void> {
    try {
      if (!instance.baseUrl || !instance.apiKey) {
        throw new Error(
          'Invalid Radarr configuration: baseUrl and apiKey are required',
        )
      }

      // Skip webhook setup for placeholder credentials
      if (instance.apiKey === 'placeholder') {
        this.log.info(
          `Basic initialization only for ${instance.name} (placeholder credentials)`,
        )
        this.config = {
          radarrBaseUrl: instance.baseUrl,
          radarrApiKey: instance.apiKey,
          radarrQualityProfileId: instance.qualityProfile || null,
          radarrRootFolder: instance.rootFolder || null,
          radarrTagIds: instance.tags,
        }
        return
      }

      this.config = {
        radarrBaseUrl: instance.baseUrl,
        radarrApiKey: instance.apiKey,
        radarrQualityProfileId: instance.qualityProfile || null,
        radarrRootFolder: instance.rootFolder || null,
        radarrTagIds: instance.tags,
      }

      this.log.info(
        `Successfully initialized base Radarr service for ${instance.name}`,
      )

      if (this.fastify.server.listening) {
        await this.setupWebhook()
      } else {
        this.fastify.server.prependOnceListener('listening', async () => {
          try {
            await this.setupWebhook()
          } catch (error) {
            this.log.error(
              `Failed to setup webhook for instance ${instance.name} after server start:`,
              error,
            )
          }
        })
      }
    } catch (error) {
      this.log.error(
        `Failed to initialize Radarr service for instance ${instance.name}:`,
        error,
      )
      throw error
    }
  }

  private async verifyConnection(instance: RadarrInstance): Promise<unknown> {
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

  private toItem(movie: RadarrMovie): Item {
    return {
      title: movie.title,
      guids: [
        movie.imdbId ? `imdb:${movie.imdbId}` : undefined,
        movie.tmdbId ? `tmdb:${movie.tmdbId}` : undefined,
        `radarr:${movie.id}`,
      ].filter((x): x is string => !!x),
      type: 'movie',
      ended: undefined,
      added: movie.added,
      status: movie.hasFile ? 'grabbed' : 'requested',
      movie_status: movie.isAvailable ? 'available' : 'unavailable',
    }
  }

  async fetchQualityProfiles(): Promise<QualityProfile[]> {
    try {
      const profiles =
        await this.getFromRadarr<QualityProfile[]>('qualityprofile')
      return profiles
    } catch (err) {
      this.log.error(`Error fetching quality profiles: ${err}`)
      throw err
    }
  }

  async fetchRootFolders(): Promise<RootFolder[]> {
    try {
      const rootFolders = await this.getFromRadarr<RootFolder[]>('rootfolder')
      return rootFolders
    } catch (err) {
      this.log.error(`Error fetching root folders: ${err}`)
      throw err
    }
  }

  async fetchMovies(bypass = false): Promise<Set<Item>> {
    try {
      const movies = await this.getFromRadarr<RadarrMovie[]>('movie')

      let exclusions: Set<Item> = new Set()
      if (!bypass) {
        exclusions = await this.fetchExclusions()
      }

      const movieItems = movies.map((movie) => this.toItem(movie))
      return new Set([...movieItems, ...exclusions])
    } catch (err) {
      this.log.error(`Error fetching movies: ${err}`)
      throw err
    }
  }

  async fetchExclusions(pageSize = 1000): Promise<Set<Item>> {
    const config = this.radarrConfig
    try {
      let currentPage = 1
      let totalRecords = 0
      const allExclusions: RadarrMovie[] = []

      do {
        const url = new URL(`${config.radarrBaseUrl}/api/v3/exclusions/paged`)
        url.searchParams.append('page', currentPage.toString())
        url.searchParams.append('pageSize', pageSize.toString())
        url.searchParams.append('sortDirection', 'ascending')
        url.searchParams.append('sortKey', 'movieTitle')

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'X-Api-Key': config.radarrApiKey,
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`Radarr API error: ${response.statusText}`)
        }

        const pagedResult = (await response.json()) as PagedResult<{
          id: number
          tmdbId: number
          movieTitle: string
          movieYear: number
        }>
        totalRecords = pagedResult.totalRecords

        const exclusionMovies = pagedResult.records.map((record) => ({
          title: record.movieTitle,
          imdbId: undefined,
          tmdbId: record.tmdbId,
          id: record.id,
        }))

        allExclusions.push(...exclusionMovies)

        this.log.debug(
          `Fetched page ${currentPage} of exclusions (${pagedResult.records.length} records)`,
        )
        currentPage++
      } while (allExclusions.length < totalRecords)

      this.log.info(`Fetched all movie ${allExclusions.length} exclusions`)
      return new Set(allExclusions.map((movie) => this.toItem(movie)))
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
      overrideRootFolder || this.radarrConfig.radarrRootFolder
    if (rootFolderPath) return rootFolderPath

    const rootFolders = await this.fetchRootFolders()
    if (rootFolders.length === 0) {
      throw new Error('No root folders configured in Radarr')
    }

    const defaultPath = rootFolders[0].path
    this.log.info(`Using root folder: ${defaultPath}`)
    return defaultPath
  }

  private async resolveQualityProfileId(
    profiles: QualityProfile[],
  ): Promise<number> {
    const configProfile = this.radarrConfig.radarrQualityProfileId

    if (profiles.length === 0) {
      throw new Error('No quality profiles configured in Radarr')
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

  private extractTmdbId(item: Item): number {
    const tmdbGuid = item.guids.find((guid) => guid.startsWith('tmdb:'))
    if (!tmdbGuid) return 0

    const parsed = Number.parseInt(tmdbGuid.replace('tmdb:', ''), 10)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  async addToRadarr(
    item: Item,
    overrideRootFolder?: string,
    overrideQualityProfileId?: number | string | null,
  ): Promise<void> {
    const config = this.radarrConfig
    try {
      const addOptions: RadarrAddOptions = {
        searchForMovie: true,
      }

      const tmdbId = this.extractTmdbId(item)

      const rootFolderPath = await this.resolveRootFolder(overrideRootFolder)

      const qualityProfiles = await this.fetchQualityProfiles()
      const qualityProfileId =
        overrideQualityProfileId !== undefined
          ? overrideQualityProfileId
          : await this.resolveQualityProfileId(qualityProfiles)

      const movie: RadarrPost = {
        title: item.title,
        tmdbId,
        qualityProfileId,
        rootFolderPath,
        addOptions,
        tags: config.radarrTagIds,
      }

      await this.postToRadarr<void>('movie', movie)
      this.log.info(
        `Sent ${item.title} to Radarr (Quality Profile: ${qualityProfileId}, Root Folder: ${rootFolderPath})`,
      )
    } catch (err) {
      this.log.debug(
        `Received warning for sending ${item.title} to Radarr: ${err}`,
      )
      throw err
    }
  }

  async deleteFromRadarr(item: Item, deleteFiles: boolean): Promise<void> {
    const config = this.radarrConfig
    try {
      const radarrGuid = item.guids.find((guid) => guid.startsWith('radarr:'))
      const tmdbGuid = item.guids.find((guid) => guid.startsWith('tmdb:'))
      if (!radarrGuid && !tmdbGuid) {
        this.log.warn(
          `Unable to extract ID from movie to delete: ${JSON.stringify(item)}`,
        )
        return
      }

      let radarrId: number | undefined

      if (radarrGuid) {
        radarrId = Number.parseInt(radarrGuid.replace('radarr:', ''), 10)
      } else if (tmdbGuid) {
        const tmdbId = tmdbGuid.replace('tmdb:', '')
        const allMovies = await this.fetchMovies(true)
        const matchingMovie = [...allMovies].find((movie) =>
          movie.guids.some(
            (guid) =>
              guid.startsWith('tmdb:') && guid.replace('tmdb:', '') === tmdbId,
          ),
        )
        if (!matchingMovie) {
          throw new Error(`Could not find movie with TMDB ID: ${tmdbId}`)
        }
        const matchingRadarrGuid = matchingMovie.guids.find((guid) =>
          guid.startsWith('radarr:'),
        )
        if (!matchingRadarrGuid) {
          throw new Error('Could not find Radarr ID for movie')
        }
        radarrId = Number.parseInt(
          matchingRadarrGuid.replace('radarr:', ''),
          10,
        )
      }

      if (radarrId === undefined || Number.isNaN(radarrId)) {
        throw new Error('Failed to obtain valid Radarr ID')
      }

      await this.deleteFromRadarrById(radarrId, deleteFiles)
      this.log.info(`Deleted ${item.title} from Radarr`)
    } catch (err) {
      this.log.error(`Error deleting from Radarr: ${err}`)
      throw err
    }
  }

  private async getFromRadarr<T>(endpoint: string): Promise<T> {
    const config = this.radarrConfig
    const url = new URL(`${config.radarrBaseUrl}/api/v3/${endpoint}`)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Api-Key': config.radarrApiKey,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Radarr API error: ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  private async postToRadarr<T>(
    endpoint: string,
    payload: unknown,
  ): Promise<T> {
    const config = this.radarrConfig
    const url = new URL(`${config.radarrBaseUrl}/api/v3/${endpoint}`)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'X-Api-Key': config.radarrApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Radarr API error: ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  private async deleteFromRadarrById(
    id: number,
    deleteFiles: boolean,
  ): Promise<void> {
    const config = this.radarrConfig
    const url = new URL(`${config.radarrBaseUrl}/api/v3/movie/${id}`)
    url.searchParams.append('deleteFiles', deleteFiles.toString())
    url.searchParams.append('addImportExclusion', 'false')

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'X-Api-Key': config.radarrApiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Radarr API error: ${response.statusText}`)
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
}
