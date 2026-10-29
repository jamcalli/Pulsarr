import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import type { ArrWebhookResult } from '@root/schemas/config/config.schema.js'
import {
  type ConnectionTestResult,
  WebhookCallbackError,
} from '@root/types/arr-connection.types.js'
import type { ArrAddedSettings, ContentItem } from '@root/types/router.types.js'
import type {
  ExistenceCheckResult,
  InstanceHealthResult,
} from '@root/types/service-result.types.js'
import type { WatchlistItemUpdate } from '@root/types/watchlist-status.types.js'
import type { ArrProbeResult } from '@services/arr/arr-connection.js'
import type { ArrProduct } from '@services/arr/arr-product.js'
import type { ArrInstanceRow, ArrService } from '@services/arr/arr-service.js'
import { PlaceholderResetError } from '@utils/arr-default-instance.js'
import { errorMessage } from '@utils/error-message.js'
import { createServiceLogger } from '@utils/logger.js'
import { parseQualityProfileId } from '@utils/quality-profile.js'
import {
  delayWithBackoffAndJitter,
  isSameServerEndpoint,
  normalizeEndpointWithPath,
} from '@utils/url.js'
import { emitWatchlistChange } from '@utils/watchlist-events.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'

export const WEBHOOK_RESYNC_CONCURRENCY = 4

export interface ArrManagedInstance extends ArrInstanceRow {
  qualityProfile?: string | number | null
  rootFolder?: string | null
  bypassIgnored: boolean
  tags: string[]
  searchOnAdd?: boolean
}

export interface ArrInstanceStore<TInstance extends ArrManagedInstance> {
  all(): Promise<TInstance[]>
  getDefault(): Promise<TInstance | null>
  get(id: number): Promise<TInstance | null>
  create(instance: Omit<TInstance, 'id'>): Promise<number>
  update(id: number, updates: Partial<TInstance>): Promise<void>
  /** Promotes another enabled instance when the deleted one was the default. */
  delete(id: number): Promise<void>
  replace(id: number, replacement: Omit<TInstance, 'id'>): Promise<number>
}

/** Null or absent means use the instance's value at routing time. */
export interface ArrRouteSettings {
  rootFolder?: string | null
  qualityProfile?: number | string | null
  tags?: string[]
  searchOnAdd?: boolean | null
}

export type ArrPreparedItem<TItem extends ContentItem> = Pick<
  ContentItem,
  'title' | 'guids' | 'genres'
> & { type: TItem['type'] }

/** The routing values both products share, already resolved against the instance. */
export interface ArrRoute<
  TInstance extends ArrManagedInstance,
  TService,
  TItem extends ContentItem,
  TSettings extends ArrRouteSettings,
> {
  service: TService
  instance: TInstance
  instanceId: number
  item: ArrPreparedItem<TItem>
  settings: TSettings
  rootFolder: string | undefined
  qualityProfileId: number | undefined
  tags: string[]
  searchOnAdd: boolean
}

export interface ArrRouted<TApplied> {
  /** Product columns written to the watchlist row beside the shared status fields. */
  watchlist: WatchlistItemUpdate
  applied: TApplied
}

export interface ArrAppliedRouting {
  instanceId: number
  qualityProfile: number | undefined
  qualityProfileName?: string
  rootFolder: string | undefined
  tags: string[]
  searchOnAdd: boolean
}

export abstract class ArrManager<
  TInstance extends ArrManagedInstance,
  TService extends ArrService<TInstance>,
  TItem extends ContentItem,
  TSettings extends ArrRouteSettings,
  TApplied,
> {
  protected readonly services = new Map<number, TService>()
  protected readonly log: FastifyBaseLogger

  constructor(
    protected readonly product: ArrProduct,
    protected readonly baseLog: FastifyBaseLogger,
    protected readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(
      baseLog,
      `${product.appName.toUpperCase()}_MANAGER`,
    )
  }

  protected abstract readonly store: ArrInstanceStore<TInstance>

  protected abstract createService(appBaseUrl: string, port: number): TService

  protected abstract placeholder(): Omit<TInstance, 'id'>

  protected abstract withId(row: Omit<TInstance, 'id'>, id: number): TInstance

  protected abstract fetchInstanceItems(
    service: TService,
    instanceId: number,
    bypassExclusions: boolean,
  ): Promise<TItem[]>

  protected abstract itemExists(
    service: TService,
    id: number,
  ): Promise<ExistenceCheckResult>

  protected abstract isItemExcluded(
    service: TService,
    id: number,
  ): Promise<boolean>

  /** Adds the item through the product's service and runs any product work that follows the add. */
  protected abstract addRouted(
    route: ArrRoute<TInstance, TService, TItem, TSettings>,
  ): Promise<ArrRouted<TApplied>>

  /** Throws when an instance write carries a value the product rejects. */
  protected validateInstance(
    _next: Partial<Omit<TInstance, 'id'>>,
    _current: TInstance | null,
  ): void {}

  private newService(): TService {
    return this.createService(
      this.fastify.config.baseUrl,
      this.fastify.config.port,
    )
  }

  private async startService(instance: TInstance): Promise<void> {
    const service = this.newService()
    await service.initialize(instance)
    this.services.set(instance.id, service)
  }

  async initialize(): Promise<void> {
    const { appName } = this.product
    try {
      this.log.debug(`Starting ${appName} manager initialization`)
      const instances = await this.store.all()
      this.log.debug(
        {
          count: instances.length,
          instanceIds: instances.map((i) => i.id),
          instanceNames: instances.map((i) => i.name),
        },
        `Found ${appName} instances`,
      )

      if (instances.length === 0) {
        this.log.warn(`No ${appName} instances found`)
        return
      }

      for (const instance of instances) {
        const ids = { instanceId: instance.id, instanceName: instance.name }
        this.log.debug(
          { id: instance.id, name: instance.name, baseUrl: instance.baseUrl },
          'Attempting to initialize instance',
        )
        try {
          await this.startService(instance)
          this.log.debug(ids, `Successfully initialized ${appName} service`)
        } catch (instanceError) {
          this.log.error(
            { error: instanceError, ...ids },
            `Failed to initialize ${appName} service for instance, will retry`,
          )
          await delayWithBackoffAndJitter(1, 500, 2000)
          try {
            await this.startService(instance)
            this.log.debug(
              ids,
              `Successfully initialized ${appName} service on retry`,
            )
          } catch (retryError) {
            this.log.error(
              { error: retryError, ...ids },
              `Failed to initialize ${appName} service after retry`,
            )
          }
        }
      }

      if (this.services.size === 0) {
        throw new Error(`Unable to initialize any ${appName} services`)
      }
    } catch (error) {
      this.log.error({ error }, `Error initializing ${appName} manager`)
      throw error
    }
  }

  async testConnection(
    baseUrl: string,
    apiKey: string,
  ): Promise<ConnectionTestResult> {
    try {
      return await this.newService().testConnection(baseUrl, apiKey)
    } catch (error) {
      this.log.error(
        { error },
        `Error testing ${this.product.appName} connection`,
      )
      return {
        success: false,
        code: 'unreachable',
        message: errorMessage(error),
      }
    }
  }

  probe(baseUrl: string, apiKey: string): Promise<ArrProbeResult> {
    return this.newService().probe(baseUrl, apiKey)
  }

  /** Throws when any real instance fails, so callers never route against a partial library. */
  protected async fetchAllItems(bypassExclusions?: boolean): Promise<TItem[]> {
    const { appName, itemsLabel } = this.product
    const instances = (await this.store.all()).filter(
      (instance) => instance.apiKey !== ARR_API_KEY_PLACEHOLDER,
    )

    const results = await Promise.allSettled(
      instances.map(async (instance) => {
        const service = this.services.get(instance.id)
        if (!service) {
          throw new Error(
            `${appName} service for instance ${instance.name || instance.id} not initialized`,
          )
        }
        const bypass = bypassExclusions ?? instance.bypassIgnored
        this.log.debug(
          {
            instanceId: instance.id,
            instanceName: instance.name,
            bypassExclusions: bypass,
          },
          `Fetching ${itemsLabel} with per-instance bypass setting`,
        )
        return this.fetchInstanceItems(service, instance.id, bypass)
      }),
    )

    const items: TItem[] = []
    const failedInstances: string[] = []
    results.forEach((result, i) => {
      const instance = instances[i]
      if (result.status === 'fulfilled') {
        items.push(...result.value)
        return
      }
      failedInstances.push(instance.name || `ID ${instance.id}`)
      this.log.error(
        {
          error: result.reason,
          instanceId: instance.id,
          instanceName: instance.name,
        },
        `Error fetching ${itemsLabel} from ${appName} instance`,
      )
    })

    if (failedInstances.length > 0) {
      throw new Error(
        `Failed to fetch ${itemsLabel} from ${failedInstances.length} ${appName} instance(s): ${failedInstances.join(', ')}. Aborting to prevent incorrect routing.`,
      )
    }
    return items
  }

  protected async routeItem(
    item: TItem,
    key: string,
    userId: number,
    instanceId: number | undefined,
    syncing: boolean,
    settings: TSettings,
  ): Promise<TApplied> {
    const { appName } = this.product
    let targetInstanceId = instanceId
    if (targetInstanceId === undefined) {
      const defaultInstance = await this.store.getDefault()
      if (!defaultInstance) {
        throw new Error(
          `No ${appName} instance ID provided and no default instance found`,
        )
      }
      targetInstanceId = defaultInstance.id
    }

    const service = this.services.get(targetInstanceId)
    if (!service) {
      throw new Error(`${appName} service ${targetInstanceId} not found`)
    }

    const prepared = prepareItem(item)

    try {
      const instance = await this.store.get(targetInstanceId)
      if (!instance) {
        throw new Error(`${appName} instance ${targetInstanceId} not found`)
      }
      if (instance.apiKey === ARR_API_KEY_PLACEHOLDER) {
        throw new Error(`${appName} instance "${instance.name}" is not set up`)
      }

      const qualityProfileSource =
        settings.qualityProfile ?? instance.qualityProfile
      const routed = await this.addRouted({
        service,
        instance,
        instanceId: targetInstanceId,
        item: prepared,
        settings,
        rootFolder: settings.rootFolder || instance.rootFolder || undefined,
        qualityProfileId:
          qualityProfileSource == null
            ? undefined
            : parseQualityProfileId(qualityProfileSource),
        tags: [...new Set(settings.tags ?? instance.tags ?? [])],
        searchOnAdd: settings.searchOnAdd ?? instance.searchOnAdd ?? true,
      })

      await this.fastify.db.updateWatchlistItem(userId, key, {
        ...routed.watchlist,
        syncing,
        status: 'requested',
      })
      emitWatchlistChange(this.fastify.progress, 'status', [userId])

      this.log.debug(
        { applied: routed.applied, title: prepared.title, userId, key },
        `Successfully routed item to ${appName}`,
      )
      return routed.applied
    } catch (error) {
      this.log.debug(
        {
          error,
          instanceId: targetInstanceId,
          title: prepared.title,
          userId,
          key,
        },
        `Failed to route item to ${appName}`,
      )
      throw error
    }
  }

  /** The shared half of what a route applied, read back from what the arr stored. */
  protected appliedRouting(
    route: ArrRoute<TInstance, TService, TItem, TSettings>,
    added: ArrAddedSettings,
  ): ArrAppliedRouting {
    return {
      instanceId: route.instanceId,
      qualityProfile: parseQualityProfileId(added.qualityProfileId),
      qualityProfileName: added.qualityProfileName,
      rootFolder: added.rootFolder,
      tags: added.tags,
      searchOnAdd: route.searchOnAdd,
    }
  }

  getAllInstances(): Promise<TInstance[]> {
    return this.store.all()
  }

  protected getInstance(id: number): Promise<TInstance | null> {
    return this.store.get(id)
  }

  protected getService(id: number): TService | undefined {
    return this.services.get(id)
  }

  /** Counts an excluded miss as found unless the instance bypasses exclusions. */
  protected async itemExistsById(
    instanceId: number,
    id: number,
  ): Promise<ExistenceCheckResult> {
    const { appName } = this.product
    const service = this.services.get(instanceId)
    if (!service) {
      return {
        found: false,
        checked: false,
        serviceName: appName,
        instanceId,
        error: `${appName} instance ${instanceId} not found`,
      }
    }

    const result = await this.itemExists(service, id)
    if (result.checked && !result.found) {
      const instance = await this.store.get(instanceId)
      if (instance && !instance.bypassIgnored) {
        try {
          if (await this.isItemExcluded(service, id)) {
            return {
              found: true,
              checked: true,
              excluded: true,
              serviceName: appName,
              instanceId,
            }
          }
        } catch (err) {
          return {
            found: false,
            checked: false,
            serviceName: appName,
            instanceId,
            error: errorMessage(err),
          }
        }
      }
    }
    return { ...result, instanceId }
  }

  /** Leaves placeholder instances out, since they are not set up and never reachable. */
  async checkInstancesHealth(): Promise<InstanceHealthResult> {
    const available: number[] = []
    const unavailable: number[] = []

    await Promise.all(
      [...this.services.entries()]
        .filter(([, service]) => !service.isPlaceholder())
        .map(async ([instanceId, service]) => {
          const result = await service.isHealthy()
          if (result.healthy) {
            available.push(instanceId)
            return
          }
          unavailable.push(instanceId)
          this.log.warn(
            { instanceId, error: result.error },
            `${this.product.appName} instance unhealthy`,
          )
        }),
    )

    return { available, unavailable }
  }

  async addInstance(instance: Omit<TInstance, 'id'>): Promise<number> {
    const { appName } = this.product
    this.validateInstance(instance, null)
    const id = await this.store.create(instance)
    const service = this.newService()
    try {
      await service.initialize(this.withId(instance, id))
      this.services.set(id, service)
      return id
    } catch (error) {
      this.log.error(
        {
          error,
          instanceName: instance.name,
          instanceBaseUrl: instance.baseUrl,
        },
        `Failed to initialize new ${appName} instance; rolling back`,
      )
      try {
        await service.removeWebhook()
      } catch (cleanupErr) {
        this.log.warn(
          { error: cleanupErr },
          `Failed to cleanup webhook for new instance ${id}`,
        )
      }
      try {
        await this.store.delete(id)
      } catch (dbDelErr) {
        this.log.warn(
          { error: dbDelErr, id },
          `Failed to rollback created ${appName} instance record`,
        )
      }
      throw error
    }
  }

  async removeInstance(id: number): Promise<void> {
    const service = this.services.get(id)
    if (service) {
      try {
        await service.removeWebhook()
      } catch (error) {
        this.log.error({ error }, `Failed to remove webhook for instance ${id}`)
      }
    } else {
      this.log.warn(
        `No ${this.product.appName} service found for instance ${id}`,
      )
    }
    await this.store.delete(id)
    this.services.delete(id)
    this.fastify.contentRouter.clearRouterRulesCache()
  }

  private async resetToPlaceholder(current: TInstance): Promise<void> {
    const instances = await this.store.all()
    if (
      instances.some(
        (instance) =>
          instance.id !== current.id &&
          instance.apiKey !== ARR_API_KEY_PLACEHOLDER,
      )
    ) {
      throw new PlaceholderResetError(this.product.appName)
    }

    const oldService = this.services.get(current.id)
    if (oldService) {
      try {
        await oldService.removeWebhook()
      } catch (error) {
        this.log.error(
          { error },
          `Failed to remove webhook for instance ${current.id}`,
        )
      }
    }

    const placeholder = this.placeholder()
    const newId = await this.store.replace(current.id, placeholder)
    this.services.delete(current.id)
    this.fastify.contentRouter.clearRouterRulesCache()

    await this.startService(this.withId(placeholder, newId))
  }

  async updateInstance(id: number, updates: Partial<TInstance>): Promise<void> {
    const { appName } = this.product
    const current = await this.store.get(id)
    if (!current) {
      throw new Error(`${appName} instance ${id} not found`)
    }
    this.validateInstance(updates, current)
    const candidate: TInstance = { ...current, ...updates }
    if (
      current.apiKey !== ARR_API_KEY_PLACEHOLDER &&
      candidate.apiKey === ARR_API_KEY_PLACEHOLDER
    ) {
      await this.resetToPlaceholder(current)
      return
    }
    const oldService = this.services.get(id)

    // A different API key on the same server keeps the webhook, since the hook lives on the server
    const serverChanged = !isSameServerEndpoint(
      current.baseUrl,
      candidate.baseUrl,
    )
    const baseUrlChanged =
      normalizeEndpointWithPath(current.baseUrl) !==
      normalizeEndpointWithPath(candidate.baseUrl)
    const isPlaceholderToReal =
      current.apiKey === ARR_API_KEY_PLACEHOLDER &&
      candidate.apiKey !== ARR_API_KEY_PLACEHOLDER
    const apiKeyChanged = current.apiKey !== candidate.apiKey

    if (!baseUrlChanged && !isPlaceholderToReal && !apiKeyChanged) {
      try {
        await this.store.update(id, updates)
      } catch (dbErr) {
        this.log.error(
          { error: dbErr, instanceId: id },
          `Failed to persist ${appName} instance update (no server change)`,
        )
        throw dbErr
      }
      if (oldService) {
        oldService.updateConfiguration(candidate)
        this.log.debug(
          { instanceId: id },
          `Updated ${appName} instance configuration (no server change)`,
        )
      }
      return
    }

    const service = this.newService()
    await service.initialize(candidate)
    let persistedId = id
    try {
      if (isPlaceholderToReal) {
        persistedId = await this.store.replace(id, candidate)
      } else {
        await this.store.update(id, updates)
      }
    } catch (dbErr) {
      this.log.error(
        { error: dbErr, instanceId: id },
        `Failed to persist ${appName} instance update`,
      )
      // On the same server the new service updated the live hook in place, so removing it would orphan the old service
      if (serverChanged || current.apiKey === ARR_API_KEY_PLACEHOLDER) {
        try {
          await service.removeWebhook()
        } catch (cleanupErr) {
          this.log.warn(
            { error: cleanupErr },
            `Failed to cleanup webhook after a failed update of instance ${id}`,
          )
        }
      }
      throw new Error(`Failed to persist ${appName} instance update`, {
        cause: dbErr,
      })
    }

    // A placeholder never registered a webhook, so there is nothing to clean up behind it
    if (
      oldService &&
      serverChanged &&
      current.apiKey !== ARR_API_KEY_PLACEHOLDER
    ) {
      try {
        await oldService.removeWebhook()
      } catch (cleanupErr) {
        this.log.warn(
          { error: cleanupErr },
          `Failed to cleanup old webhook for previous server of instance ${id}`,
        )
      }
    }
    if (persistedId !== id) {
      this.services.delete(id)
      service.updateConfiguration({ ...candidate, id: persistedId })
      this.fastify.contentRouter.clearRouterRulesCache()
    }
    this.services.set(persistedId, service)
  }

  private async webhookResults(
    successMessage: string,
    run: (instance: TInstance) => Promise<void>,
  ): Promise<ArrWebhookResult[]> {
    const instances = await this.store.all()
    const limit = pLimit(WEBHOOK_RESYNC_CONCURRENCY)
    return Promise.all(
      instances
        .filter((instance) => instance.apiKey !== ARR_API_KEY_PLACEHOLDER)
        .map((instance) =>
          limit(async (): Promise<ArrWebhookResult> => {
            try {
              await run(instance)
              return {
                instanceId: instance.id,
                name: instance.name,
                success: true,
                code: null,
                message: successMessage,
              }
            } catch (error) {
              this.log.error(
                { error, instanceId: instance.id },
                `Webhook check failed for ${this.product.appName} instance`,
              )
              return {
                instanceId: instance.id,
                name: instance.name,
                success: false,
                code:
                  error instanceof WebhookCallbackError
                    ? 'callback_failed'
                    : 'unreachable',
                message: errorMessage(error),
              }
            }
          }),
        ),
    )
  }

  /** Tests the callback at a candidate address against every real instance without storing anything. */
  testWebhookAddress(
    baseUrl: string,
    port: number,
  ): Promise<ArrWebhookResult[]> {
    return this.webhookResults('Webhook callback reachable', (instance) =>
      this.createService(baseUrl, port).testWebhookCallback(instance),
    )
  }

  resyncWebhooks(): Promise<ArrWebhookResult[]> {
    return this.webhookResults('Webhook re-registered', async (instance) => {
      const oldService = this.services.get(instance.id)
      const service = this.newService()
      await service.initialize(instance)
      // The arr tests the callback before storing a hook, so the old one goes only after the new one is stored
      if (
        oldService &&
        oldService.getWebhookName() !== service.getWebhookName()
      ) {
        try {
          await oldService.removeWebhook()
        } catch (error) {
          this.log.warn(
            { error, instanceId: instance.id },
            'Failed to remove stale webhook during resync',
          )
        }
      }
      this.services.set(instance.id, service)
    })
  }
}

function prepareItem<TItem extends ContentItem>(
  item: TItem,
): ArrPreparedItem<TItem> {
  return {
    title: item.title,
    guids: toStringList(item.guids),
    type: item.type,
    genres: toStringList(item.genres),
  }
}

function toStringList(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value
  return typeof value === 'string' ? [value] : []
}
