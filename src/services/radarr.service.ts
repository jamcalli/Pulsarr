import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import type {
  MinimumAvailability,
  RadarrMonitorType,
} from '@root/schemas/radarr/add-options.schema.js'
import { HttpError } from '@root/types/arr-connection.types.js'
import type {
  ConnectionTestResult,
  Item,
  QualityProfile,
  RadarrAddOptions,
  RadarrConfiguration,
  RadarrExclusion,
  RadarrInstance,
  RadarrMovie,
  RadarrPost,
  RadarrTagDetail,
  RootFolder,
  WebhookNotification,
} from '@root/types/radarr.types.js'
import type { ArrAddedSettings } from '@root/types/router.types.js'
import type {
  ExistenceCheckResult,
  HealthCheckResult,
} from '@root/types/service-result.types.js'
import {
  isRadarrStatus,
  isSystemStatus,
} from '@root/types/system-status.types.js'
import {
  ARR_API_TIMEOUT_MS,
  ARR_CONNECTION_TEST_TIMEOUT_MS,
  ArrClient,
} from '@services/arr/arr-client.js'
import {
  type ArrNotification,
  type ArrWebhookProduct,
  type ArrWebhookTarget,
  findPulsarrWebhooks,
  removeWebhooks,
  sendWebhookTest,
  setupWebhook,
  testWebhookCallback,
  webhookName,
} from '@services/arr/arr-webhook.js'
import { isWebhookCallbackFailure } from '@utils/arr-error.js'
import { errorMessage } from '@utils/error-message.js'
import {
  extractRadarrId,
  extractTmdbId,
  hasMatchingGuids,
  normalizeGuid,
} from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import {
  findQualityProfileName,
  parseQualityProfileId,
} from '@utils/quality-profile.js'
import { ensureHttpScheme } from '@utils/url.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'

// Bulk tag update concurrency limit
const BULK_TAG_CONCURRENCY = 4

export const RADARR_WEBHOOK: ArrWebhookProduct = {
  appName: 'Radarr',
  flags: {
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
  },
  fields: (url, secret) => [
    {
      order: 0,
      name: 'url',
      label: 'Webhook URL',
      value: url,
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
        { value: 1, name: 'POST', order: 1, dividerAfter: false },
        { value: 2, name: 'PUT', order: 2, dividerAfter: false },
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
      value: [{ key: 'X-Pulsarr-Secret', value: secret }],
      type: 'keyValueList',
      advanced: true,
      privacy: 'normal',
      isFloat: false,
    },
  ],
  infoLink: 'https://wiki.servarr.com/radarr/supported#webhook',
}

export class RadarrService {
  private config: RadarrConfiguration | null = null
  private arrClient: ArrClient | null = null
  private webhookInitialized = false
  private tagsCache: Map<number, Array<{ id: number; label: string }>> =
    new Map()
  private tagsCacheExpiry: Map<number, number> = new Map()
  private TAG_CACHE_TTL = 30000 // 30 seconds in milliseconds
  private qualityProfilesCache: Map<number, QualityProfile[]> = new Map()
  private qualityProfilesCacheExpiry: Map<number, number> = new Map()
  private QUALITY_PROFILE_CACHE_TTL = 30000
  private exclusionTmdbIds: Promise<Set<number>> | null = null
  private exclusionCacheExpiry = 0
  private readonly EXCLUSION_CACHE_TTL = 30000
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly appBaseUrl: string,
    private readonly port: number,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'RADARR')
  }

  private mapConnectionErrorToMessage(error: Error): string {
    // Prefer undici/Node fetch cause codes when available
    const cause = error.cause as { code?: string } | undefined
    const code = cause?.code
    if (
      error.name === 'TimeoutError' ||
      error.name === 'AbortError' ||
      code === 'ABORT_ERR'
    ) {
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

  /** Throws until initialize or testWebhookCallback has set the instance credentials. */
  get client(): ArrClient {
    if (!this.arrClient) {
      throw new Error('Radarr service not initialized')
    }
    return this.arrClient
  }

  private credentialClient(baseUrl: string, apiKey: string): ArrClient {
    return new ArrClient({
      appName: 'Radarr',
      baseUrl,
      apiKey,
      timeoutMs: ARR_CONNECTION_TEST_TIMEOUT_MS,
    })
  }

  private webhookTarget(client: ArrClient): ArrWebhookTarget {
    return {
      product: RADARR_WEBHOOK,
      address: {
        appBaseUrl: this.appBaseUrl,
        port: this.port,
        basePath: this.fastify.config.basePath,
        webhookSecret: this.fastify.config.webhookSecret,
      },
      client,
    }
  }

  getWebhookName(): string {
    return webhookName(this.appBaseUrl, this.port)
  }

  private async setupWebhook(instanceName: string): Promise<void> {
    if (this.webhookInitialized) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))

    await setupWebhook(this.webhookTarget(this.client), instanceName, this.log)
    this.webhookInitialized = true
  }

  async removeWebhook(): Promise<void> {
    await removeWebhooks(this.webhookTarget(this.client), this.log)
  }

  private configure(instance: RadarrInstance): void {
    this.config = {
      radarrBaseUrl: ensureHttpScheme(instance.baseUrl),
      radarrApiKey: instance.apiKey,
      radarrQualityProfileId: instance.qualityProfile || null,
      radarrRootFolder: instance.rootFolder || null,
      radarrTagIds: instance.tags,
      searchOnAdd:
        instance.searchOnAdd !== undefined ? instance.searchOnAdd : true,
      minimumAvailability: instance.minimumAvailability || 'released',
      monitor: instance.monitor || 'movieOnly',
    }
    this.arrClient = new ArrClient({
      appName: 'Radarr',
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      timeoutMs: ARR_API_TIMEOUT_MS,
    })
  }

  /** Expects the service to be built with the candidate Pulsarr address and throws WebhookCallbackError when the arr cannot call it back. */
  async testWebhookCallback(instance: RadarrInstance): Promise<void> {
    this.configure(instance)
    await testWebhookCallback(this.webhookTarget(this.client))
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
    if (instance.apiKey === ARR_API_KEY_PLACEHOLDER) {
      this.log.debug(
        `Basic initialization only for ${instance.name} (placeholder credentials)`,
      )
      this.configure(instance)
      return
    }

    this.configure(instance)

    this.log.debug(
      `Successfully initialized base Radarr service for ${instance.name}`,
    )

    if (this.fastify.server.listening) {
      await this.setupWebhook(instance.name)
    } else {
      this.fastify.server.prependOnceListener('listening', async () => {
        try {
          await this.setupWebhook(instance.name)
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

  async getQualityProfiles(): Promise<QualityProfile[]> {
    if (!this.instanceId) {
      return this.fetchQualityProfiles()
    }

    const cacheExpiry = this.qualityProfilesCacheExpiry.get(this.instanceId)
    const cached = this.qualityProfilesCache.get(this.instanceId)
    if (cacheExpiry && Date.now() < cacheExpiry && cached) {
      return cached
    }

    return this.refreshQualityProfilesCache(this.instanceId)
  }

  private async refreshQualityProfilesCache(
    instanceId: number,
  ): Promise<QualityProfile[]> {
    try {
      const profiles = await this.fetchQualityProfiles()
      this.qualityProfilesCache.set(instanceId, profiles)
      this.qualityProfilesCacheExpiry.set(
        instanceId,
        Date.now() + this.QUALITY_PROFILE_CACHE_TTL,
      )
      return profiles
    } catch (error) {
      const stale = this.qualityProfilesCache.get(instanceId)
      if (stale) {
        this.log.warn(
          `Using stale quality profiles cache for Radarr instance ${instanceId}`,
        )
        return stale
      }
      throw error
    }
  }

  async fetchQualityProfiles(): Promise<QualityProfile[]> {
    try {
      const profiles = await this.client.get<QualityProfile[]>('qualityprofile')
      return profiles
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching quality profiles')
      throw err
    }
  }

  async fetchRootFolders(): Promise<RootFolder[]> {
    try {
      const rootFolders = await this.client.get<RootFolder[]>('rootfolder')
      return rootFolders
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching root folders')
      throw err
    }
  }

  async getAllMovies(): Promise<RadarrMovie[]> {
    try {
      return await this.client.get<RadarrMovie[]>('movie')
    } catch (error) {
      this.log.error({ error }, 'Error fetching all movies:')
      throw error
    }
  }

  async fetchMovies(bypass = false): Promise<Set<Item>> {
    try {
      const movies = await this.client.get<RadarrMovie[]>('movie')

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
      const movies = await this.client.get<RadarrMovie[]>(
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
        error: errorMessage(err),
      }
    }
  }

  // A pending fetch stays shared until it settles; the TTL starts only once it succeeds
  async isTmdbIdExcluded(tmdbId: number): Promise<boolean> {
    if (!this.exclusionTmdbIds || Date.now() >= this.exclusionCacheExpiry) {
      const pending = this.fetchExclusionTmdbIds()
      this.exclusionTmdbIds = pending
      this.exclusionCacheExpiry = Number.POSITIVE_INFINITY
      pending.then(
        () => {
          if (this.exclusionTmdbIds === pending) {
            this.exclusionCacheExpiry = Date.now() + this.EXCLUSION_CACHE_TTL
          }
        },
        () => {
          if (this.exclusionTmdbIds === pending) this.exclusionTmdbIds = null
        },
      )
    }
    return (await this.exclusionTmdbIds).has(tmdbId)
  }

  private async fetchExclusionTmdbIds(): Promise<Set<number>> {
    const ids = new Set<number>()
    for (const item of await this.fetchExclusions()) {
      const id = extractTmdbId(item.guids)
      if (id) ids.add(id)
    }
    return ids
  }

  async fetchExclusions(): Promise<Set<Item>> {
    try {
      const exclusions = await this.client.getAllPages<RadarrExclusion>(
        'exclusions/paged',
        'movieTitle',
      )
      this.log.debug(`Fetched all movie exclusions (${exclusions.length})`)
      return new Set(
        exclusions.map((record) =>
          this.toItem({
            title: record.movieTitle,
            imdbId: undefined,
            tmdbId: record.tmdbId,
            id: record.id,
          }),
        ),
      )
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching exclusions')
      throw err
    }
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
    this.log.debug(`Using root folder: ${defaultPath}`)
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
      this.log.debug(
        `Using default quality profile: ${profiles[0].name} (ID: ${defaultId})`,
      )
      return defaultId
    }

    const configProfileId = parseQualityProfileId(configProfile)
    if (configProfileId !== undefined) {
      return configProfileId
    }

    const matchingProfile = profiles.find(
      (profile) =>
        profile.name.toLowerCase() === configProfile.toString().toLowerCase(),
    )

    if (matchingProfile) {
      this.log.debug(
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

      const rootFolderPath = await this.resolveRootFolder(overrideRootFolder)

      const qualityProfiles =
        overrideQualityProfileId !== undefined
          ? await this.getQualityProfiles().catch(() => [])
          : await this.getQualityProfiles()
      const qualityProfileId =
        overrideQualityProfileId !== undefined
          ? overrideQualityProfileId
          : await this.resolveQualityProfileId(qualityProfiles)

      // Collection for valid tag IDs (using Set to avoid duplicates)
      const tagIdsSet = new Set<string>()
      let existingTags: Array<{ id: number; label: string }> = []

      // Process override tags if provided
      if (overrideTags && overrideTags.length > 0) {
        // Get all existing tags from Radarr
        existingTags = await this.getTags()

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
          existingTags = await this.getTags()

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

  /** Reads routing options with unsaved credentials and never touches this service's config or webhook. */
  async probe(
    baseUrl: string,
    apiKey: string,
  ): Promise<{
    qualityProfiles: QualityProfile[]
    rootFolders: RootFolder[]
    tags: Array<{ id: number; label: string }>
  }> {
    const client = this.credentialClient(baseUrl, apiKey)
    const [qualityProfiles, rootFolders, tags] = await Promise.all([
      client.get<QualityProfile[]>('qualityprofile'),
      client.get<RootFolder[]>('rootfolder'),
      client.get<Array<{ id: number; label: string }>>('tag'),
    ])
    return { qualityProfiles, rootFolders, tags }
  }

  async testConnection(
    baseUrl: string,
    apiKey: string,
  ): Promise<ConnectionTestResult> {
    try {
      if (!baseUrl || !apiKey) {
        return {
          success: false,
          code: 'unreachable',
          message: 'Base URL and API key are required',
        }
      }

      let safeBaseUrl: string
      try {
        safeBaseUrl = ensureHttpScheme(baseUrl)
        new URL(safeBaseUrl)
      } catch (_urlError) {
        return {
          success: false,
          code: 'unreachable',
          message: 'Invalid URL format. Please check your Radarr URL.',
        }
      }

      const statusUrl = new URL(`${safeBaseUrl}/api/v3/system/status`)

      let response: Response
      try {
        response = await fetch(statusUrl.toString(), {
          method: 'GET',
          headers: {
            'X-Api-Key': apiKey,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(ARR_CONNECTION_TEST_TIMEOUT_MS),
        })
      } catch (fetchError) {
        return {
          success: false,
          code: 'unreachable',
          message:
            fetchError instanceof Error
              ? this.mapConnectionErrorToMessage(fetchError)
              : 'Network error. Please check your connection and Radarr URL.',
        }
      }

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            code: 'auth',
            message: 'Authentication failed. Please check your API key.',
          }
        }
        if (response.status === 404) {
          return {
            success: false,
            code: 'invalid',
            message: 'API endpoint not found. Please check your Radarr URL.',
          }
        }
        return {
          success: false,
          code: 'unreachable',
          message: `Connection failed (${response.status}): ${response.statusText}`,
        }
      }

      try {
        const statusResponse = await response.json()

        if (!isSystemStatus(statusResponse)) {
          return {
            success: false,
            code: 'invalid',
            message: 'Invalid response from server',
          }
        }

        if (!isRadarrStatus(statusResponse)) {
          return {
            success: false,
            code: 'invalid',
            message:
              'Connected service does not appear to be a valid Radarr application',
          }
        }
      } catch (_parseError) {
        return {
          success: false,
          code: 'invalid',
          message: 'Failed to parse response from server',
        }
      }

      const target = this.webhookTarget(
        this.credentialClient(safeBaseUrl, apiKey),
      )
      let existingWebhook: ArrNotification | undefined
      try {
        const { current, legacy } = await findPulsarrWebhooks(target)
        existingWebhook = current ?? legacy
      } catch (notificationError) {
        if (notificationError instanceof HttpError) {
          if (
            notificationError.status === 401 ||
            notificationError.status === 403
          ) {
            return {
              success: false,
              code: 'auth',
              message:
                'Connected to Radarr but cannot access notification API. Check API key permissions.',
            }
          }
          return {
            success: false,
            code: 'invalid',
            message: notificationError.message,
          }
        }
        if (notificationError instanceof Error) {
          return {
            success: false,
            code: 'unreachable',
            message: this.mapConnectionErrorToMessage(notificationError),
          }
        }
        throw notificationError
      }

      try {
        await sendWebhookTest(target, existingWebhook?.id)
      } catch (callbackError) {
        if (
          callbackError instanceof Error &&
          callbackError.name === 'TimeoutError'
        ) {
          return {
            success: false,
            code: 'webhook_callback_failed',
            message:
              'Radarr did not finish calling Pulsarr back in time. Check the webhook address.',
          }
        }
        if (callbackError instanceof HttpError) {
          return {
            success: false,
            code: isWebhookCallbackFailure(callbackError)
              ? 'webhook_callback_failed'
              : 'invalid',
            message: callbackError.message,
          }
        }
        throw callbackError
      }

      return {
        success: true,
        code: null,
        message: 'Connection successful and webhook API accessible',
      }
    } catch (error) {
      this.log.error({ error }, 'Connection test error:')

      if (error instanceof Error) {
        if (error.message.includes('Invalid URL')) {
          return {
            success: false,
            code: 'unreachable',
            message: 'Invalid URL format. Please check your Radarr URL.',
          }
        }
        return {
          success: false,
          code: 'unreachable',
          message: this.mapConnectionErrorToMessage(error),
        }
      }

      return {
        success: false,
        code: 'unreachable',
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
    if (!this.config?.radarrApiKey || !this.config.radarrBaseUrl) {
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
        signal: AbortSignal.timeout(ARR_CONNECTION_TEST_TIMEOUT_MS),
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
        error: errorMessage(error),
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
      const existingPlexNotification = await this.findPlexNotification()

      if (existingPlexNotification) {
        // Update existing notification
        await this.client.delete(`notification/${existingPlexNotification.id}`)
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
      await this.client.post('notification', plexConfig)
      this.log.info('Successfully configured Plex notification')
    } catch (error) {
      this.log.error({ error }, 'Error configuring Plex notification:')
      throw error
    }
  }

  private async findPlexNotification(): Promise<
    WebhookNotification | undefined
  > {
    const notifications =
      await this.client.get<WebhookNotification[]>('notification')
    return notifications.find((n) => n.implementation === 'PlexServer')
  }

  async hasPlexNotification(): Promise<boolean> {
    return (await this.findPlexNotification()) !== undefined
  }

  async removePlexNotification(): Promise<void> {
    try {
      // Find Plex server notification
      const existingPlexNotification = await this.findPlexNotification()

      if (existingPlexNotification) {
        // Delete the notification
        await this.client.delete(`notification/${existingPlexNotification.id}`)
        this.log.info('Successfully removed Plex notification from Radarr')
      } else {
        this.log.debug('No Plex notification found to remove from Radarr')
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

  async getTagDetails(): Promise<RadarrTagDetail[]> {
    return await this.client.get<RadarrTagDetail[]>('tag/detail')
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
    return await this.client.get<Array<{ id: number; label: string }>>('tag')
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
      const result = await this.client.post<{ id: number; label: string }>(
        'tag',
        { label },
      )

      // Invalidate the tags cache since we've added a new tag
      this.invalidateTagsCache()

      if (!result) throw new Error(`Radarr returned no tag for "${label}"`)
      return result
    } catch (err) {
      // Radarr returns 409 Conflict if the tag already exists
      if (err instanceof HttpError && err.status === 409) {
        this.log.debug(
          `Tag "${label}" already exists in Radarr, skipping creation`,
        )
        // Invalidate cache and fetch fresh to find the existing tag
        this.invalidateTagsCache()
        const existing = (await this.getTags()).find((t) => t.label === label)
        if (existing) return existing
      }
      throw err
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
    applyTags: 'add' | 'remove' | 'replace' = 'replace',
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

      // Process each tag group as a bulk operation with concurrency limit
      const limit = pLimit(BULK_TAG_CONCURRENCY)
      const promises = Array.from(tagGroups.entries()).map(
        ([tagKey, movieIds]) =>
          limit(async () => {
            const tagIds =
              tagKey === ''
                ? []
                : tagKey.split(',').map((id) => Number.parseInt(id, 10))

            const payload = {
              movieIds: movieIds,
              tags: tagIds,
              applyTags,
            }

            await this.client.put('movie/editor', payload)

            this.log.debug(
              `Bulk updated ${movieIds.length} movies with tags [${tagIds.join(', ')}] (mode: ${applyTags})`,
            )
          }),
      )

      await Promise.all(promises)

      this.log.debug(
        `Bulk updated tags for ${updates.length} movies across ${tagGroups.size} tag groups (mode: ${applyTags})`,
      )
    } catch (error) {
      this.log.error({ error }, 'Failed to bulk update movie tags:')
      throw error
    }
  }

  /**
   * Delete a tag from Radarr
   *
   * @param tagId The ID of the tag to delete
   * @returns Promise resolving when the delete operation is complete
   */
  async deleteTag(tagId: number): Promise<void> {
    await this.client.delete(`tag/${tagId}`)

    // Invalidate the tags cache since we've deleted a tag
    this.invalidateTagsCache()
  }
}
