import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import type {
  ArrQualityProfile,
  ArrRootFolder,
  ArrTag,
  ConnectionTestResult,
} from '@root/types/arr-connection.types.js'
import type {
  ExistenceCheckResult,
  HealthCheckResult,
} from '@root/types/service-result.types.js'
import {
  ARR_API_TIMEOUT_MS,
  ArrClient,
  type ArrCredentials,
} from '@services/arr/arr-client.js'
import {
  type ArrProbeResult,
  checkHealth,
  probe,
  testConnection,
  testWebhookAddress,
} from '@services/arr/arr-connection.js'
import type { ArrInstanceContext } from '@services/arr/arr-instance-cache.js'
import {
  configurePlexNotification,
  findPlexNotification,
  removePlexNotification,
} from '@services/arr/arr-plex-notification.js'
import type { ArrProduct } from '@services/arr/arr-product.js'
import {
  ArrQualityProfiles,
  fetchRootFolders,
} from '@services/arr/arr-profiles.js'
import {
  type ArrApplyTags,
  type ArrItemTagUpdate,
  ArrTags,
  bulkUpdateItemTags,
} from '@services/arr/arr-tags.js'
import {
  type ArrWebhookTarget,
  type PulsarrAddress,
  removeWebhooks,
  setupWebhook,
  webhookName,
} from '@services/arr/arr-webhook.js'
import { errorMessage } from '@utils/error-message.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export interface ArrInstanceRow {
  id: number
  name: string
  baseUrl: string
  apiKey: string
}

export interface ArrLibraryResource {
  id: number
  tags?: number[]
  tvdbId?: number
  tmdbId?: number
}

export abstract class ArrService<
  TInstance extends ArrInstanceRow,
  TResource extends ArrLibraryResource,
> {
  protected readonly log: FastifyBaseLogger
  protected readonly context: ArrInstanceContext
  private arrClient: ArrClient | null = null
  private credentials: ArrCredentials | null = null
  private instanceId?: number
  private webhookInitialized = false
  protected readonly tags: ArrTags
  private readonly qualityProfiles: ArrQualityProfiles

  constructor(
    readonly product: ArrProduct,
    readonly baseLog: FastifyBaseLogger,
    private readonly appBaseUrl: string,
    private readonly port: number,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, product.appName.toUpperCase())
    this.context = {
      appName: product.appName,
      log: this.log,
      client: () => this.client,
      instanceId: () => this.instanceId,
    }
    this.tags = new ArrTags(this.context)
    this.qualityProfiles = new ArrQualityProfiles(this.context)
  }

  /** Maps the instance row onto the product's own add and routing defaults. */
  protected abstract applyInstance(instance: TInstance): void

  /** Throws until initialize has set the instance credentials. */
  get client(): ArrClient {
    if (!this.arrClient) {
      throw new Error(`${this.product.appName} service not initialized`)
    }
    return this.arrClient
  }

  async initialize(instance: TInstance): Promise<void> {
    const { appName } = this.product
    if (!instance.baseUrl || !instance.apiKey) {
      throw new Error(
        `Invalid ${appName} configuration: baseUrl and apiKey are required`,
      )
    }
    this.instanceId = instance.id
    this.credentials = { baseUrl: instance.baseUrl, apiKey: instance.apiKey }
    this.arrClient = new ArrClient({
      ...this.credentials,
      appName,
      timeoutMs: ARR_API_TIMEOUT_MS,
    })
    this.applyInstance(instance)

    if (instance.apiKey === ARR_API_KEY_PLACEHOLDER) {
      this.log.debug(
        `Basic initialization only for ${instance.name} (placeholder credentials)`,
      )
      return
    }
    this.log.debug(
      `Successfully initialized base ${appName} service for ${instance.name}`,
    )

    if (this.fastify.server.listening) {
      await this.setupWebhook(instance.name)
      return
    }
    this.fastify.server.prependOnceListener('listening', async () => {
      try {
        await this.setupWebhook(instance.name)
      } catch (error) {
        this.log.error(
          { error, instanceName: instance.name },
          `Failed to setup webhook after server start for ${appName}`,
        )
      }
    })
  }

  /** Applies option changes on the same server and API key without touching the webhook. */
  updateConfiguration(instance: TInstance): void {
    if (!this.arrClient) {
      throw new Error('Service not initialized - cannot update configuration')
    }
    this.applyInstance(instance)
    this.instanceId = instance.id
    this.log.debug(
      `Updated configuration for ${this.product.appName} instance ${instance.name}`,
    )
  }

  private address(): PulsarrAddress {
    return {
      appBaseUrl: this.appBaseUrl,
      port: this.port,
      basePath: this.fastify.config.basePath,
      webhookSecret: this.fastify.config.webhookSecret,
    }
  }

  private webhookTarget(): ArrWebhookTarget {
    return {
      product: this.product,
      address: this.address(),
      client: this.client,
    }
  }

  getWebhookName(): string {
    return webhookName(this.appBaseUrl, this.port)
  }

  private async setupWebhook(instanceName: string): Promise<void> {
    if (this.webhookInitialized) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await setupWebhook(this.webhookTarget(), instanceName, this.log)
    this.webhookInitialized = true
  }

  async removeWebhook(): Promise<void> {
    await removeWebhooks(this.webhookTarget(), this.log)
  }

  /** Expects the service to be built with the candidate Pulsarr address and throws WebhookCallbackError when the arr cannot call it back. */
  async testWebhookCallback(instance: TInstance): Promise<void> {
    await testWebhookAddress(this.product, instance, this.address())
  }

  testConnection(
    baseUrl: string,
    apiKey: string,
  ): Promise<ConnectionTestResult> {
    return testConnection(
      this.product,
      { baseUrl, apiKey },
      this.address(),
      this.log,
    )
  }

  /** Reads routing options with unsaved credentials and never touches this service's config or webhook. */
  probe(baseUrl: string, apiKey: string): Promise<ArrProbeResult> {
    return probe(this.product, { baseUrl, apiKey })
  }

  /** True while the instance row still holds the not-set-up API key. */
  isPlaceholder(): boolean {
    return this.credentials?.apiKey === ARR_API_KEY_PLACEHOLDER
  }

  async isHealthy(): Promise<HealthCheckResult> {
    if (!this.credentials) {
      return {
        healthy: false,
        error: `${this.product.appName} service not initialized`,
      }
    }
    return checkHealth(this.product, this.credentials)
  }

  /** Reads the arr's own library by tvdbId or tmdbId, so it never waits on the remote metadata service. */
  async findInLibrary(externalId: number): Promise<TResource | undefined> {
    const { itemEndpoint, idField } = this.product
    const resources = await this.client.get<TResource[]>(
      `${itemEndpoint}?${idField}=${externalId}`,
    )
    // A proxy or mock that drops the filter returns every item, so the id is matched here too
    return resources.find((resource) => resource[idField] === externalId)
  }

  /** Reports a failed read as unchecked rather than throwing. */
  async existsInLibrary(externalId: number): Promise<ExistenceCheckResult> {
    const { appName, idField } = this.product
    try {
      const found = (await this.findInLibrary(externalId)) !== undefined
      return { found, checked: true, serviceName: appName }
    } catch (err) {
      this.log.error(
        { error: err, [idField]: externalId },
        `Error checking ${appName} library for item`,
      )
      return {
        found: false,
        checked: false,
        serviceName: appName,
        error: errorMessage(err),
      }
    }
  }

  getTags(): Promise<ArrTag[]> {
    return this.tags.list()
  }

  createTag(label: string): Promise<ArrTag> {
    return this.tags.create(label)
  }

  deleteTag(tagId: number): Promise<void> {
    return this.tags.delete(tagId)
  }

  bulkUpdateTags(
    updates: ArrItemTagUpdate[],
    applyTags: ArrApplyTags = 'replace',
  ): Promise<void> {
    return bulkUpdateItemTags(
      this.client,
      this.product,
      this.log,
      updates,
      applyTags,
    )
  }

  getQualityProfiles(): Promise<ArrQualityProfile[]> {
    return this.qualityProfiles.list()
  }

  fetchQualityProfiles(): Promise<ArrQualityProfile[]> {
    return this.qualityProfiles.fetch()
  }

  fetchRootFolders(): Promise<ArrRootFolder[]> {
    return fetchRootFolders(this.context)
  }

  configurePlexNotification(
    plexToken: string,
    plexHost: string,
    plexPort: number,
    useSsl: boolean,
  ): Promise<void> {
    return configurePlexNotification(
      this.client,
      this.product,
      { plexToken, plexHost, plexPort, useSsl },
      this.log,
    )
  }

  async hasPlexNotification(): Promise<boolean> {
    return (await findPlexNotification(this.client)) !== undefined
  }

  removePlexNotification(): Promise<void> {
    return removePlexNotification(this.client, this.product, this.log)
  }
}
