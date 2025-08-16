import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import type {
  ConnectionTestResult,
  SonarrItem as Item,
  PagedResult,
  QualityProfile,
  RootFolder,
  SonarrAddOptions,
  SonarrConfiguration,
  SonarrEpisode,
  SonarrInstance,
  SonarrPost,
  SonarrSeries,
  WebhookNotification,
} from '@root/types/sonarr.types.js'
import {
  isSonarrStatus,
  isSystemStatus,
} from '@root/types/system-status.types.js'
import {
  extractSonarrId,
  extractTvdbId,
  hasMatchingGuids,
  normalizeGuid,
} from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

// Custom error class to include HTTP status
class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'HttpError'

    // Fix prototype chain – important after TS → JS down-emit
    Object.setPrototypeOf(this, new.target.prototype)

    // Preserve stack trace when available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError)
    }
  }
}

export class SonarrService {
  private config: SonarrConfiguration | null = null
  private webhookInitialized = false
  private instanceId?: number // The current instance ID (set during initialization)
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

  private ensureUrlHasProtocol(url: string): string {
    return url.match(/^https?:\/\//) ? url : `http://${url}`
  }

  private mapConnectionErrorToMessage(error: Error): string {
    // Prefer undici/Node fetch cause codes when available
    const cause = error.cause as { code?: string } | undefined
    const code = cause?.code
    if (error.name === 'AbortError' || code === 'ABORT_ERR') {
      return 'Connection timeout. Please check your base URL and network connection.'
    }
    if (code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      return 'Connection refused. Please check if Sonarr is running and the URL is correct.'
    }
    if (code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
      return 'Server not found. Please check your base URL.'
    }
    if (code === 'ETIMEDOUT' || error.message.includes('ETIMEDOUT')) {
      return 'Connection timeout. Please check your network and firewall settings.'
    }
    if (code === 'ECONNRESET' || error.message.includes('ECONNRESET')) {
      return 'Connection was reset. Please check your network stability.'
    }
    return 'Network error. Please check your connection and base URL.'
  }

  private get sonarrConfig(): SonarrConfiguration {
    if (!this.config) {
      throw new Error('Sonarr service not initialized')
    }
    return this.config
  }

  private constructWebhookUrl(): string {
    let url: URL

    try {
      // Try to parse as a complete URL
      url = new URL(this.appBaseUrl)
    } catch (_error) {
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
    const urlIdentifier = this.sonarrConfig.sonarrBaseUrl
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
        onDownload: true,
        onUpgrade: true,
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
          { error: createError, endpoint: 'notification' },
          'Error creating webhook for Sonarr (config omitted)',
        )

        let errorMessage = 'Failed to create webhook'
        if (createError instanceof HttpError) {
          // Use the status code from our custom error
          if (createError.status === 401) {
            errorMessage =
              'Authentication failed while creating webhook. Check API key permissions.'
          } else if (createError.status === 404) {
            errorMessage =
              'Notification API endpoint not found. Check Sonarr version.'
          } else if (createError.status === 500) {
            errorMessage =
              'Sonarr internal error while creating webhook. Check Sonarr logs.'
          } else {
            errorMessage = `Failed to create webhook: ${createError.message}`
          }
        } else if (createError instanceof Error) {
          errorMessage = `Failed to create webhook: ${createError.message}`
        }

        if (createError instanceof HttpError) {
          throw new HttpError(errorMessage, createError.status)
        }
        throw new Error(errorMessage, { cause: createError })
      }
      this.webhookInitialized = true
    } catch (error) {
      this.log.error({ error }, 'Failed to setup webhook for Sonarr:')

      let errorMessage = 'Failed to setup webhook'
      if (error instanceof Error) {
        errorMessage = error.message
      }

      throw new Error(errorMessage, { cause: error })
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
      this.log.error({ error }, 'Failed to remove webhook for Sonarr:')
      throw error
    }
  }

  private async deleteNotification(notificationId: number): Promise<void> {
    await this.sonarrDelete(`notification/${notificationId}`)
  }

  async initialize(instance: SonarrInstance): Promise<void> {
    try {
      if (!instance.baseUrl || !instance.apiKey) {
        throw new Error(
          'Invalid Sonarr configuration: baseUrl and apiKey are required',
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
          sonarrBaseUrl: this.ensureUrlHasProtocol(instance.baseUrl),
          sonarrApiKey: instance.apiKey,
          sonarrQualityProfileId: instance.qualityProfile || null,
          sonarrLanguageProfileId: 1,
          sonarrRootFolder: instance.rootFolder || null,
          sonarrTagIds: instance.tags,
          sonarrSeasonMonitoring: instance.seasonMonitoring,
          sonarrMonitorNewItems: instance.monitorNewItems || 'all',
          sonarrSeriesType: instance.seriesType || 'standard',
          createSeasonFolders: instance.createSeasonFolders,
        }
        return
      }

      this.config = {
        sonarrBaseUrl: this.ensureUrlHasProtocol(instance.baseUrl),
        sonarrApiKey: instance.apiKey,
        sonarrQualityProfileId: instance.qualityProfile || null,
        sonarrLanguageProfileId: 1,
        sonarrRootFolder: instance.rootFolder || null,
        sonarrTagIds: instance.tags,
        sonarrSeasonMonitoring: instance.seasonMonitoring,
        sonarrMonitorNewItems: instance.monitorNewItems || 'all',
        searchOnAdd:
          instance.searchOnAdd !== undefined ? instance.searchOnAdd : true,
        sonarrSeriesType: instance.seriesType || 'standard',
        createSeasonFolders: instance.createSeasonFolders,
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
              { error, instanceName: instance.name },
              'Failed to setup webhook after server start for Sonarr',
            )
          }
        })
      }
    } catch (error) {
      this.log.error(
        { error, instanceName: instance.name },
        'Failed to initialize Sonarr service',
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

      // Validate URL format and normalize
      let safeBaseUrl: string
      try {
        safeBaseUrl = baseUrl.match(/^https?:\/\//)
          ? baseUrl
          : `http://${baseUrl}`
        new URL(safeBaseUrl)
      } catch (_urlError) {
        return {
          success: false,
          message: 'Invalid URL format. Please check your base URL.',
        }
      }

      // Use system/status API endpoint for basic connectivity
      const statusUrl = new URL(`${safeBaseUrl}/api/v3/system/status`)

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
          return {
            success: false,
            message: this.mapConnectionErrorToMessage(fetchError),
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
              'API endpoint not found. Please check your base URL and ensure it points to Sonarr.',
          }
        }
        return {
          success: false,
          message: `Connection failed (${response.status}): ${response.statusText}`,
        }
      }

      // Validate we're connecting to Sonarr
      try {
        const statusResponse = await response.json()

        if (!isSystemStatus(statusResponse)) {
          return {
            success: false,
            message: 'Invalid response from server',
          }
        }

        if (!isSonarrStatus(statusResponse)) {
          return {
            success: false,
            message:
              'Connected service does not appear to be a valid Sonarr application',
          }
        }
      } catch (_parseError) {
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
          const url = new URL(`${safeBaseUrl}/api/v3/${endpoint}`)
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

        // Test notifications API access with dedicated helper function
        try {
          await rawGet<WebhookNotification[]>('notification')

          // If we got here, API access for notifications works
          return {
            success: true,
            message: 'Connection successful and webhook API accessible',
          }
        } catch (_notificationError) {
          return {
            success: false,
            message:
              'Connected to Sonarr but cannot access notification API. Check API key permissions.',
          }
        }
      } catch (error) {
        // If something else went wrong in the notification check
        this.log.warn({ error }, 'Webhook API test failed')
        return {
          success: false,
          message:
            'Connected to Sonarr but webhook testing failed. Please check API key permissions.',
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Connection test error:')

      if (error instanceof Error) {
        if (error.message.includes('Invalid URL')) {
          return {
            success: false,
            message: 'Invalid URL format. Please check your base URL.',
          }
        }
        // Use the shared error mapping
        return {
          success: false,
          message: this.mapConnectionErrorToMessage(error),
        }
      }

      return {
        success: false,
        message:
          'Connection test failed. Please check your settings and try again.',
      }
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

  async fetchQualityProfiles(): Promise<QualityProfile[]> {
    try {
      const profiles =
        await this.getFromSonarr<QualityProfile[]>('qualityprofile')
      return profiles
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching quality profiles')
      throw err
    }
  }

  async fetchRootFolders(): Promise<RootFolder[]> {
    try {
      const rootFolders = await this.getFromSonarr<RootFolder[]>('rootfolder')
      return rootFolders
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching root folders')
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
      this.log.error({ error: err }, 'Error fetching series')
      throw err
    }
  }

  /**
   * Check if a series exists in Sonarr using efficient lookup
   * @param tvdbId - The TVDB ID to check
   * @returns Promise resolving to ExistenceCheckResult with availability info
   */
  async seriesExistsByTvdbId(tvdbId: number): Promise<ExistenceCheckResult> {
    try {
      const series = await this.getFromSonarr<SonarrSeries[]>(
        `series/lookup?term=tvdb:${tvdbId}`,
      )

      // Series exists if it has a valid internal ID (> 0)
      const found = series.length > 0 && series[0].id > 0

      return {
        found,
        checked: true,
        serviceName: 'Sonarr',
      }
    } catch (err) {
      this.log.error({ error: err, tvdbId }, 'Error checking series existence')
      return {
        found: false,
        checked: false,
        serviceName: 'Sonarr',
        error: err instanceof Error ? err.message : String(err),
      }
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
      this.log.error({ error: err }, 'Error fetching exclusions')
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
    overrideTags?: string[],
    overrideSearchOnAdd?: boolean | null,
    overrideSeasonMonitoring?: string | null,
    overrideSeriesType?: 'standard' | 'anime' | 'daily' | null,
    overrideCreateSeasonFolders?: boolean | null,
  ): Promise<void> {
    const config = this.sonarrConfig
    try {
      // Check if searchOnAdd parameter or property exists and use it, otherwise default to true
      const shouldSearch =
        overrideSearchOnAdd !== undefined && overrideSearchOnAdd !== null
          ? overrideSearchOnAdd
          : config.searchOnAdd !== undefined
            ? config.searchOnAdd
            : true

      // Season monitoring strategy - prefer override, then config, then default to 'all'
      const monitorStrategy =
        overrideSeasonMonitoring && overrideSeasonMonitoring !== null
          ? overrideSeasonMonitoring
          : config.sonarrSeasonMonitoring || 'all'

      const addOptions: SonarrAddOptions = {
        monitor: monitorStrategy,
        searchForCutoffUnmetEpisodes: shouldSearch,
        searchForMissingEpisodes: shouldSearch,
      }

      const tvdbIdNumber = extractTvdbId(item.guids)
      const tvdbId = tvdbIdNumber > 0 ? tvdbIdNumber.toString() : undefined

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
        // Get all existing tags from Sonarr
        const existingTags = await this.getTags()

        // Process each tag from the override
        for (const tagInput of overrideTags) {
          // Handle numeric tag IDs
          if (/^\d+$/.test(tagInput)) {
            const tagId = tagInput.toString()
            // Only use the tag ID if it exists in Sonarr
            const tagExists = existingTags.some(
              (t) => t.id.toString() === tagId,
            )

            if (tagExists) {
              this.log.debug(`Using existing tag ID: ${tagId}`)
              tagIdsSet.add(tagId)
              continue
            }

            this.log.warn(
              `Tag ID ${tagId} not found in Sonarr - skipping this tag`,
            )
            continue
          }

          // Handle tag names
          const tag = existingTags.find((t) => t.label === tagInput)

          if (!tag) {
            this.log.warn(
              `Tag "${tagInput}" not found in Sonarr - skipping this tag`,
            )
            continue
          }

          tagIdsSet.add(tag.id.toString())
        }
      } else if (config.sonarrTagIds) {
        // Use default tags from config, but still validate they exist
        if (
          Array.isArray(config.sonarrTagIds) &&
          config.sonarrTagIds.length > 0
        ) {
          const existingTags = await this.getTags()

          for (const tagId of config.sonarrTagIds) {
            const stringTagId = tagId.toString()
            const tagExists = existingTags.some(
              (t) => t.id.toString() === stringTagId,
            )

            if (tagExists) {
              tagIdsSet.add(stringTagId)
            } else {
              this.log.warn(
                `Config tag ID ${stringTagId} not found in Sonarr - skipping this tag`,
              )
            }
          }
        }
      }

      // Convert Set back to array for the API
      const tags = Array.from(tagIdsSet)

      // Series type - prefer override, then config, then default to 'standard'
      const seriesType =
        overrideSeriesType && overrideSeriesType !== null
          ? overrideSeriesType
          : config.sonarrSeriesType || 'standard'

      // Create season folders - prefer override, then config, then default to undefined (Sonarr default)
      const createSeasonFolders =
        overrideCreateSeasonFolders !== undefined &&
        overrideCreateSeasonFolders !== null
          ? overrideCreateSeasonFolders
          : config.createSeasonFolders

      const show: SonarrPost = {
        title: item.title,
        tvdbId: tvdbId ? Number.parseInt(tvdbId, 10) : 0,
        qualityProfileId,
        rootFolderPath,
        addOptions,
        languageProfileId: null,
        monitored: true,
        monitorNewItems: config.sonarrMonitorNewItems || 'all',
        tags,
        seriesType,
        seasonFolder: createSeasonFolders,
      }

      await this.postToSonarr<void>('series', show)
      this.log.info(
        `Sent ${item.title} to Sonarr (Quality Profile: ${qualityProfileId}, Root Folder: ${rootFolderPath}, Tags: ${tags.length > 0 ? tags.join(', ') : 'none'}, Series Type: ${seriesType})`,
      )
    } catch (err) {
      this.log.debug(
        { error: err, title: item.title },
        'Send to Sonarr failed (rethrowing upstream)',
      )
      throw err
    }
  }

  async deleteFromSonarr(item: Item, deleteFiles: boolean): Promise<void> {
    const _config = this.sonarrConfig
    try {
      const sonarrId = extractSonarrId(item.guids)

      if (sonarrId > 0) {
        // Use the extracted Sonarr ID directly
        await this.deleteFromSonarrById(sonarrId, deleteFiles)
        this.log.info(`Deleted ${item.title} from Sonarr`)
        return
      }

      // Fallback: try to find by TVDB ID
      const tvdbId = extractTvdbId(item.guids)
      if (tvdbId === 0) {
        this.log.warn(
          `Unable to extract any valid ID from show to delete: ${JSON.stringify(item)}`,
        )
        return
      }

      const allSeries = await this.fetchSeries(true)
      const matchingSeries = [...allSeries].find((show) =>
        hasMatchingGuids(show.guids, [`tvdb:${tvdbId}`]),
      )

      if (!matchingSeries) {
        throw new Error(`Could not find show with TVDB ID: ${tvdbId}`)
      }

      const matchingSonarrId = extractSonarrId(matchingSeries.guids)
      if (matchingSonarrId === 0) {
        throw new Error('Could not find Sonarr ID for show')
      }

      await this.deleteFromSonarrById(matchingSonarrId, deleteFiles)
      this.log.info(`Deleted ${item.title} from Sonarr`)
    } catch (err) {
      this.log.error({ error: err }, 'Error deleting from Sonarr')
      throw err
    }
  }

  async getFromSonarr<T>(endpoint: string): Promise<T> {
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
      let errorDetail = response.statusText
      try {
        const errorData = (await response.json()) as { message?: string }
        if (errorData.message) {
          errorDetail = errorData.message
        }
      } catch {}

      if (response.status === 401) {
        throw new HttpError('Authentication failed. Check API key.', 401)
      }
      if (response.status === 404) {
        throw new HttpError(`API endpoint not found: ${endpoint}`, 404)
      }
      throw new HttpError(`Sonarr API error: ${errorDetail}`, response.status)
    }

    return response.json() as Promise<T>
  }

  private async postToSonarr<T>(
    endpoint: string,
    payload: unknown,
  ): Promise<T> {
    const config = this.sonarrConfig
    try {
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
          throw new HttpError('Authentication failed. Check API key.', 401)
        }
        if (response.status === 404) {
          throw new HttpError(`API endpoint not found: ${endpoint}`, 404)
        }
        throw new HttpError(`Sonarr API error: ${errorDetail}`, response.status)
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
          'Invalid base URL format. Please check your Sonarr URL configuration.',
        )
      }
      throw error
    }
  }

  private async deleteFromSonarrById(
    id: number,
    deleteFiles: boolean,
  ): Promise<void> {
    const endpoint = `series/${id}?deleteFiles=${deleteFiles}&addImportListExclusion=false`
    await this.sonarrDelete(endpoint)
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
        await this.getFromSonarr<WebhookNotification[]>('notification')
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
        onSeriesDelete: true,
        onEpisodeFileDelete: true,
        onEpisodeFileDeleteForUpgrade: true,
        onHealthIssue: false,
        onApplicationUpdate: false,
        supportsOnGrab: false,
        supportsOnDownload: true,
        supportsOnUpgrade: true,
        supportsOnRename: true,
        supportsOnSeriesDelete: true,
        supportsOnEpisodeFileDelete: true,
        supportsOnEpisodeFileDeleteForUpgrade: true,
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
        infoLink: 'https://wiki.servarr.com/sonarr/supported#plexserver',
        tags: [],
      }

      // Add the notification to Sonarr
      await this.postToSonarr('notification', plexConfig)
      this.log.info('Successfully configured Plex notification for Sonarr')
    } catch (error) {
      this.log.error(
        { error },
        'Error configuring Plex notification for Sonarr:',
      )
      throw error
    }
  }

  async removePlexNotification(): Promise<void> {
    try {
      // Find Plex server notification
      const existingNotifications =
        await this.getFromSonarr<WebhookNotification[]>('notification')
      const existingPlexNotification = existingNotifications.find(
        (n) => n.implementation === 'PlexServer',
      )

      if (existingPlexNotification) {
        // Delete the notification
        await this.deleteNotification(existingPlexNotification.id)
        this.log.info('Successfully removed Plex notification from Sonarr')
      } else {
        this.log.info('No Plex notification found to remove from Sonarr')
      }
    } catch (error) {
      this.log.error({ error }, 'Error removing Plex notification from Sonarr:')
      throw error
    }
  }

  /**
   * Get all tags from Sonarr with caching
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
      this.log.debug(`Using cached tags for Sonarr instance ${this.instanceId}`)
      const cachedTags = this.tagsCache.get(this.instanceId)
      return cachedTags || []
    }

    return this.refreshTagsCache(this.instanceId)
  }

  /**
   * Get tags directly from Sonarr without using cache
   *
   * @private
   * @returns Promise resolving to array of tags
   */
  private async getTagsWithoutCache(): Promise<
    Array<{ id: number; label: string }>
  > {
    return await this.getFromSonarr<Array<{ id: number; label: string }>>('tag')
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
        { error, instanceId },
        'Failed to refresh tags cache for Sonarr instance',
      )

      // If cache refresh fails but we have stale data, return that
      if (this.tagsCache.has(instanceId)) {
        this.log.warn(
          `Using stale tags cache for Sonarr instance ${instanceId}`,
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
        `Invalidated tags cache for Sonarr instance ${this.instanceId}`,
      )
    }
  }

  /**
   * Create a new tag in Sonarr
   *
   * @param label Tag label
   * @returns Promise resolving to the created tag
   */
  async createTag(label: string): Promise<{ id: number; label: string }> {
    try {
      const result = await this.postToSonarr<{ id: number; label: string }>(
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
        /409/.test(err.message) // Sonarr returns 409 Conflict if the tag exists
      ) {
        this.log.debug(
          `Tag "${label}" already exists in Sonarr – skipping creation`,
        )
        // Fetch the existing tag so we can return its id
        const existing = (await this.getTags()).find((t) => t.label === label)
        if (existing) return existing
      }
      throw err
    }
  }

  /**
   * Update the tags for a specific series
   *
   * @param seriesId The Sonarr series ID
   * @param tagIds Array of tag IDs to apply
   * @returns Promise resolving when the update is complete
   */
  async updateSeriesTags(seriesId: number, tagIds: number[]): Promise<void> {
    try {
      // First get the current series to preserve all fields
      const series = await this.getFromSonarr<SonarrSeries>(
        `series/${seriesId}`,
      )

      // Normalize both tag arrays for comparison
      const currentTags = [...new Set(series.tags || [])].sort()
      const newTags = [...new Set(tagIds)].sort()

      // Skip update if tags are already correct
      if (JSON.stringify(currentTags) === JSON.stringify(newTags)) {
        this.log.debug(
          `Tags already correct for series ID ${seriesId}, skipping update`,
        )
        return
      }

      // Use Set to deduplicate tags
      series.tags = [...new Set(tagIds)]

      // Send the update
      await this.putToSonarr(`series/${seriesId}`, series)

      this.log.debug(`Updated tags for series ID ${seriesId}`, { tagIds })
    } catch (error) {
      this.log.error({ error }, `Failed to update tags for series ${seriesId}:`)
      throw error
    }
  }

  /**
   * Bulk update tags for multiple series using the serieseditor endpoint
   * This provides significant performance improvements over individual updates
   *
   * @param updates Array of series updates containing seriesId and tagIds
   * @returns Promise resolving when all updates are complete
   */
  async bulkUpdateSeriesTags(
    updates: Array<{ seriesId: number; tagIds: number[] }>,
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
        tagGroups.get(tagKey)?.push(update.seriesId)
      }

      // Process each tag group as a bulk operation
      const promises = Array.from(tagGroups.entries()).map(
        async ([tagKey, seriesIds]) => {
          const tagIds =
            tagKey === ''
              ? []
              : tagKey.split(',').map((id) => Number.parseInt(id, 10))

          const payload = {
            seriesIds: seriesIds,
            tags: tagIds,
            applyTags: 'replace' as const, // Replace existing tags
          }

          await this.putToSonarr('series/editor', payload)

          this.log.debug(
            `Bulk updated ${seriesIds.length} series with tags [${tagIds.join(', ')}]`,
          )
        },
      )

      await Promise.all(promises)

      this.log.info(
        `Bulk updated tags for ${updates.length} series across ${tagGroups.size} tag groups`,
      )
    } catch (error) {
      this.log.error({ error }, 'Failed to bulk update series tags:')
      throw error
    }
  }

  /**
   * Update a resource in Sonarr using PUT
   *
   * @param endpoint API endpoint
   * @param payload The data to send
   * @returns Promise resolving to the response or void for 204 responses
   */
  async putToSonarr<T>(
    endpoint: string,
    payload: unknown,
  ): Promise<T | undefined> {
    const config = this.sonarrConfig
    const url = new URL(`${config.sonarrBaseUrl}/api/v3/${endpoint}`)
    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'X-Api-Key': config.sonarrApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      let errorDetail = response.statusText
      try {
        const errorData = await response.text()
        if (errorData) {
          errorDetail = `${response.statusText} - ${errorData}`
        }
      } catch {}
      throw new Error(`Sonarr API error (${response.status}): ${errorDetail}`)
    }

    // Some endpoints return 204 No Content
    if (response.status === 204) {
      return undefined
    }

    return response.json() as Promise<T>
  }

  /**
   * Generic DELETE request to Sonarr API
   *
   * @param endpoint API endpoint
   * @returns Promise resolving when the delete operation is complete
   */
  private async sonarrDelete(endpoint: string): Promise<void> {
    const config = this.sonarrConfig
    const url = new URL(`${config.sonarrBaseUrl}/api/v3/${endpoint}`)
    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'X-Api-Key': config.sonarrApiKey,
      },
    })

    if (!response.ok) {
      let errorDetail = response.statusText
      try {
        const errorData = (await response.json()) as { message?: string }
        if (errorData.message) {
          errorDetail = errorData.message
        }
      } catch {}

      if (response.status === 401) {
        throw new HttpError('Authentication failed. Check API key.', 401)
      }
      if (response.status === 404) {
        throw new HttpError(`Resource not found: ${endpoint}`, 404)
      }
      throw new HttpError(`Sonarr API error: ${errorDetail}`, response.status)
    }
  }

  /**
   * Delete a tag from Sonarr
   *
   * @param tagId The ID of the tag to delete
   * @returns Promise resolving when the delete operation is complete
   */
  async deleteTag(tagId: number): Promise<void> {
    await this.sonarrDelete(`tag/${tagId}`)

    // Invalidate the tags cache since we've deleted a tag
    this.invalidateTagsCache()
  }

  /**
   * Get all series from Sonarr (raw data)
   * @returns Promise resolving to array of series
   */
  async getAllSeries(): Promise<SonarrSeries[]> {
    try {
      return await this.getFromSonarr<SonarrSeries[]>('series')
    } catch (error) {
      this.log.error({ error }, 'Error fetching all series:')
      throw error
    }
  }

  /**
   * Search for episodes in a specific season
   * Enables monitoring first if needed, then searches
   * @param seriesId The Sonarr series ID
   * @param seasonNumber The season number to search
   */
  async searchSeason(seriesId: number, seasonNumber: number): Promise<void> {
    try {
      // STEP 1: Get current series data
      const series = await this.getFromSonarr<SonarrSeries>(
        `series/${seriesId}`,
      )

      // STEP 2: Check if season exists
      const season = series.seasons?.find(
        (s) => s.seasonNumber === seasonNumber,
      )
      if (!season) {
        throw new Error(
          `Season ${seasonNumber} not found in series ${seriesId}`,
        )
      }

      // STEP 3: Enable monitoring if needed
      let needsUpdate = false
      if (!season.monitored) {
        season.monitored = true
        needsUpdate = true
        this.log.info(
          `Enabling monitoring for series ${seriesId} season ${seasonNumber}`,
        )
      }
      if (!series.monitored) {
        series.monitored = true
        needsUpdate = true
        this.log.info(`Enabling monitoring for series ${seriesId}`)
      }

      // STEP 4: Update series if monitoring changed
      if (needsUpdate) {
        await this.putToSonarr(`series/${seriesId}`, series)
        this.log.info(
          `Updated monitoring for series ${seriesId} season ${seasonNumber}`,
        )
      }

      // STEP 5: Now trigger the search
      await this.postToSonarr('command', {
        name: 'SeasonSearch',
        seriesId,
        seasonNumber,
      })

      this.log.info(
        `Triggered search for series ${seriesId} season ${seasonNumber}`,
      )
    } catch (error) {
      this.log.error({ error }, 'Error searching season')
      throw error
    }
  }

  /**
   * Update monitoring for a specific season
   * @param seriesId The Sonarr series ID
   * @param seasonNumber The season number
   * @param monitored Whether to monitor the season
   */
  async updateSeasonMonitoring(
    seriesId: number,
    seasonNumber: number,
    monitored: boolean,
  ): Promise<void> {
    try {
      // First get the series to find the season
      const series = await this.getFromSonarr<SonarrSeries>(
        `series/${seriesId}`,
      )

      if (!series.seasons) {
        throw new Error('Series has no seasons')
      }

      // Find and update the season
      const seasonIndex = series.seasons.findIndex(
        (s) => s.seasonNumber === seasonNumber,
      )
      if (seasonIndex === -1) {
        throw new Error(`Season ${seasonNumber} not found`)
      }

      series.seasons[seasonIndex].monitored = monitored

      // Update the series
      await this.putToSonarr(`series/${seriesId}`, series)

      this.log.info(
        `Updated monitoring for series ${seriesId} season ${seasonNumber} to ${monitored}`,
      )
    } catch (error) {
      this.log.error({ error }, 'Error updating season monitoring:')
      throw error
    }
  }

  /**
   * Update series monitoring settings
   * @param seriesId The Sonarr series ID
   * @param updates Object containing monitoring updates
   */
  async updateSeriesMonitoring(
    seriesId: number,
    updates: { monitored?: boolean; monitorNewItems?: 'all' | 'none' },
  ): Promise<void> {
    try {
      // Get current series data
      const series = await this.getFromSonarr<SonarrSeries>(
        `series/${seriesId}`,
      )

      // Apply updates
      const updatedSeries = {
        ...series,
        ...updates,
      }

      // Send update
      await this.putToSonarr(`series/${seriesId}`, updatedSeries)

      this.log.info(`Updated series ${seriesId} monitoring settings`)
    } catch (error) {
      this.log.error({ error }, 'Error updating series monitoring:')
      throw error
    }
  }

  /**
   * Get all episodes for a series
   * @param seriesId The Sonarr series ID
   * @returns Array of episodes
   */
  async getEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
    try {
      const episodes = await this.getFromSonarr<SonarrEpisode[]>(
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

  /**
   * Get episodes for a specific season
   * @param seriesId The Sonarr series ID
   * @param seasonNumber The season number
   * @returns Array of episodes in the season
   */
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

  /**
   * Update monitoring for specific episodes
   * @param episodes Array of episode updates with id and monitored status
   */
  async updateEpisodesMonitoring(
    episodes: Array<{ id: number; monitored: boolean }>,
  ): Promise<void> {
    try {
      // Sonarr API requires updating episodes one by one or in bulk
      // We'll use the bulk endpoint
      const episodeIds = episodes.map((ep) => ep.id)
      const monitored = episodes[0]?.monitored || false

      await this.putToSonarr('episode/monitor', {
        episodeIds,
        monitored,
      })

      this.log.info(
        `Updated monitoring for ${episodes.length} episodes to ${monitored}`,
      )
    } catch (error) {
      this.log.error({ error }, 'Error updating episode monitoring:')
      throw error
    }
  }

  /**
   * Update monitoring for a single episode
   * @param episodeId The episode ID
   * @param monitored Whether to monitor the episode
   */
  async updateEpisodeMonitoring(
    episodeId: number,
    monitored: boolean,
  ): Promise<void> {
    try {
      // First get the episode
      const episode = await this.getFromSonarr<SonarrEpisode>(
        `episode/${episodeId}`,
      )

      // Update monitoring status
      episode.monitored = monitored

      // Send update
      await this.putToSonarr(`episode/${episodeId}`, episode)

      this.log.info(`Updated episode ${episodeId} monitoring to ${monitored}`)
    } catch (error) {
      this.log.error(
        { error },
        `Error updating episode ${episodeId} monitoring:`,
      )
      throw error
    }
  }

  /**
   * Delete episode file from Sonarr and filesystem
   * @param episodeFileId The episode file ID
   */
  async deleteEpisodeFile(episodeFileId: number): Promise<void> {
    try {
      await this.sonarrDelete(`episodefile/${episodeFileId}`)

      this.log.info(`Deleted episode file ${episodeFileId}`)
    } catch (error) {
      this.log.error({ error }, `Error deleting episode file ${episodeFileId}:`)
      throw error
    }
  }

  /**
   * Delete multiple episode files from Sonarr and filesystem
   * @param episodeFileIds Array of episode file IDs to delete
   */
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

        // Log details about which files failed
        const failedIds = episodeFileIds.filter(
          (_, index) => results[index].status === 'rejected',
        )
        this.log.error({ failedIds }, 'Failed episode file IDs')

        // Log the actual errors for debugging
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

      this.log.info(`Successfully deleted ${successCount} episode files`)
    } catch (error) {
      // Re-throw errors from Promise.allSettled analysis above
      if (
        error instanceof Error &&
        error.message.includes('Failed to delete')
      ) {
        throw error
      }

      // Handle unexpected errors
      this.log.error({ error }, 'Unexpected error deleting episode files:')
      throw error
    }
  }
}
