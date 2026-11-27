import type { AppriseSchemaFormatMap } from '@root/types/apprise.types.js'
import type {
  AppriseMessage,
  AppriseStatus,
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

const READY_PROBE_DEADLINE_MS = 30_000
const READY_PROBE_INTERVAL_MS = 1_000
const RETRY_PROBE_INTERVAL_MS = 60_000

export class AppriseService {
  private schemaFormatCache: AppriseSchemaFormatMap = new Map()
  private readonly readyPromise: Promise<boolean>
  private resolveReady!: (value: boolean) => void
  private readySettled = false
  private probeGeneration = 0
  private probeTimer: NodeJS.Timeout | null = null
  private deadlineWarnedGeneration = -1
  private lastStatus: AppriseStatus | null = null
  private statusChangeCallback: (() => void) | null = null

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
    return this.fastify.config.enableApprise ? 'enabled' : 'unreachable'
  }

  onStatusChange(callback: () => void): void {
    this.statusChangeCallback = callback
  }

  /** Resolves once per process, false when no URL is set or 30 seconds of probing get no answer. */
  whenReady(): Promise<boolean> {
    return this.readyPromise
  }

  async initialize(): Promise<void> {
    await this.restartProbe()
  }

  /** Call after a new appriseUrl is live, so the probe restarts against it. */
  async applyConfigChange(): Promise<void> {
    await this.restartProbe()
  }

  shutdown(): void {
    this.stopProbe()
  }

  private stopProbe(): void {
    this.probeGeneration++
    if (this.probeTimer) {
      clearTimeout(this.probeTimer)
      this.probeTimer = null
    }
  }

  private async restartProbe(): Promise<void> {
    this.stopProbe()
    const generation = this.probeGeneration
    this.schemaFormatCache = new Map()
    await this.fastify.updateConfig({ enableApprise: false })
    if (this.isStale(generation)) return
    this.notifyIfStatusChanged()

    const appriseUrl = this.fastify.config.appriseUrl || ''
    if (!appriseUrl) {
      this.log.debug(
        'No Apprise URL configured, Apprise notifications will be disabled',
      )
      this.settleReady(false)
      return
    }

    this.log.debug('Probing Apprise server for readiness')
    void this.probe(generation, appriseUrl, Date.now(), 1)
  }

  private isStale(generation: number): boolean {
    return generation !== this.probeGeneration
  }

  private async probe(
    generation: number,
    appriseUrl: string,
    startedAt: number,
    attempt: number,
  ): Promise<void> {
    let connected = false
    try {
      connected = await this.connect(generation, appriseUrl)
    } catch (error) {
      this.log.error({ error }, 'Error connecting to Apprise container')
    }
    if (connected || this.isStale(generation)) return

    const deadline = startedAt + READY_PROBE_DEADLINE_MS
    const inReadyWindow = Date.now() + READY_PROBE_INTERVAL_MS < deadline
    if (!inReadyWindow && this.deadlineWarnedGeneration !== generation) {
      this.deadlineWarnedGeneration = generation
      this.log.warn(
        { attempts: attempt },
        'Apprise did not become reachable within probe deadline',
      )
      this.settleReady(false)
    }
    this.probeTimer = setTimeout(
      () => {
        this.probeTimer = null
        void this.probe(generation, appriseUrl, startedAt, attempt + 1)
      },
      inReadyWindow ? READY_PROBE_INTERVAL_MS : RETRY_PROBE_INTERVAL_MS,
    )
  }

  private async connect(
    generation: number,
    appriseUrl: string,
  ): Promise<boolean> {
    const reachable = await pingAppriseServer(appriseUrl)
    if (!reachable || this.isStale(generation)) return false
    const formats = await fetchSchemaFormats(appriseUrl, this.log)
    if (this.isStale(generation)) return false
    this.schemaFormatCache = formats
    await this.fastify.updateConfig({ enableApprise: true })
    if (this.isStale(generation)) return false
    this.log.info('Apprise notification service is configured and enabled')
    this.settleReady(true)
    this.notifyIfStatusChanged()
    return true
  }

  private settleReady(value: boolean): void {
    if (this.readySettled) return
    this.readySettled = true
    this.resolveReady(value)
  }

  private notifyIfStatusChanged(): void {
    const status = this.getStatus()
    if (status === this.lastStatus) return
    this.lastStatus = status
    try {
      this.statusChangeCallback?.()
    } catch (error) {
      this.log.error({ error }, 'Apprise status listener failed')
    }
  }
}
