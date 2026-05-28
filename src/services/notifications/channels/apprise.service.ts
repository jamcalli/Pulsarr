import type { AppriseSchemaFormatMap } from '@root/types/apprise.types.js'
import type { NotificationUser } from '@root/types/config.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  MediaNotification,
  SystemNotification,
} from '@root/types/discord.types.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  type AppriseDeps,
  isAppriseEnabled as checkAppriseEnabled,
  pingAppriseServer,
  sendDeleteSyncNotification as sendDeleteSync,
  sendMediaNotification as sendMedia,
  sendPublicNotification as sendPublic,
  sendSystemNotification as sendSystem,
  sendTestNotification as sendTest,
  sendUpdateAvailableNotification as sendUpdateAvailable,
  sendUserWatchlistCapNotification as sendUserWatchlistCap,
  sendWatchlistAdditionNotification as sendWatchlistAddition,
  sendWatchlistCapNotification as sendWatchlistCap,
} from './apprise.js'
import { fetchSchemaFormats } from './apprise-format-cache.js'

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
      log: this.log,
      config: this.fastify.config,
      schemaFormatCache: this.schemaFormatCache,
      lookupUserAlias: async (username: string) => {
        const users = await this.fastify.db.getAllUsers()
        const user = users.find((u) => u.name === username)
        return user?.alias ?? undefined
      },
    }
  }

  isEnabled(): boolean {
    return checkAppriseEnabled(this.appriseDeps)
  }

  async sendPublicNotification(
    notification: MediaNotification,
  ): Promise<boolean> {
    return sendPublic(notification, this.appriseDeps)
  }

  async sendMediaNotification(
    user: NotificationUser,
    notification: MediaNotification,
  ): Promise<boolean> {
    return sendMedia(user, notification, this.appriseDeps)
  }

  async sendSystemNotification(
    notification: SystemNotification,
  ): Promise<boolean> {
    return sendSystem(notification, this.appriseDeps)
  }

  async sendDeleteSyncNotification(
    results: DeleteSyncResult,
    dryRun: boolean,
  ): Promise<boolean> {
    return sendDeleteSync(results, dryRun, this.appriseDeps)
  }

  async sendUpdateAvailableNotification(release: {
    currentVersion: string
    latestVersion: string
    releaseUrl: string
    releaseName: string | null
    releaseBody: string | null
    publishedAt: string | null
  }): Promise<boolean> {
    return sendUpdateAvailable(release, this.appriseDeps)
  }

  async sendWatchlistAdditionNotification(item: {
    title: string
    type: string
    addedBy: {
      name: string
      alias?: string | null
    }
    posterUrl?: string
    tmdbUrl?: string
  }): Promise<boolean> {
    return sendWatchlistAddition(item, this.appriseDeps)
  }

  async sendWatchlistCapNotification(event: {
    userName: string
    contentType: string
    currentCount: number
    cap: number
  }): Promise<boolean> {
    return sendWatchlistCap(event, this.appriseDeps)
  }

  async sendUserWatchlistCapNotification(
    user: NotificationUser,
    event: {
      userName: string
      contentType: string
      currentCount: number
      cap: number
    },
  ): Promise<boolean> {
    return sendUserWatchlistCap(user, event, this.appriseDeps)
  }

  async sendTestNotification(targetUrl: string): Promise<boolean> {
    return sendTest(targetUrl, this.appriseDeps)
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

  isReady(): boolean {
    return this.readyValue
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
