import { normalizeBasePath } from '@utils/url.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

// ServarrAction values whose handling deletes media: DELETE (0),
// UNMONITOR_DELETE_ALL (1), UNMONITOR_DELETE_EXISTING (2),
// DELETE_SHOW_IF_EMPTY (5). Non-delete rule groups are skipped so
// exclusions never cover media that still exists
const DELETE_ACTIONS = new Set([0, 1, 2, 5])

// MEDIA_HANDLED notification type bit
const MEDIA_HANDLED = 16

const MIN_VERSION = [3, 23, 0]

const CONFIG_NAME = 'Pulsarr'

interface MaintainerrNotificationConfig {
  id: number
  name: string
  agent: string
  enabled: boolean
  types: number[] | null
  options: Record<string, unknown>
}

interface MaintainerrRuleGroup {
  id: number
  name: string
  isActive: boolean
  collection?: { id: number; arrAction: number } | null
  notifications?: Array<{ id: number }> | null
}

export interface MaintainerrReconcileResult {
  status: 'disabled' | 'unsupported_version' | 'error' | 'ok'
  version?: string
  configId?: number
  connectedGroups?: number
  testDelivered?: boolean
  error?: string
}

function versionAtLeast(version: string, minimum: number[]): boolean {
  const parts = version
    .replace(/^v/, '')
    .split('.')
    .map((p) => Number.parseInt(p, 10))
  for (let i = 0; i < minimum.length; i++) {
    const part = parts[i] ?? 0
    if (Number.isNaN(part)) return false
    if (part > minimum[i]) return true
    if (part < minimum[i]) return false
  }
  return true
}

export class MaintainerrService {
  private lastTestReceivedAt: number | null = null
  private lastResult: MaintainerrReconcileResult | null = null
  private inFlight: Promise<MaintainerrReconcileResult> | null = null

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  private get config() {
    return this.fastify.config
  }

  get status(): MaintainerrReconcileResult | null {
    return this.lastResult
  }

  private finish(
    result: MaintainerrReconcileResult,
  ): MaintainerrReconcileResult {
    this.lastResult = result
    return result
  }

  /** Called by the webhook route when a TEST_NOTIFICATION arrives. */
  recordTestReceipt(): void {
    this.lastTestReceivedAt = Date.now()
  }

  private baseUrl(): string {
    return this.config.maintainerrUrl.replace(/\/+$/, '')
  }

  private async api<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl()}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      throw new Error(`Maintainerr API ${path} returned ${response.status}`)
    }
    // Some endpoints respond with a bare string (e.g. /notifications/test)
    const text = await response.text()
    try {
      return JSON.parse(text) as T
    } catch {
      return text as T
    }
  }

  // Mutation endpoints report failure as { code: 0 } with HTTP 200
  private async apiMutation(path: string, body: unknown): Promise<void> {
    const result = await this.api<{ code?: number; message?: string }>(
      path,
      body,
    )
    if (typeof result === 'object' && result?.code === 0) {
      throw new Error(
        `Maintainerr API ${path} failed: ${result.message ?? 'unknown error'}`,
      )
    }
  }

  private async fetchVersion(): Promise<string> {
    const response = await fetch(`${this.baseUrl()}/api/settings/version`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      throw new Error(
        `Maintainerr version endpoint returned ${response.status}`,
      )
    }
    // Plain string body, possibly JSON-quoted
    const text = (await response.text()).trim()
    return text.replace(/^"|"$/g, '')
  }

  private receiverUrl(): string {
    let url: URL
    try {
      url = new URL(this.config.baseUrl)
    } catch {
      url = new URL(`http://${this.config.baseUrl}`)
    }
    if (!url.port && url.protocol !== 'https:') {
      url.port = this.config.port.toString()
    }
    const basePath = normalizeBasePath(this.config.basePath)
    url.pathname =
      basePath === '/'
        ? '/v1/notifications/webhook/maintainerr'
        : `${basePath}/v1/notifications/webhook/maintainerr`
    return url.toString()
  }

  private configPayload(id?: number) {
    return {
      ...(id !== undefined ? { id } : {}),
      agent: 'webhook',
      name: CONFIG_NAME,
      enabled: true,
      types: [MEDIA_HANDLED],
      aboutScale: 3,
      options: {
        webhookUrl: this.receiverUrl(),
        authHeader: this.config.maintainerrWebhookSecret,
        // Must be an object, not a string - Maintainerr's webhook agent
        // Object.assigns onto it, and a string makes that throw so the
        // webhook silently never fires
        jsonPayload: {
          notification_type: '{{notification_type}}',
          subject: '{{subject}}',
          message: '{{message}}',
        },
      },
    }
  }

  /**
   * Provisions the Maintainerr side: version gate, create-or-adopt the
   * webhook config, connect delete-action rule groups, verify delivery.
   */
  async reconcile(): Promise<MaintainerrReconcileResult> {
    // Boot, the hourly job, config saves, and manual syncs can overlap;
    // concurrent runs would both create the notification config
    if (this.inFlight) return this.inFlight
    this.inFlight = this.reconcileInternal().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async reconcileInternal(): Promise<MaintainerrReconcileResult> {
    if (!this.config.maintainerrUrl) {
      return this.finish({ status: 'disabled' })
    }

    if (!this.config.maintainerrEnabled) {
      // Best-effort: switch off the remote config so events stop at the source
      try {
        const configs = await this.api<MaintainerrNotificationConfig[]>(
          '/notifications/configurations',
        )
        const existing = configs.find(
          (c) => c.name === CONFIG_NAME && c.agent === 'webhook',
        )
        if (existing?.enabled) {
          await this.apiMutation('/notifications/configuration/add', {
            ...this.configPayload(existing.id),
            enabled: false,
          })
        }
      } catch (error) {
        this.log.warn(
          { error },
          'Failed to disable the Maintainerr webhook config',
        )
      }
      return this.finish({ status: 'disabled' })
    }

    try {
      const version = await this.fetchVersion()
      if (!versionAtLeast(version, MIN_VERSION)) {
        this.log.warn(
          { version },
          'Maintainerr version does not include provider ids in webhooks; upgrade to 3.23.0 or later',
        )
        return this.finish({ status: 'unsupported_version', version })
      }

      const configs = await this.api<MaintainerrNotificationConfig[]>(
        '/notifications/configurations',
      )
      const existing = configs.find(
        (c) => c.name === CONFIG_NAME && c.agent === 'webhook',
      )

      await this.apiMutation('/notifications/configuration/add', {
        ...this.configPayload(existing?.id),
      })

      // add with an id updates in place; without one it creates, so re-read
      // to learn the new id
      let configId = existing?.id
      if (configId === undefined) {
        const refreshed = await this.api<MaintainerrNotificationConfig[]>(
          '/notifications/configurations',
        )
        configId = refreshed.find(
          (c) => c.name === CONFIG_NAME && c.agent === 'webhook',
        )?.id
      }
      if (configId === undefined) {
        throw new Error('Notification config missing after provisioning')
      }

      const groups = await this.api<MaintainerrRuleGroup[]>('/rules')
      let connectedGroups = 0
      for (const group of groups) {
        const shouldConnect =
          group.collection != null &&
          DELETE_ACTIONS.has(group.collection.arrAction)
        const isConnected =
          group.notifications?.some((n) => n.id === configId) ?? false

        if (shouldConnect) {
          connectedGroups++
          if (!isConnected) {
            await this.apiMutation('/notifications/configuration/connect', {
              rulegroupId: group.id,
              notificationId: configId,
            })
          }
        } else if (isConnected) {
          await this.apiMutation('/notifications/configuration/disconnect', {
            rulegroupId: group.id,
            notificationId: configId,
          })
        }
      }

      // Maintainerr delivers the test synchronously before responding, so a
      // receipt recorded by our webhook route proves the full round trip
      const testStarted = Date.now()
      await this.api('/notifications/test', this.configPayload(configId))
      const testDelivered =
        this.lastTestReceivedAt !== null &&
        this.lastTestReceivedAt >= testStarted

      if (!testDelivered) {
        this.log.warn(
          'Maintainerr test notification did not reach the webhook receiver; check that Pulsarr is reachable from Maintainerr',
        )
      }

      this.log.info(
        { version, configId, connectedGroups, testDelivered },
        'Maintainerr reconcile completed',
      )
      return this.finish({
        status: 'ok',
        version,
        configId,
        connectedGroups,
        testDelivered,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log.error({ error }, 'Maintainerr reconcile failed')
      return this.finish({ status: 'error', error: message })
    }
  }
}
