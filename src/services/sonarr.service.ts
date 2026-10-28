import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import type { SonarrSeriesType } from '@root/schemas/sonarr/series-type.schema.js'
import { HttpError } from '@root/types/arr-connection.types.js'
import type { ArrAddedSettings } from '@root/types/router.types.js'
import type {
  ExistenceCheckResult,
  HealthCheckResult,
} from '@root/types/service-result.types.js'
import type {
  ConnectionTestResult,
  SonarrItem as Item,
  QualityProfile,
  RootFolder,
  SonarrAddOptions,
  SonarrConfiguration,
  SonarrEpisode,
  SonarrInstance,
  SonarrPost,
  SonarrSeries,
  SonarrTagDetail,
  WebhookNotification,
} from '@root/types/sonarr.types.js'
import {
  isSonarrStatus,
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
  extractSonarrId,
  extractTvdbId,
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

export const SONARR_WEBHOOK: ArrWebhookProduct = {
  appName: 'Sonarr',
  flags: {
    onGrab: false,
    onDownload: true,
    onUpgrade: false,
    // ImportComplete has no upgrade gate and repeats every per-file Download, so it stays off
    onImportComplete: false,
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
  },
  fields: (url, secret) => [
    {
      order: 0,
      name: 'url',
      label: 'Webhook URL',
      value: url,
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
    {
      order: 2,
      name: 'headers',
      label: 'Headers',
      value: [{ key: 'X-Pulsarr-Secret', value: secret }],
      type: 'keyValueList',
      advanced: true,
    },
  ],
  infoLink: 'https://wiki.servarr.com/sonarr/supported#webhook',
}

export class SonarrService {
  private config: SonarrConfiguration | null = null
  private arrClient: ArrClient | null = null
  private webhookInitialized = false
  private instanceId?: number // The current instance ID (set during initialization)
  private tagsCache: Map<number, Array<{ id: number; label: string }>> =
    new Map()
  private tagsCacheExpiry: Map<number, number> = new Map()
  private TAG_CACHE_TTL = 30000 // 30 seconds in milliseconds
  private qualityProfilesCache: Map<number, QualityProfile[]> = new Map()
  private qualityProfilesCacheExpiry: Map<number, number> = new Map()
  private QUALITY_PROFILE_CACHE_TTL = 30000
  private exclusionTvdbIds: Promise<Set<number>> | null = null
  private exclusionCacheExpiry = 0
  private readonly EXCLUSION_CACHE_TTL = 30000
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly appBaseUrl: string,
    private readonly port: number,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'SONARR')
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
      return 'Connection timeout. Please check your Sonarr URL and network connection.'
    }
    if (code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      return 'Connection refused. Please check if Sonarr is running and the URL is correct.'
    }
    if (code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
      return 'Server not found. Please check your Sonarr URL.'
    }
    if (code === 'ETIMEDOUT' || error.message.includes('ETIMEDOUT')) {
      return 'Connection timeout. Please check your network and firewall settings.'
    }
    if (code === 'ECONNRESET' || error.message.includes('ECONNRESET')) {
      return 'Connection was reset. Please check your network stability.'
    }
    return 'Network error. Please check your connection and Sonarr URL.'
  }

  private get sonarrConfig(): SonarrConfiguration {
    if (!this.config) {
      throw new Error('Sonarr service not initialized')
    }
    return this.config
  }

  /** Throws until initialize or testWebhookCallback has set the instance credentials. */
  get client(): ArrClient {
    if (!this.arrClient) {
      throw new Error('Sonarr service not initialized')
    }
    return this.arrClient
  }

  private credentialClient(baseUrl: string, apiKey: string): ArrClient {
    return new ArrClient({
      appName: 'Sonarr',
      baseUrl,
      apiKey,
      timeoutMs: ARR_CONNECTION_TEST_TIMEOUT_MS,
    })
  }

  private webhookTarget(client: ArrClient): ArrWebhookTarget {
    return {
      product: SONARR_WEBHOOK,
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

  private configure(instance: SonarrInstance): void {
    this.config = {
      sonarrBaseUrl: ensureHttpScheme(instance.baseUrl),
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
    this.arrClient = new ArrClient({
      appName: 'Sonarr',
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      timeoutMs: ARR_API_TIMEOUT_MS,
    })
  }

  /** Expects the service to be built with the candidate Pulsarr address and throws WebhookCallbackError when the arr cannot call it back. */
  async testWebhookCallback(instance: SonarrInstance): Promise<void> {
    this.configure(instance)
    await testWebhookCallback(this.webhookTarget(this.client))
  }

  async initialize(instance: SonarrInstance): Promise<void> {
    if (!instance.baseUrl || !instance.apiKey) {
      throw new Error(
        'Invalid Sonarr configuration: baseUrl and apiKey are required',
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
      `Successfully initialized base Sonarr service for ${instance.name}`,
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
            'Failed to setup webhook after server start for Sonarr',
          )
        }
      })
    }
  }

  /**
   * Updates the service configuration without reinitializing webhooks.
   * Used when only configuration values change (not server/API key).
   */
  updateConfiguration(instance: SonarrInstance): void {
    if (!this.config) {
      throw new Error('Service not initialized - cannot update configuration')
    }

    // Update only the configuration values that can change without server changes
    this.config.sonarrQualityProfileId = instance.qualityProfile || null
    this.config.sonarrRootFolder = instance.rootFolder || null
    this.config.sonarrTagIds = instance.tags
    this.config.sonarrSeasonMonitoring = instance.seasonMonitoring
    this.config.sonarrMonitorNewItems = instance.monitorNewItems || 'all'
    this.config.sonarrSeriesType = instance.seriesType || 'standard'
    this.config.createSeasonFolders = instance.createSeasonFolders
    this.config.searchOnAdd =
      instance.searchOnAdd !== undefined ? instance.searchOnAdd : true

    // Update instance ID for caching purposes
    this.instanceId = instance.id

    this.log.debug(`Updated configuration for Sonarr instance ${instance.name}`)
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
          message: 'Invalid URL format. Please check your Sonarr URL.',
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
              : 'Network error. Please check your connection and Sonarr URL.',
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
            message: 'API endpoint not found. Please check your Sonarr URL.',
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

        if (!isSonarrStatus(statusResponse)) {
          return {
            success: false,
            code: 'invalid',
            message:
              'Connected service does not appear to be a valid Sonarr application',
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
                'Connected to Sonarr but cannot access notification API. Check API key permissions.',
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
              'Sonarr did not finish calling Pulsarr back in time. Check the webhook address.',
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
            message: 'Invalid URL format. Please check your Sonarr URL.',
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
   * Check if this Sonarr instance is healthy and responding
   * @returns Promise resolving to HealthCheckResult
   */
  async isHealthy(): Promise<HealthCheckResult> {
    if (!this.config?.sonarrApiKey || !this.config.sonarrBaseUrl) {
      return {
        healthy: false,
        error: 'Sonarr service not initialized',
      }
    }

    try {
      const statusUrl = new URL(
        `${this.config.sonarrBaseUrl}/api/v3/system/status`,
      )
      const response = await fetch(statusUrl.toString(), {
        method: 'GET',
        headers: {
          'X-Api-Key': this.config.sonarrApiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(ARR_CONNECTION_TEST_TIMEOUT_MS),
      })

      if (!response.ok) {
        return {
          healthy: false,
          error: `Sonarr responded with status ${response.status}`,
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
          `Using stale quality profiles cache for Sonarr instance ${instanceId}`,
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

  async fetchSeries(bypass = false): Promise<Set<Item>> {
    try {
      const shows = await this.client.get<SonarrSeries[]>('series')

      let exclusions: Set<Item> = new Set()
      if (!bypass) {
        exclusions = await this.fetchExclusions()
      }

      const showItems = shows.map((show) => this.toItem(show))

      // Mark exclusions so they can be filtered out from tagging
      const exclusionItems = Array.from(exclusions).map((item) => ({
        ...item,
        isExclusion: true,
      }))

      const allItems = [...showItems, ...exclusionItems]

      return new Set(allItems)
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
      const series = await this.client.get<SonarrSeries[]>(
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
        error: errorMessage(err),
      }
    }
  }

  /**
   * Get full series data by Sonarr series ID, including season statistics.
   * Returns null when the series does not exist; rethrows other errors so
   * callers can distinguish a missing series from a failed lookup.
   */
  async getSeriesById(seriesId: number): Promise<SonarrSeries | null> {
    try {
      return await this.client.get<SonarrSeries>(`series/${seriesId}`)
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return null
      }
      this.log.error(
        { error: err, seriesId },
        'Error fetching series by Sonarr ID',
      )
      throw err
    }
  }

  // A pending fetch stays shared until it settles; the TTL starts only once it succeeds
  async isTvdbIdExcluded(tvdbId: number): Promise<boolean> {
    if (!this.exclusionTvdbIds || Date.now() >= this.exclusionCacheExpiry) {
      const pending = this.fetchExclusionTvdbIds()
      this.exclusionTvdbIds = pending
      this.exclusionCacheExpiry = Number.POSITIVE_INFINITY
      pending.then(
        () => {
          if (this.exclusionTvdbIds === pending) {
            this.exclusionCacheExpiry = Date.now() + this.EXCLUSION_CACHE_TTL
          }
        },
        () => {
          if (this.exclusionTvdbIds === pending) this.exclusionTvdbIds = null
        },
      )
    }
    return (await this.exclusionTvdbIds).has(tvdbId)
  }

  private async fetchExclusionTvdbIds(): Promise<Set<number>> {
    const ids = new Set<number>()
    for (const item of await this.fetchExclusions()) {
      const id = extractTvdbId(item.guids)
      if (id) ids.add(id)
    }
    return ids
  }

  async fetchExclusions(): Promise<Set<Item>> {
    try {
      const exclusions = await this.client.getAllPages<SonarrSeries>(
        'importlistexclusion/paged',
        'title',
      )
      this.log.debug(`Fetched all exclusions (${exclusions.length} shows)`)
      return new Set(exclusions.map((show) => this.toItem(show)))
    } catch (err) {
      this.log.error({ error: err }, 'Error fetching exclusions')
      throw err
    }
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
    this.log.debug(`Using root folder: ${defaultPath}`)
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

  async addToSonarr(
    item: Item,
    overrideRootFolder?: string,
    overrideQualityProfileId?: number | string | null,
    overrideTags?: string[],
    overrideSearchOnAdd?: boolean | null,
    overrideSeasonMonitoring?: string | null,
    overrideSeriesType?: SonarrSeriesType | null,
    overrideCreateSeasonFolders?: boolean | null,
  ): Promise<ArrAddedSettings & { seriesId: number }> {
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
      const monitorStrategy = overrideSeasonMonitoring
        ? overrideSeasonMonitoring
        : config.sonarrSeasonMonitoring || 'all'

      const addOptions: SonarrAddOptions = {
        monitor: monitorStrategy,
        searchForCutoffUnmetEpisodes: shouldSearch,
        searchForMissingEpisodes: shouldSearch,
      }

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
        // Get all existing tags from Sonarr
        existingTags = await this.getTags()

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
          existingTags = await this.getTags()

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
      const seriesType = overrideSeriesType
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
        tvdbId: extractTvdbId(item.guids),
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

      const createdSeries = await this.client.post<SonarrSeries>('series', show)
      if (!createdSeries || typeof createdSeries.id !== 'number') {
        throw new Error('Unexpected Sonarr response when creating series')
      }
      this.log.debug(
        {
          title: item.title,
          qualityProfileId,
          rootFolder: rootFolderPath,
          tags: tags.length > 0 ? tags : undefined,
          seriesType,
          seasonMonitoring: addOptions.monitor,
          searchOnAdd: addOptions.searchForMissingEpisodes,
        },
        `Sent ${item.title} to Sonarr`,
      )
      const labelById = new Map(existingTags.map((t) => [t.id, t.label]))
      return {
        seriesId: createdSeries.id,
        rootFolder: createdSeries.rootFolderPath ?? rootFolderPath,
        qualityProfileId: createdSeries.qualityProfileId ?? qualityProfileId,
        qualityProfileName: findQualityProfileName(
          qualityProfiles,
          createdSeries.qualityProfileId ?? qualityProfileId,
        ),
        tags: (createdSeries.tags ?? tags.map(Number)).map(
          (id) => labelById.get(id) ?? String(id),
        ),
      }
    } catch (err) {
      this.log.debug(
        { error: err, title: item.title },
        'Send to Sonarr failed (rethrowing upstream)',
      )
      throw err
    }
  }

  async deleteFromSonarr(item: Item, deleteFiles: boolean): Promise<void> {
    try {
      const sonarrId = extractSonarrId(item.guids)

      if (sonarrId > 0) {
        // Use the extracted Sonarr ID directly
        await this.deleteFromSonarrById(sonarrId, deleteFiles)
        this.log.debug(`Deleted ${item.title} from Sonarr`)
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
      this.log.debug(`Deleted ${item.title} from Sonarr`)
    } catch (err) {
      this.log.error({ error: err }, 'Error deleting from Sonarr')
      throw err
    }
  }

  private async deleteFromSonarrById(
    id: number,
    deleteFiles: boolean,
  ): Promise<void> {
    await this.client.delete(
      `series/${id}?deleteFiles=${deleteFiles}&addImportListExclusion=false`,
    )
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
      await this.client.post('notification', plexConfig)
      this.log.info('Successfully configured Plex notification for Sonarr')
    } catch (error) {
      this.log.error(
        { error },
        'Error configuring Plex notification for Sonarr:',
      )
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
        this.log.info('Successfully removed Plex notification from Sonarr')
      } else {
        this.log.debug('No Plex notification found to remove from Sonarr')
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

  async getTagDetails(): Promise<SonarrTagDetail[]> {
    return await this.client.get<SonarrTagDetail[]>('tag/detail')
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
      const result = await this.client.post<{ id: number; label: string }>(
        'tag',
        { label },
      )

      // Invalidate the tags cache since we've added a new tag
      this.invalidateTagsCache()

      if (!result) throw new Error(`Sonarr returned no tag for "${label}"`)
      return result
    } catch (err) {
      // Sonarr returns 409 Conflict if the tag already exists
      if (err instanceof HttpError && err.status === 409) {
        this.log.debug(
          `Tag "${label}" already exists in Sonarr, skipping creation`,
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
   * Bulk update tags for multiple series using the serieseditor endpoint
   * This provides significant performance improvements over individual updates
   *
   * @param updates Array of series updates containing seriesId and tagIds
   * @returns Promise resolving when all updates are complete
   */
  async bulkUpdateSeriesTags(
    updates: Array<{ seriesId: number; tagIds: number[] }>,
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
        tagGroups.get(tagKey)?.push(update.seriesId)
      }

      // Process each tag group as a bulk operation with concurrency limit
      const limit = pLimit(BULK_TAG_CONCURRENCY)
      const promises = Array.from(tagGroups.entries()).map(
        ([tagKey, seriesIds]) =>
          limit(async () => {
            const tagIds =
              tagKey === ''
                ? []
                : tagKey.split(',').map((id) => Number.parseInt(id, 10))

            const payload = {
              seriesIds: seriesIds,
              tags: tagIds,
              applyTags,
            }

            await this.client.put('series/editor', payload)

            this.log.debug(
              `Bulk updated ${seriesIds.length} series with tags [${tagIds.join(', ')}] (mode: ${applyTags})`,
            )
          }),
      )

      await Promise.all(promises)

      this.log.debug(
        `Bulk updated tags for ${updates.length} series across ${tagGroups.size} tag groups (mode: ${applyTags})`,
      )
    } catch (error) {
      this.log.error({ error }, 'Failed to bulk update series tags:')
      throw error
    }
  }

  /**
   * Delete a tag from Sonarr
   *
   * @param tagId The ID of the tag to delete
   * @returns Promise resolving when the delete operation is complete
   */
  async deleteTag(tagId: number): Promise<void> {
    await this.client.delete(`tag/${tagId}`)

    // Invalidate the tags cache since we've deleted a tag
    this.invalidateTagsCache()
  }

  /**
   * Get all series from Sonarr (raw data)
   * @returns Promise resolving to array of series
   */
  async getAllSeries(): Promise<SonarrSeries[]> {
    try {
      return await this.client.get<SonarrSeries[]>('series')
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
      const series = await this.client.get<SonarrSeries>(`series/${seriesId}`)

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
        this.log.debug(
          `Enabling monitoring for series ${seriesId} season ${seasonNumber}`,
        )
      }
      if (!series.monitored) {
        series.monitored = true
        needsUpdate = true
        this.log.debug(`Enabling monitoring for series ${seriesId}`)
      }

      // STEP 4: Update series if monitoring changed
      if (needsUpdate) {
        await this.client.put(`series/${seriesId}`, series)
        this.log.debug(
          `Updated monitoring for series ${seriesId} season ${seasonNumber}`,
        )
      }

      // STEP 5: Now trigger the search
      await this.client.post('command', {
        name: 'SeasonSearch',
        seriesId,
        seasonNumber,
      })

      this.log.debug(
        `Triggered search for series ${seriesId} season ${seasonNumber}`,
      )
    } catch (error) {
      this.log.error({ error }, 'Error searching season')
      throw error
    }
  }

  /**
   * Search for specific episodes by their IDs
   * Uses Sonarr's EpisodeSearch command for targeted episode searching
   * @param episodeIds Array of Sonarr episode IDs to search for
   */
  async searchEpisodes(episodeIds: number[]): Promise<void> {
    if (episodeIds.length === 0) return

    try {
      await this.client.post('command', {
        name: 'EpisodeSearch',
        episodeIds,
      })

      this.log.debug(`Triggered search for ${episodeIds.length} episodes`)
    } catch (error) {
      this.log.error({ error }, 'Error searching episodes')
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
      const series = await this.client.get<SonarrSeries>(`series/${seriesId}`)

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
      await this.client.put(`series/${seriesId}`, series)

      this.log.debug(
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
      const series = await this.client.get<SonarrSeries>(`series/${seriesId}`)

      // Apply updates
      const updatedSeries = {
        ...series,
        ...updates,
      }

      // Send update
      await this.client.put(`series/${seriesId}`, updatedSeries)

      this.log.debug(`Updated series ${seriesId} monitoring settings`)
    } catch (error) {
      this.log.error({ error }, 'Error updating series monitoring:')
      throw error
    }
  }

  /**
   * Wait for Sonarr to finish its post-add background refresh.
   * Sonarr queues a RefreshSeriesCommand after adding a series. Until that
   * completes, addOptions is non-null and Sonarr will re-apply its monitoring
   * preset, clobbering any episode-level changes we make. Poll until
   * addOptions is cleared, then it's safe to set custom monitoring.
   */
  async waitForAddComplete(
    seriesId: number,
    timeoutMs = 30_000,
    intervalMs = 1_000,
  ): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const series = await this.client.get<SonarrSeries>(`series/${seriesId}`)
      if (!series.addOptions) return
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    this.log.warn(
      `Timed out waiting for Sonarr to finish post-add refresh for series ${seriesId}`,
    )
  }

  /**
   * Get all episodes for a series
   * @param seriesId The Sonarr series ID
   * @returns Array of episodes
   */
  async getEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
    try {
      const episodes = await this.client.get<SonarrEpisode[]>(
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
   * Get the episode count for a specific season using the fast episode endpoint.
   * Uses /episode?seriesId=X&seasonNumber=Y which is a direct indexed query,
   * avoiding the expensive statistics computation of the /series endpoint.
   */
  async getSeasonEpisodeCount(
    seriesId: number,
    seasonNumber: number,
  ): Promise<number | null> {
    try {
      const episodes = await this.client.get<SonarrEpisode[]>(
        `episode?seriesId=${seriesId}&seasonNumber=${seasonNumber}`,
      )
      return episodes.length
    } catch (err) {
      this.log.error(
        { error: err, seriesId, seasonNumber },
        'Error fetching season episode count',
      )
      return null
    }
  }

  /**
   * Update monitoring for specific episodes
   * @param episodes Array of episode updates with id and monitored status
   */
  async updateEpisodesMonitoring(
    episodes: Array<{ id: number; monitored: boolean }>,
  ): Promise<void> {
    if (episodes.length === 0) return

    try {
      const toMonitor = episodes.filter((ep) => ep.monitored)
      const toUnmonitor = episodes.filter((ep) => !ep.monitored)

      if (toMonitor.length > 0) {
        await this.client.put('episode/monitor', {
          episodeIds: toMonitor.map((ep) => ep.id),
          monitored: true,
        })
      }

      if (toUnmonitor.length > 0) {
        await this.client.put('episode/monitor', {
          episodeIds: toUnmonitor.map((ep) => ep.id),
          monitored: false,
        })
      }

      this.log.debug(
        `Updated monitoring for ${episodes.length} episodes (${toMonitor.length} monitored, ${toUnmonitor.length} unmonitored)`,
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
      const episode = await this.client.get<SonarrEpisode>(
        `episode/${episodeId}`,
      )

      // Update monitoring status
      episode.monitored = monitored

      // Send update
      await this.client.put(`episode/${episodeId}`, episode)

      this.log.debug(`Updated episode ${episodeId} monitoring to ${monitored}`)
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
      await this.client.delete(`episodefile/${episodeFileId}`)

      this.log.debug(`Deleted episode file ${episodeFileId}`)
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

      this.log.debug(`Successfully deleted ${successCount} episode files`)
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
