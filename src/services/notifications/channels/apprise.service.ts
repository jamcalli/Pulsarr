import type { AppriseSchemaFormatMap } from '@root/types/apprise.types.js'
import type {
  AppriseMessage,
  DeliveryResult,
  NotificationTestResult,
} from '@root/types/notification.types.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  type AppriseDeps,
  pingAppriseServer,
  sendNotification,
  testNotification,
} from './apprise.js'
import { fetchSchemaFormats } from './apprise-format-cache.js'
import { timeTest } from './time-test.js'

export type AppriseStatus = 'enabled' | 'disabled' | 'not_configured'

const READY_PROBE_DEADLINE_MS = 30_000
const READY_PROBE_INTERVAL_MS = 1_000

export class AppriseService {
  private schemaFormatCache: AppriseSchemaFormatMap = new Map()
  private readyValue = false
  private readonly readyPromise: Promise<boolean>
  private resolveReady!: (value: boolean) => void

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.readyPromise = new Promise<boolean>((resolve) => {
      this.resolveReady = resolve
    })
  }

  private get appriseDeps(): AppriseDeps {
    return {
      logger: this.log,
      config: this.fastify.config,
      schemaFormatCache: this.schemaFormatCache,
    }
  }

  async sendNotification(
    target: string | null | undefined,
    message: AppriseMessage,
  ): Promise<DeliveryResult> {
    return sendNotification(target, message, this.appriseDeps)
  }

  async testNotification(targetUrl: string): Promise<NotificationTestResult> {
    return timeTest(() => testNotification(targetUrl, this.appriseDeps))
  }

  getStatus(): AppriseStatus {
    const appriseUrl = this.fastify.config.appriseUrl
    if (!appriseUrl) {
      return 'not_configured'
    }
    return this.fastify.config.enableApprise ? 'enabled' : 'disabled'
  }

  whenReady(): Promise<boolean> {
    return this.readyPromise
  }

  private async probeUntilReachable(appriseUrl: string): Promise<boolean> {
    const deadline = Date.now() + READY_PROBE_DEADLINE_MS
    let attempt = 0
    while (Date.now() < deadline) {
      attempt++
      if (await pingAppriseServer(appriseUrl)) {
        this.log.debug({ attempt }, 'Apprise reachable')
        return true
      }
      if (Date.now() + READY_PROBE_INTERVAL_MS >= deadline) break
      await new Promise((r) => setTimeout(r, READY_PROBE_INTERVAL_MS))
    }
    this.log.warn(
      { attempts: attempt },
      'Apprise did not become reachable within probe deadline',
    )
    return false
  }

  async initialize(): Promise<void> {
    try {
      const appriseUrl = this.fastify.config.appriseUrl || ''

      if (!appriseUrl) {
        this.log.info(
          'No Apprise URL configured, Apprise notifications will be disabled',
        )
        await this.fastify.updateConfig({ enableApprise: false })
        return
      }

      this.log.debug('Probing Apprise server for readiness')
      const isReachable = await this.probeUntilReachable(appriseUrl)

      if (isReachable) {
        this.schemaFormatCache = await fetchSchemaFormats(appriseUrl, this.log)
        await this.fastify.updateConfig({ enableApprise: true })
        this.readyValue = true
        this.log.info('Apprise notification service is configured and enabled')
      } else {
        await this.fastify.updateConfig({ enableApprise: false })
      }
    } catch (error) {
      this.log.error({ error }, 'Error connecting to Apprise container')
      this.readyValue = false
      await this.fastify.updateConfig({ enableApprise: false })
    } finally {
      this.resolveReady(this.readyValue)
    }
  }
}
