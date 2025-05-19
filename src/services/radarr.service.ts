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
  MinimumAvailability,
} from '@root/types/radarr.types.js'
import type { SystemStatus } from '@root/types/system-status.types.js'
import {
  isSystemStatus,
  isRadarrStatus,
} from '@root/types/system-status.types.js'

export class RadarrService {
  private config: RadarrConfiguration | null = null
  private webhookInitialized = false
  private tagsCache: Map<number, Array<{ id: number; label: string }>> =
    new Map()
  private tagsCacheExpiry: Map<number, number> = new Map()
  private TAG_CACHE_TTL = 30000 // 30 seconds in milliseconds

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
    let url: URL

    try {
      // Try to parse as a complete URL
      url = new URL(this.appBaseUrl)
    } catch (error) {
      // If parsing fails, assume it's a hostname without protocol
      url = new URL(`http://${this.appBaseUrl}`)
    }

    // If there's no explicit port in the URL already
    if (!url.port) {
      // For HTTPS protocol, don't add a port (use default 443)
      if (url.protocol === 'https:') {
        // Leave port empty
      } else {
        // For all other protocols (including HTTP), add the configured port
        url.port = this.port.toString()
      }
    }

    // Set the webhook path
    url.pathname = '/v1/notifications/webhook'

    // Add instance identifier for tracking
    const urlIdentifier = this.radarrConfig.radarrBaseUrl
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '')

    url.searchParams.append('instanceId', urlIdentifier)

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

        let errorMessage = 'Failed to create webhook'
        if (createError instanceof Error) {
          if (createError.message.includes('401')) {
            errorMessage =
              'Authentication failed while creating webhook. Check API key permissions.'
          } else if (createError.message.includes('404')) {
            errorMessage =
              'Notification API endpoint not found. Check Radarr version.'
          } else if (
            createError.message.includes('500') ||
            createError.message.includes('Internal Server Error')
          ) {
            errorMessage =
              'Radarr internal error while creating webhook. Check Radarr logs.'
          } else {
            errorMessage = `Failed to create webhook: ${createError.message}`
          }
        }

        throw new Error(errorMessage)
      }

      this.webhookInitialized = true
    } catch (error) {
      this.log.error('Failed to setup webhook for Radarr:', error)

      let errorMessage = 'Failed to setup webhook'
      if (error instanceof Error) {
        errorMessage = error.message
      }

      throw new Error(errorMessage)
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

      // Store the instance ID for caching purposes
      this.instanceId = instance.id

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
        searchOnAdd:
          instance.searchOnAdd !== undefined ? instance.searchOnAdd : true,
        minimumAvailability: instance.minimumAvailability || 'released',
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

  private async verifyConnection(
    instance: RadarrInstance,
  ): Promise<SystemStatus> {
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

    const status = await response.json()

    if (!isSystemStatus(status)) {
      throw new Error('Invalid status response from Radarr')
    }

    return status as SystemStatus
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
    overrideTags?: string[],
    overrideSearchOnAdd?: boolean | null,
    overrideMinimumAvailability?: MinimumAvailability,
  ): Promise<void> {
    const config = this.radarrConfig
    try {
      const addOptions: RadarrAddOptions = {
        searchForMovie:
          overrideSearchOnAdd !== undefined && overrideSearchOnAdd !== null
            ? overrideSearchOnAdd
            : config.searchOnAdd !== undefined
              ? config.searchOnAdd
              : true, // Default to true for backward compatibility
      }

      const tmdbId = this.extractTmdbId(item)

      const rootFolderPath = await this.resolveRootFolder(overrideRootFolder)

      const qualityProfiles = await this.fetchQualityProfiles()
      const qualityProfileId =
        overrideQualityProfileId !== undefined
          ? overrideQualityProfileId
          : await this.resolveQualityProfileId(qualityProfiles)

      // Collection for valid tag IDs (using Set to avoid duplicates)
      const tagIdsSet = new Set<string>()

      // Process override tags if provided
      if (overrideTags && overrideTags.length > 0) {
        // Get all existing tags from Radarr
        const existingTags = await this.getTags()

        // Process each tag from the override
        for (const tagInput of overrideTags) {
          // Handle numeric tag IDs
          if (/^\d+$/.test(tagInput)) {
            const tagId = tagInput.toString()
            // Only use the tag ID if it exists in Radarr
            const tagExists = existingTags.some(
              (t) => t.id.toString() === tagId,
            )

            if (tagExists) {
              this.log.debug(`Using existing tag ID: ${tagId}`)
              tagIdsSet.add(tagId)
              continue
            }

            this.log.warn(
              `Tag ID ${tagId} not found in Radarr - skipping this tag`,
            )
            continue
          }

          // Handle tag names
          const tag = existingTags.find((t) => t.label === tagInput)

          if (!tag) {
            this.log.warn(
              `Tag "${tagInput}" not found in Radarr - skipping this tag`,
            )
            continue
          }

          tagIdsSet.add(tag.id.toString())
        }
      } else if (config.radarrTagIds) {
        // Use default tags from config, but still validate they exist
        if (
          Array.isArray(config.radarrTagIds) &&
          config.radarrTagIds.length > 0
        ) {
          const existingTags = await this.getTags()

          for (const tagId of config.radarrTagIds) {
            const stringTagId = tagId.toString()
            const tagExists = existingTags.some(
              (t) => t.id.toString() === stringTagId,
            )

            if (tagExists) {
              tagIdsSet.add(stringTagId)
            } else {
              this.log.warn(
                `Config tag ID ${stringTagId} not found in Radarr - skipping this tag`,
              )
            }
          }
        }
      }

      // Convert Set back to array for the API
      const tags = Array.from(tagIdsSet)

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
      }

      await this.postToRadarr<void>('movie', movie)
      this.log.info(
        `Sent ${item.title} to Radarr (Quality Profile: ${qualityProfileId}, Root Folder: ${rootFolderPath}, Tags: ${tags.length > 0 ? tags.join(', ') : 'none'})`,
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

  async getFromRadarr<T>(endpoint: string): Promise<T> {
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
    try {
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

      // Handle 204 No Content responses
      if (response.status === 204) {
        return undefined as unknown as T
      }

      if (!response.ok) {
        let errorDetail = response.statusText
        try {
          const errorData = (await response.json()) as { message?: string }
          if (errorData.message) {
            errorDetail = errorData.message
          }
        } catch {}

        if (response.status === 401) {
          throw new Error('Authentication failed. Check API key.')
        }
        if (response.status === 404) {
          throw new Error(`API endpoint not found: ${endpoint}`)
        }
        throw new Error(`Radarr API error: ${errorDetail}`)
      }

      // Some endpoints return 201 with empty body
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        return response.json() as Promise<T>
      }

      return undefined as unknown as T
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Invalid URL')) {
        throw new Error(
          'Invalid base URL format. Please check your Radarr URL configuration.',
        )
      }
      throw error
    }
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

      // Validate URL format
      try {
        const testUrl = baseUrl.match(/^https?:\/\//)
          ? baseUrl
          : `http://${baseUrl}`
        new URL(testUrl)
      } catch (urlError) {
        return {
          success: false,
          message: 'Invalid URL format. Please check your base URL.',
        }
      }

      // Use system/status API endpoint for basic connectivity
      const statusUrl = new URL(`${baseUrl}/api/v3/system/status`)

      let response: Response
      try {
        response = await fetch(statusUrl.toString(), {
          method: 'GET',
          headers: {
            'X-Api-Key': apiKey,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        })
      } catch (fetchError) {
        if (fetchError instanceof Error) {
          if (fetchError.name === 'AbortError') {
            return {
              success: false,
              message:
                'Connection timeout. Please check your base URL and network connection.',
            }
          }
          if (fetchError.message.includes('ECONNREFUSED')) {
            return {
              success: false,
              message:
                'Connection refused. Please check if Radarr is running and the URL is correct.',
            }
          }
          if (fetchError.message.includes('ENOTFOUND')) {
            return {
              success: false,
              message: 'Server not found. Please check your base URL.',
            }
          }
        }
        return {
          success: false,
          message: 'Network error. Please check your connection and base URL.',
        }
      }

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            message: 'Authentication failed. Please check your API key.',
          }
        }
        if (response.status === 404) {
          return {
            success: false,
            message:
              'API endpoint not found. Please check your base URL and ensure it points to Radarr.',
          }
        }
        return {
          success: false,
          message: `Connection failed (${response.status}): ${response.statusText}`,
        }
      }

      // Validate we're connecting to Radarr
      try {
        const statusResponse = await response.json()

        if (!isSystemStatus(statusResponse)) {
          return {
            success: false,
            message: 'Invalid response from server',
          }
        }

        if (!isRadarrStatus(statusResponse)) {
          return {
            success: false,
            message:
              'Connected service does not appear to be a valid Radarr application',
          }
        }
      } catch (parseError) {
        return {
          success: false,
          message: 'Failed to parse response from server',
        }
      }

      // Now check if we can access the notifications API to verify webhook capabilities
      // This tests permission levels and API completeness
      try {
        // Create a helper function to make a GET request without modifying service state
        const rawGet = async <T>(endpoint: string): Promise<T> => {
          const url = new URL(`${baseUrl}/api/v3/${endpoint}`)
          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'X-Api-Key': apiKey,
              Accept: 'application/json',
            },
          })

          if (!response.ok) {
            throw new Error(`Radarr API error: ${response.statusText}`)
          }

          return response.json() as Promise<T>
        }

        // Test notifications API access with dedicated helper function
        try {
          await rawGet<WebhookNotification[]>('notification')

          // If we got here, API access for notifications works
          return {
            success: true,
            message: 'Connection successful and webhook API accessible',
          }
        } catch (notificationError) {
          return {
            success: false,
            message:
              'Connected to Radarr but cannot access notification API. Check API key permissions.',
          }
        }
      } catch (error) {
        // If something else went wrong in the notification check
        this.log.warn('Webhook API test failed:', error)
        return {
          success: false,
          message:
            'Connected to Radarr but webhook testing failed. Please check API key permissions.',
        }
      }
    } catch (error) {
      this.log.error('Connection test error:', error)

      if (error instanceof Error) {
        // Parse common error patterns
        if (error.message.includes('ECONNREFUSED')) {
          return {
            success: false,
            message:
              'Connection refused. Please check if Radarr is running and accessible.',
          }
        }
        if (error.message.includes('ENOTFOUND')) {
          return {
            success: false,
            message: 'Server not found. Please check your base URL.',
          }
        }
        if (error.message.includes('ETIMEDOUT')) {
          return {
            success: false,
            message:
              'Connection timeout. Please check your network and firewall settings.',
          }
        }
        if (error.message.includes('Invalid URL')) {
          return {
            success: false,
            message: 'Invalid URL format. Please check your base URL.',
          }
        }
      }

      return {
        success: false,
        message:
          'Connection test failed. Please check your settings and try again.',
      }
    }
  }

  async configurePlexNotification(
    plexToken: string,
    plexHost: string,
    plexPort: number,
    useSsl: boolean,
  ): Promise<void> {
    try {
      // First, check if Plex server connection already exists
      const existingNotifications =
        await this.getFromRadarr<WebhookNotification[]>('notification')
      const existingPlexNotification = existingNotifications.find(
        (n) => n.implementation === 'PlexServer',
      )

      if (existingPlexNotification) {
        // Update existing notification
        await this.deleteNotification(existingPlexNotification.id)
      }

      // Create notification configuration
      const plexConfig = {
        onGrab: false,
        onDownload: true,
        onUpgrade: true,
        onRename: true,
        onMovieDelete: true,
        onMovieFileDelete: true,
        onMovieFileDeleteForUpgrade: true,
        onHealthIssue: false,
        onApplicationUpdate: false,
        supportsOnGrab: false,
        supportsOnDownload: true,
        supportsOnUpgrade: true,
        supportsOnRename: true,
        supportsOnMovieDelete: true,
        supportsOnMovieFileDelete: true,
        supportsOnMovieFileDeleteForUpgrade: true,
        supportsOnHealthIssue: false,
        supportsOnApplicationUpdate: false,
        includeHealthWarnings: false,
        name: 'Plex Media Server',
        fields: [
          {
            name: 'host',
            value: plexHost,
          },
          {
            name: 'port',
            value: plexPort,
          },
          {
            name: 'useSsl',
            value: useSsl,
          },
          {
            name: 'authToken',
            value: plexToken,
          },
          {
            name: 'updateLibrary',
            value: true,
          },
        ],
        implementationName: 'Plex Media Server',
        implementation: 'PlexServer',
        configContract: 'PlexServerSettings',
        infoLink: 'https://wiki.servarr.com/radarr/supported#plexserver',
        tags: [],
      }

      // Add the notification to Radarr
      await this.postToRadarr('notification', plexConfig)
      this.log.info('Successfully configured Plex notification')
    } catch (error) {
      this.log.error('Error configuring Plex notification:', error)
      throw error
    }
  }

  async removePlexNotification(): Promise<void> {
    try {
      // Find Plex server notification
      const existingNotifications =
        await this.getFromRadarr<WebhookNotification[]>('notification')
      const existingPlexNotification = existingNotifications.find(
        (n) => n.implementation === 'PlexServer',
      )

      if (existingPlexNotification) {
        // Delete the notification
        await this.deleteNotification(existingPlexNotification.id)
        this.log.info('Successfully removed Plex notification from Radarr')
      } else {
        this.log.info('No Plex notification found to remove from Radarr')
      }
    } catch (error) {
      this.log.error('Error removing Plex notification from Radarr:', error)
      throw error
    }
  }

  /**
   * Get the current Radarr instance ID
   * @private
   */
  // The current instance ID (set during initialization)
  private instanceId?: number

  /**
   * Get all tags from Radarr with caching
   *
   * @returns Promise resolving to an array of tags
   */
  async getTags(): Promise<Array<{ id: number; label: string }>> {
    // Skip cache if service not properly initialized or no instance ID
    if (!this.instanceId) {
      return this.getTagsWithoutCache()
    }

    const now = Date.now()
    const cacheExpiry = this.tagsCacheExpiry.get(this.instanceId)

    // Return cached data if valid
    if (
      cacheExpiry &&
      now < cacheExpiry &&
      this.tagsCache.has(this.instanceId)
    ) {
      this.log.debug(`Using cached tags for Radarr instance ${this.instanceId}`)
      const cachedTags = this.tagsCache.get(this.instanceId)
      return cachedTags || []
    }

    return this.refreshTagsCache(this.instanceId)
  }

  /**
   * Get tags directly from Radarr without using cache
   *
   * @private
   * @returns Promise resolving to array of tags
   */
  private async getTagsWithoutCache(): Promise<
    Array<{ id: number; label: string }>
  > {
    return await this.getFromRadarr<Array<{ id: number; label: string }>>('tag')
  }

  /**
   * Refresh the tags cache for this instance
   *
   * @private
   * @param instanceId The instance ID to refresh cache for
   * @returns Promise resolving to array of tags
   */
  private async refreshTagsCache(
    instanceId: number,
  ): Promise<Array<{ id: number; label: string }>> {
    try {
      const tags = await this.getTagsWithoutCache()

      // Update cache with fresh data
      this.tagsCache.set(instanceId, tags)
      this.tagsCacheExpiry.set(instanceId, Date.now() + this.TAG_CACHE_TTL)

      return tags
    } catch (error) {
      this.log.error(
        `Failed to refresh tags cache for Radarr instance ${instanceId}:`,
        error,
      )

      // If cache refresh fails but we have stale data, return that
      if (this.tagsCache.has(instanceId)) {
        this.log.warn(
          `Using stale tags cache for Radarr instance ${instanceId}`,
        )
        const cachedTags = this.tagsCache.get(instanceId)
        return cachedTags || []
      }

      throw error
    }
  }

  /**
   * Invalidate the tags cache for this instance
   * Should be called whenever tags are created or deleted
   */
  public invalidateTagsCache(): void {
    if (this.instanceId) {
      this.tagsCache.delete(this.instanceId)
      this.tagsCacheExpiry.delete(this.instanceId)
      this.log.debug(
        `Invalidated tags cache for Radarr instance ${this.instanceId}`,
      )
    }
  }

  /**
   * Create a new tag in Radarr
   *
   * @param label Tag label
   * @returns Promise resolving to the created tag
   */
  async createTag(label: string): Promise<{ id: number; label: string }> {
    try {
      const result = await this.postToRadarr<{ id: number; label: string }>(
        'tag',
        {
          label,
        },
      )

      // Invalidate the tags cache since we've added a new tag
      this.invalidateTagsCache()

      return result
    } catch (err) {
      if (
        err instanceof Error &&
        /409/.test(err.message) // Radarr returns 409 Conflict if the tag exists
      ) {
        this.log.debug(
          `Tag "${label}" already exists in Radarr – skipping creation`,
        )
        // Fetch the existing tag so we can return its id
        const existing = (await this.getTags()).find((t) => t.label === label)
        if (existing) return existing
      }
      throw err
    }
  }

  /**
   * Update the tags for a specific movie
   *
   * @param movieId The Radarr movie ID
   * @param tagIds Array of tag IDs to apply
   * @returns Promise resolving when the update is complete
   */
  async updateMovieTags(movieId: number, tagIds: number[]): Promise<void> {
    try {
      // First get the current movie to preserve all fields
      const movie = await this.getFromRadarr<RadarrMovie & { tags: number[] }>(
        `movie/${movieId}`,
      )

      // Use Set to deduplicate tags
      movie.tags = [...new Set(tagIds)]

      // Send the update
      await this.putToRadarr(`movie/${movieId}`, movie)

      this.log.debug(`Updated tags for movie ID ${movieId}`, { tagIds })
    } catch (error) {
      this.log.error(`Failed to update tags for movie ${movieId}:`, error)
      throw error
    }
  }

  /**
   * Update a resource in Radarr using PUT
   *
   * @param endpoint API endpoint
   * @param payload The data to send
   * @returns Promise resolving to the response or void for 204 responses
   */
  async putToRadarr<T>(
    endpoint: string,
    payload: unknown,
  ): Promise<T | undefined> {
    const config = this.radarrConfig
    const url = new URL(`${config.radarrBaseUrl}/api/v3/${endpoint}`)
    const response = await fetch(url.toString(), {
      method: 'PUT',
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

    // Some endpoints return 204 No Content
    if (response.status === 204) {
      return undefined
    }

    return response.json() as Promise<T>
  }

  /**
   * Delete a tag from Radarr
   *
   * @param tagId The ID of the tag to delete
   * @returns Promise resolving when the delete operation is complete
   */
  async deleteTag(tagId: number): Promise<void> {
    const config = this.radarrConfig
    const url = new URL(`${config.radarrBaseUrl}/api/v3/tag/${tagId}`)

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'X-Api-Key': config.radarrApiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Radarr API error: ${response.statusText}`)
    }

    // Invalidate the tags cache since we've deleted a tag
    this.invalidateTagsCache()
  }
}
