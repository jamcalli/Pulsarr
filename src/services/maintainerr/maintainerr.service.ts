import { normalizeBasePath } from '@utils/url.js'
import { normaliseVersion } from '@utils/version.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import semver from 'semver'

// ServarrAction values whose handling deletes media: DELETE (0),
// UNMONITOR_DELETE_ALL (1), UNMONITOR_DELETE_EXISTING (2),
// DELETE_SHOW_IF_EMPTY (5). Non-delete rule groups are skipped so
// exclusions never cover media that still exists
const DELETE_ACTIONS = new Set([0, 1, 2, 5])

// MEDIA_HANDLED notification type bit
const MEDIA_HANDLED = 16

const MIN_VERSION = '3.23.0'

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

interface RunConfig {
  base: string
  secret: string
  receiverUrl: string
}

export interface MaintainerrReconcileResult {
  status: 'disabled' | 'unsupported_version' | 'error' | 'ok'
  version?: string
  configId?: number
  connectedGroups?: number
  testDelivered?: boolean
  error?: string
}

export class MaintainerrService {
  private lastTestReceivedAt: number | null = null
  private lastResult: MaintainerrReconcileResult | null = null
  private inFlight: Promise<MaintainerrReconcileResult> | null = null
  private rerunRequested = false

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

  private captureRunConfig(url: string): RunConfig {
    return {
      base: url.replace(/\/+$/, ''),
      secret: this.config.maintainerrWebhookSecret,
      receiverUrl: this.receiverUrl(),
    }
  }

  private async api<T>(
    path: string,
    body: unknown | undefined,
    base: string,
  ): Promise<T> {
    const response = await fetch(`${base}/api${path}`, {
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
  private async apiMutation(
    path: string,
    body: unknown,
    base: string,
  ): Promise<void> {
    const result = await this.api<{ code?: number; message?: string }>(
      path,
      body,
      base,
    )
    if (typeof result === 'object' && result?.code === 0) {
      throw new Error(
        `Maintainerr API ${path} failed: ${result.message ?? 'unknown error'}`,
      )
    }
  }

  /**
   * Best-effort disable of the Pulsarr webhook config on a Maintainerr
   * instance, so events stop at the source. Takes an explicit URL so the
   * config route can clean up the previous instance when the URL changes.
   */
  async disableRemoteConfig(url: string): Promise<void> {
    const run = this.captureRunConfig(url)
    try {
      const configs = await this.api<MaintainerrNotificationConfig[]>(
        '/notifications/configurations',
        undefined,
        run.base,
      )
      const existing = configs.find(
        (c) => c.name === CONFIG_NAME && c.agent === 'webhook',
      )
      if (existing?.enabled) {
        await this.apiMutation(
          '/notifications/configuration/add',
          { ...this.configPayload(run, existing.id), enabled: false },
          run.base,
        )
      }
    } catch (error) {
      this.log.warn(
        { error, url },
        'Failed to disable the Maintainerr webhook config',
      )
    }
  }

  private async fetchVersion(base: string): Promise<string> {
    const response = await fetch(`${base}/api/settings/version`, {
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

  private configPayload(run: RunConfig, id?: number) {
    return {
      ...(id !== undefined ? { id } : {}),
      agent: 'webhook',
      name: CONFIG_NAME,
      enabled: true,
      types: [MEDIA_HANDLED],
      aboutScale: 3,
      options: {
        webhookUrl: run.receiverUrl,
        authHeader: run.secret,
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
    // concurrent runs would both create the notification config. A caller
    // arriving mid-run usually carries a config change, so run once more
    // after so the final state reflects it
    if (this.inFlight) {
      this.rerunRequested = true
      return this.inFlight
    }
    this.inFlight = this.runReconcile().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async runReconcile(): Promise<MaintainerrReconcileResult> {
    let result = await this.reconcileInternal()
    while (this.rerunRequested) {
      this.rerunRequested = false
      result = await this.reconcileInternal()
    }
    return result
  }

  private async reconcileInternal(): Promise<MaintainerrReconcileResult> {
    const url = this.config.maintainerrUrl
    if (!url) {
      return this.finish({ status: 'disabled' })
    }

    if (!this.config.maintainerrEnabled) {
      await this.disableRemoteConfig(url)
      return this.finish({ status: 'disabled' })
    }

    const run = this.captureRunConfig(url)
    try {
      const version = await this.fetchVersion(run.base)
      const normalised = normaliseVersion(version)
      if (!normalised || semver.lt(normalised, MIN_VERSION)) {
        this.log.warn(
          { version },
          'Maintainerr version does not include provider ids in webhooks; upgrade to 3.23.0 or later',
        )
        return this.finish({ status: 'unsupported_version', version })
      }

      const configs = await this.api<MaintainerrNotificationConfig[]>(
        '/notifications/configurations',
        undefined,
        run.base,
      )
      const existing = configs.find(
        (c) => c.name === CONFIG_NAME && c.agent === 'webhook',
      )

      await this.apiMutation(
        '/notifications/configuration/add',
        { ...this.configPayload(run, existing?.id) },
        run.base,
      )

      // add with an id updates in place; without one it creates, so re-read
      // to learn the new id
      let configId = existing?.id
      if (configId === undefined) {
        const refreshed = await this.api<MaintainerrNotificationConfig[]>(
          '/notifications/configurations',
          undefined,
          run.base,
        )
        configId = refreshed.find(
          (c) => c.name === CONFIG_NAME && c.agent === 'webhook',
        )?.id
      }
      if (configId === undefined) {
        throw new Error('Notification config missing after provisioning')
      }

      const groups = await this.api<MaintainerrRuleGroup[]>(
        '/rules',
        undefined,
        run.base,
      )
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
            await this.apiMutation(
              '/notifications/configuration/connect',
              { rulegroupId: group.id, notificationId: configId },
              run.base,
            )
          }
        } else if (isConnected) {
          await this.apiMutation(
            '/notifications/configuration/disconnect',
            { rulegroupId: group.id, notificationId: configId },
            run.base,
          )
        }
      }

      // Maintainerr delivers the test synchronously before responding, so a
      // receipt recorded by our webhook route proves the full round trip.
      // The response is a bare string: 'Success', or 'Failure: <reason>'
      // (also HTTP 200) when its webhook agent could not deliver
      const testStarted = Date.now()
      const testResponse = await this.api<string>(
        '/notifications/test',
        this.configPayload(run, configId),
        run.base,
      )
      const testDelivered =
        this.lastTestReceivedAt !== null &&
        this.lastTestReceivedAt >= testStarted

      let testFailureReason: string | undefined
      if (!testDelivered) {
        testFailureReason =
          typeof testResponse === 'string' && testResponse.startsWith('Failure')
            ? testResponse
            : undefined
        this.log.warn(
          { reason: testFailureReason },
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
        ...(testFailureReason ? { error: testFailureReason } : {}),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log.error({ error }, 'Maintainerr reconcile failed')
      return this.finish({ status: 'error', error: message })
    }
  }
}
