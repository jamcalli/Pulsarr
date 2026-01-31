import type {
  ConnectionTestResult,
  Item,
  MinimumAvailability,
  PagedResult,
  QualityProfile,
  RadarrAddOptions,
  RadarrConfiguration,
  RadarrInstance,
  RadarrMonitorType,
  RadarrMovie,
  RadarrPost,
  RootFolder,
  WebhookNotification,
} from '@root/types/radarr.types.js'
import type {
  ExistenceCheckResult,
  HealthCheckResult,
} from '@root/types/service-result.types.js'
import {
  isRadarrStatus,
  isSystemStatus,
} from '@root/types/system-status.types.js'
import { parseArrErrorMessage } from '@utils/arr-error.js'
import {
  extractRadarrId,
  extractTmdbId,
  hasMatchingGuids,
  normalizeGuid,
} from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import { normalizeBasePath } from '@utils/url.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

// HTTP timeout constants
const RADARR_API_TIMEOUT = 120000 // 120 seconds for API operations
const RADARR_CONNECTION_TEST_TIMEOUT = 10000 // 10 seconds for connection tests

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

export class RadarrService {
  private config: RadarrConfiguration | null = null
  private webhookInitialized = false
  private tagsCache: Map<number, Array<{ id: number; label: string }>> =
    new Map()
  private tagsCacheExpiry: Map<number, number> = new Map()
  private TAG_CACHE_TTL = 30000 // 30 seconds in milliseconds
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly appBaseUrl: string,
    private readonly port: number,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'RADARR')
  }

  private ensureUrlHasProtocol(url: string): string {
    return url.match(/^https?:\/\//) ? url : `http://${url}`
  }

  private mapConnectionErrorToMessage(error: Error): string {
    // Prefer undici/Node fetch cause codes when available
    const cause = error.cause as { code?: string } | undefined
    const code = cause?.code
    if (error.name === 'AbortError' || code === 'ABORT_ERR') {
      return 'Connection timeout. Please check your Radarr URL and network connection.'
    }
    if (code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      return 'Connection refused. Please check if Radarr is running and the URL is correct.'
    }
    if (code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
      return 'Server not found. Please check your Radarr URL.'
    }
    if (code === 'ETIMEDOUT' || error.message.includes('ETIMEDOUT')) {
      return 'Connection timeout. Please check your network and firewall settings.'
    }
    if (code === 'ECONNRESET' || error.message.includes('ECONNRESET')) {
      return 'Connection was reset. Please check your network stability.'
    }
    return 'Network error. Please check your connection and Radarr URL.'
  }

  private get radarrConfig(): RadarrConfiguration {
    if (!this.config) {
      throw new Error('Radarr service not initialized')
    }
    return this.config
  }

  /**
   * Generates a unique webhook name for this Pulsarr instance.
   * Format: "Pulsarr (hostname:port)" for HTTP, "Pulsarr (hostname)" for HTTPS
   * This allows multiple Pulsarr instances to create webhooks on the same Radarr.
   */
  private getWebhookName(): string {
    try {
      const url = new URL(this.appBaseUrl)
      const isHttps = url.protocol === 'https:'
      // For HTTPS, just hostname (port 443 implied). For HTTP, include port.
      const identifier = isHttps ? url.hostname : `${url.hostname}:${this.port}`
      return `Pulsarr (${identifier})`
    } catch {
      // Fallback if URL parsing fails
      return `Pulsarr (${this.port})`
    }
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

    // Set the webhook path with basePath
    const basePath = normalizeBasePath(this.fastify.config.basePath)
    url.pathname =
      basePath === '/'
        ? '/v1/notifications/webhook'
        : `${basePath}/v1/notifications/webhook`

    // Add instance identifier for tracking
    const urlIdentifier = this.radarrConfig.radarrBaseUrl
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase()

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
      const webhookName = this.getWebhookName()
      this.log.info(
        `Credentials verified, attempting to setup webhook "${webhookName}" with URL for Radarr: ${expectedWebhookUrl}`,
      )

      const existingWebhooks =
        await this.getFromRadarr<WebhookNotification[]>('notification')

      // Find webhook with NEW format name (already migrated or fresh install)
      const newFormatWebhook = existingWebhooks.find(
        (hook) => hook.name === webhookName,
      )

      // Find LEGACY "Pulsarr" webhook with matching URL (needs migration)
      const legacyWebhook = existingWebhooks.find(
        (hook) =>
          hook.name === 'Pulsarr' &&
          hook.fields?.some(
            (f) => f.name === 'url' && f.value === expectedWebhookUrl,
          ),
      )

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
        name: webhookName,
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
            value: [
              {
                key: 'X-Pulsarr-Secret',
                value: this.fastify.config.webhookSecret,
              },
            ],
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
        if (newFormatWebhook) {
          // Already using new format - delete and recreate to ensure config is current
          this.log.debug(
            { webhookId: newFormatWebhook.id },
            'Recreating existing Pulsarr webhook to ensure config is current',
          )
          await this.deleteNotification(newFormatWebhook.id)
          await this.postToRadarr('notification', webhookConfig)
          this.log.info(
            `Successfully updated Pulsarr webhook "${webhookName}" for Radarr`,
          )
        } else if (legacyWebhook) {
          // Migrate from legacy "Pulsarr" to new format with unique name
          this.log.info(
            { webhookId: legacyWebhook.id },
            'Migrating legacy "Pulsarr" webhook to new naming format',
          )
          await this.deleteNotification(legacyWebhook.id)
          await this.postToRadarr('notification', webhookConfig)
          this.log.info(
            `Successfully migrated Pulsarr webhook to "${webhookName}" for Radarr`,
          )
        } else {
          // Fresh install - create new webhook
          const response = await this.postToRadarr(
            'notification',
            webhookConfig,
          )
          this.log.info(
            `Successfully created Pulsarr webhook "${webhookName}" for Radarr: ${expectedWebhookUrl}`,
          )
          this.log.debug(
            { response: response },
            'Webhook creation response for Radarr:',
          )
        }
      } catch (createError) {
        let errorMessage = 'Failed to create webhook'
        if (createError instanceof HttpError) {
          errorMessage = `Failed to create webhook: ${createError.message}`
          throw new HttpError(errorMessage, createError.status)
        }
        if (createError instanceof Error) {
          errorMessage = `Failed to create webhook: ${createError.message}`
        }
        throw new Error(errorMessage, { cause: createError })
      }

      this.webhookInitialized = true
    } catch (error) {
      // Preserve HttpError instances to maintain status - don't log, let caller handle
      if (error instanceof HttpError) {
        throw error
      }

      let errorMessage = 'Failed to setup webhook'
      if (error instanceof Error) {
        errorMessage = error.message
      }

      throw new Error(errorMessage, { cause: error })
    }
  }

  async removeWebhook(): Promise<void> {
    try {
      const webhookName = this.getWebhookName()
      const expectedWebhookUrl = this.constructWebhookUrl()
      const existingWebhooks =
        await this.getFromRadarr<WebhookNotification[]>('notification')

      // Find webhook with new format name OR legacy "Pulsarr" name with matching URL
      // URL matching for legacy webhooks prevents deleting other instances' webhooks
      const pulsarrWebhooks = existingWebhooks.filter(
        (hook) =>
          hook.name === webhookName ||
          (hook.name === 'Pulsarr' &&
            hook.fields?.some(
              (f) => f.name === 'url' && f.value === expectedWebhookUrl,
            )),
      )

      for (const webhook of pulsarrWebhooks) {
        await this.deleteNotification(webhook.id)
        this.log.info(
          `Successfully removed Pulsarr webhook "${webhook.name}" for Radarr`,
        )
      }
    } catch (error) {
      this.log.error({ error }, 'Failed to remove webhook for Radarr')
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
      signal: AbortSignal.timeout(RADARR_API_TIMEOUT),
    })
    if (!response.ok) {
      let errorDetail = response.statusText
      try {
        const errorData = await response.json()
        const parsed = parseArrErrorMessage(errorData)
        if (parsed) {
          errorDetail = parsed
        }
      } catch {}

      if (response.status === 401) {
        throw new HttpError('Authentication failed. Check API key.', 401)
      }
      if (response.status === 404) {
        throw new HttpError(`Notification not found: ${notificationId}`, 404)
      }
      throw new HttpError(`Radarr API error: ${errorDetail}`, response.status)
    }
  }

  async initialize(instance: RadarrInstance): Promise<void> {
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
        radarrBaseUrl: this.ensureUrlHasProtocol(instance.baseUrl),
        radarrApiKey: instance.apiKey,
        radarrQualityProfileId: instance.qualityProfile || null,
        radarrRootFolder: instance.rootFolder || null,
        radarrTagIds: instance.tags,
      }
      return
    }

    this.config = {
      radarrBaseUrl: this.ensureUrlHasProtocol(instance.baseUrl),
      radarrApiKey: instance.apiKey,
      radarrQualityProfileId: instance.qualityProfile || null,
      radarrRootFolder: instance.rootFolder || null,
      radarrTagIds: instance.tags,
      searchOnAdd:
        instance.searchOnAdd !== undefined ? instance.searchOnAdd : true,
      minimumAvailability: instance.minimumAvailability || 'released',
      monitor: instance.monitor || 'movieOnly',
    }

    this.log.debug(
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
            { error, instanceName: instance.name },
            'Failed to setup webhook after server start',
          )
        }
      })
    }
  }

  /**
   * Updates the service configuration without reinitializing webhooks.
   * Used when only configuration values change (not server/API key).
   */
  updateConfiguration(instance: RadarrInstance): void {
    if (!this.config) {
      throw new Error('Service not initialized - cannot update configuration')
    }

    // Update only the configuration values that can change without server changes
    this.config.radarrQualityProfileId = instance.qualityProfile || null
    this.config.radarrRootFolder = instance.rootFolder || null
    this.config.radarrTagIds = instance.tags
    this.config.searchOnAdd =
      instance.searchOnAdd !== undefined ? instance.searchOnAdd : true
    this.config.minimumAvailability = instance.minimumAvailability || 'released'
    this.config.monitor = instance.monitor || 'movieOnly'

    // Update instance ID for caching purposes
    this.instanceId = instance.id

    this.log.debug(`Updated configuration for Radarr instance ${instance.name}`)
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

  async fetchQualityProfiles(): Promise<QualityProfile[]> {
    try {
      const profiles =
        await this.getFromRadarr<QualityProfile[]>('qualityprofile')
      return profiles
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching quality profiles')
      throw err
    }
  }

  async fetchRootFolders(): Promise<RootFolder[]> {
    try {
      const rootFolders = await this.getFromRadarr<RootFolder[]>('rootfolder')
      return rootFolders
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching root folders')
      throw err
    }
  }

  async getAllMovies(): Promise<RadarrMovie[]> {
    try {
      return await this.getFromRadarr<RadarrMovie[]>('movie')
    } catch (error) {
      this.log.error({ error }, 'Error fetching all movies:')
      throw error
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
      const movies = await this.getFromRadarr<RadarrMovie[]>(
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
        error: err instanceof Error ? err.message : String(err),
      }
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
          signal: AbortSignal.timeout(RADARR_API_TIMEOUT),
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

      this.log.debug(`Fetched all movie exclusions (${allExclusions.length})`)
      return new Set(allExclusions.map((movie) => this.toItem(movie)))
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

  async addToRadarr(
    item: Item,
    overrideRootFolder?: string,
    overrideQualityProfileId?: number | string | null,
    overrideTags?: string[],
    overrideSearchOnAdd?: boolean | null,
    overrideMinimumAvailability?: MinimumAvailability,
    overrideMonitor?: RadarrMonitorType | null,
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
        monitor: overrideMonitor ?? config.monitor ?? 'movieOnly',
      }

      const tmdbId = extractTmdbId(item.guids)

      const rootFolderPath = await this.resolveRootFolder(overrideRootFolder)

      // Only fetch quality profiles if no override provided
      const qualityProfileId =
        overrideQualityProfileId !== undefined
          ? overrideQualityProfileId
          : await this.resolveQualityProfileId(
              await this.fetchQualityProfiles(),
            )

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

      await this.postToRadarr<void>('movie', movie)
      this.log.info(
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
        this.log.info(`Deleted ${item.title} from Radarr`)
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
      this.log.info(`Deleted ${item.title} from Radarr`)
    } catch (err) {
      this.log.error({ error: err }, 'Error deleting from Radarr')
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
      signal: AbortSignal.timeout(RADARR_API_TIMEOUT),
    })

    if (!response.ok) {
      let errorDetail = response.statusText
      try {
        const errorData = await response.json()
        const parsed = parseArrErrorMessage(errorData)
        if (parsed) {
          errorDetail = parsed
        }
      } catch {}

      if (response.status === 401) {
        throw new HttpError('Authentication failed. Check API key.', 401)
      }
      if (response.status === 404) {
        throw new HttpError(`API endpoint not found: ${endpoint}`, 404)
      }
      throw new HttpError(`Radarr API error: ${errorDetail}`, response.status)
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
        signal: AbortSignal.timeout(RADARR_API_TIMEOUT),
      })

      // Handle 204 No Content responses
      if (response.status === 204) {
        return undefined as unknown as T
      }

      if (!response.ok) {
        let errorDetail = response.statusText
        try {
          const errorData = await response.json()
          const parsed = parseArrErrorMessage(errorData)
          if (parsed) {
            errorDetail = parsed
          }
        } catch {}

        if (response.status === 401) {
          throw new HttpError('Authentication failed. Check API key.', 401)
        }
        if (response.status === 404) {
          throw new HttpError(`API endpoint not found: ${endpoint}`, 404)
        }
        throw new HttpError(`Radarr API error: ${errorDetail}`, response.status)
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
      signal: AbortSignal.timeout(RADARR_API_TIMEOUT),
    })

    if (!response.ok) {
      let errorDetail = response.statusText
      try {
        const errorData = await response.json()
        const parsed = parseArrErrorMessage(errorData)
        if (parsed) {
          errorDetail = parsed
        }
      } catch {}

      if (response.status === 401) {
        throw new HttpError('Authentication failed. Check API key.', 401)
      }
      if (response.status === 404) {
        throw new HttpError(`Resource not found: movie/${id}`, 404)
      }
      throw new HttpError(`Radarr API error: ${errorDetail}`, response.status)
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
          message: 'Invalid URL format. Please check your Radarr URL.',
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
          signal: AbortSignal.timeout(RADARR_CONNECTION_TEST_TIMEOUT),
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
          message:
            'Network error. Please check your connection and Radarr URL.',
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
            message: 'API endpoint not found. Please check your Radarr URL.',
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
            signal: AbortSignal.timeout(RADARR_API_TIMEOUT),
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
        } catch (_notificationError) {
          return {
            success: false,
            message:
              'Connected to Radarr but cannot access notification API. Check API key permissions.',
          }
        }
      } catch (error) {
        // If something else went wrong in the notification check
        this.log.warn({ error: error }, 'Webhook API test failed:')
        return {
          success: false,
          message:
            'Connected to Radarr but webhook testing failed. Please check API key permissions.',
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Connection test error:')

      if (error instanceof Error) {
        if (error.message.includes('Invalid URL')) {
          return {
            success: false,
            message: 'Invalid URL format. Please check your Radarr URL.',
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

  /**
   * Check if this Radarr instance is healthy and responding
   * @returns Promise resolving to HealthCheckResult
   */
  async isHealthy(): Promise<HealthCheckResult> {
    if (
      !this.config ||
      !this.config.radarrApiKey ||
      !this.config.radarrBaseUrl
    ) {
      return {
        healthy: false,
        error: 'Radarr service not initialized',
      }
    }

    try {
      const statusUrl = new URL(
        `${this.config.radarrBaseUrl}/api/v3/system/status`,
      )
      const response = await fetch(statusUrl.toString(), {
        method: 'GET',
        headers: {
          'X-Api-Key': this.config.radarrApiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(RADARR_CONNECTION_TEST_TIMEOUT),
      })

      if (!response.ok) {
        return {
          healthy: false,
          error: `Radarr responded with status ${response.status}`,
        }
      }

      return { healthy: true }
    } catch (error) {
      return {
        healthy: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error checking Radarr health',
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
      this.log.error({ error }, 'Error configuring Plex notification:')
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
      this.log.error({ error }, 'Error removing Plex notification from Radarr:')
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
        { error, instanceId },
        'Failed to refresh tags cache for Radarr instance',
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
      // Radarr returns 409 Conflict if the tag already exists
      if (err instanceof HttpError && err.status === 409) {
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
      const movie = await this.getFromRadarr<RadarrMovie>(`movie/${movieId}`)

      // Normalize both tag arrays for comparison
      const currentTags = [...new Set(movie.tags || [])].sort()
      const newTags = [...new Set(tagIds)].sort()

      // Skip update if tags are already correct
      if (JSON.stringify(currentTags) === JSON.stringify(newTags)) {
        this.log.debug(
          `Tags already correct for movie ID ${movieId}, skipping update`,
        )
        return
      }

      // Use Set to deduplicate tags
      movie.tags = [...new Set(tagIds)]

      // Send the update
      await this.putToRadarr(`movie/${movieId}`, movie)

      this.log.debug({ movieId, tagIds }, `Updated tags for movie ${movieId}`)
    } catch (error) {
      this.log.error({ error }, `Failed to update tags for movie ${movieId}:`)
      throw error
    }
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

      // Process each tag group as a bulk operation
      const promises = Array.from(tagGroups.entries()).map(
        async ([tagKey, movieIds]) => {
          const tagIds =
            tagKey === ''
              ? []
              : tagKey.split(',').map((id) => Number.parseInt(id, 10))

          const payload = {
            movieIds: movieIds,
            tags: tagIds,
            applyTags: 'replace' as const, // Replace existing tags
          }

          await this.putToRadarr('movie/editor', payload)

          this.log.debug(
            `Bulk updated ${movieIds.length} movies with tags [${tagIds.join(', ')}]`,
          )
        },
      )

      await Promise.all(promises)

      this.log.info(
        `Bulk updated tags for ${updates.length} movies across ${tagGroups.size} tag groups`,
      )
    } catch (error) {
      this.log.error({ error }, 'Failed to bulk update movie tags:')
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
      signal: AbortSignal.timeout(RADARR_API_TIMEOUT),
    })

    if (!response.ok) {
      let errorDetail = response.statusText
      try {
        const errorData = await response.json()
        const parsed = parseArrErrorMessage(errorData)
        if (parsed) {
          errorDetail = parsed
        }
      } catch {}

      if (response.status === 401) {
        throw new HttpError('Authentication failed. Check API key.', 401)
      }
      if (response.status === 404) {
        throw new HttpError(`API endpoint not found: ${endpoint}`, 404)
      }
      throw new HttpError(`Radarr API error: ${errorDetail}`, response.status)
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
      signal: AbortSignal.timeout(RADARR_API_TIMEOUT),
    })

    if (!response.ok) {
      let errorDetail = response.statusText
      try {
        const errorData = await response.json()
        const parsed = parseArrErrorMessage(errorData)
        if (parsed) {
          errorDetail = parsed
        }
      } catch {}

      if (response.status === 401) {
        throw new HttpError('Authentication failed. Check API key.', 401)
      }
      if (response.status === 404) {
        throw new HttpError(`Tag not found: ${tagId}`, 404)
      }
      throw new HttpError(`Radarr API error: ${errorDetail}`, response.status)
    }

    // Invalidate the tags cache since we've deleted a tag
    this.invalidateTagsCache()
  }
}
