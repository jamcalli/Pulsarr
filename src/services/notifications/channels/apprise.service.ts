/**
 * Apprise Service
 *
 * Thin wrapper exposing stateless Apprise functions.
 * Constructs deps internally, delegates to pure functions.
 */

import type { AppriseSchemaFormatMap } from '@root/types/apprise.types.js'
import type { User } from '@root/types/config.types.js'
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
  sendWatchlistAdditionNotification as sendWatchlistAddition,
} from './apprise.js'
import { fetchSchemaFormats } from './apprise-format-cache.js'

export type AppriseStatus = 'enabled' | 'disabled' | 'not_configured'

/**
 * Apprise Service
 *
 * Thin wrapper for Apprise notification operations.
 * Follows the deps getter pattern - constructs deps from constructor args,
 * delegates to pure functions in apprise.ts.
 */
export class AppriseService {
  private schemaFormatCache: AppriseSchemaFormatMap = new Map()

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  /**
   * Constructs deps from instance state.
   * Following plex-label-sync pattern for deps getters.
   */
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

  /**
   * Checks if Apprise is enabled in configuration.
   */
  isEnabled(): boolean {
    return checkAppriseEnabled(this.appriseDeps)
  }

  /**
   * Send public content notification to shared Apprise endpoints.
   */
  async sendPublicNotification(
    notification: MediaNotification,
  ): Promise<boolean> {
    return sendPublic(notification, this.appriseDeps)
  }

  /**
   * Sends a media notification to a user via their configured Apprise URL.
   */
  async sendMediaNotification(
    user: User,
    notification: MediaNotification,
  ): Promise<boolean> {
    return sendMedia(user, notification, this.appriseDeps)
  }

  /**
   * Send a system notification to the configured system endpoint.
   */
  async sendSystemNotification(
    notification: SystemNotification,
  ): Promise<boolean> {
    return sendSystem(notification, this.appriseDeps)
  }

  /**
   * Send a delete sync result notification to the admin.
   */
  async sendDeleteSyncNotification(
    results: DeleteSyncResult,
    dryRun: boolean,
  ): Promise<boolean> {
    return sendDeleteSync(results, dryRun, this.appriseDeps)
  }

  /**
   * Send a watchlist addition notification.
   */
  async sendWatchlistAdditionNotification(item: {
    title: string
    type: string
    addedBy: {
      name: string
      alias?: string | null
    }
    posterUrl?: string
  }): Promise<boolean> {
    return sendWatchlistAddition(item, this.appriseDeps)
  }

  /**
   * Send a test notification to verify Apprise configuration.
   */
  async sendTestNotification(targetUrl: string): Promise<boolean> {
    return sendTest(targetUrl, this.appriseDeps)
  }

  /**
   * Get current Apprise status for UI display.
   */
  getStatus(): AppriseStatus {
    const appriseUrl = this.fastify.config.appriseUrl
    if (!appriseUrl) {
      return 'not_configured'
    }
    return this.fastify.config.enableApprise ? 'enabled' : 'disabled'
  }

  /**
   * Initialize Apprise service by checking connectivity.
   * Updates config.enableApprise based on whether the server is reachable.
   */
  async initialize(): Promise<void> {
    const appriseUrl = this.fastify.config.appriseUrl || ''

    if (!appriseUrl) {
      this.log.info(
        'No Apprise URL configured, Apprise notifications will be disabled',
      )
      await this.fastify.updateConfig({ enableApprise: false })
      return
    }

    this.log.debug('Found Apprise URL in configuration')

    // Delay before checking to allow Apprise to fully initialize
    this.log.debug('Waiting 5 seconds for Apprise to initialize...')
    await new Promise((resolve) => setTimeout(resolve, 5000))

    try {
      this.log.debug('Pinging Apprise server to verify it is reachable')
      const isReachable = await pingAppriseServer(appriseUrl)

      if (isReachable) {
        this.log.info('Successfully connected to Apprise container')
        await this.fastify.updateConfig({ enableApprise: true })

        // Fetch and cache schema formats for format-aware notifications
        this.schemaFormatCache = await fetchSchemaFormats(appriseUrl, this.log)

        this.log.info('Apprise notification service is configured and enabled')
      } else {
        this.log.warn(
          'Could not connect to Apprise container, notifications will be disabled',
        )
        await this.fastify.updateConfig({ enableApprise: false })
      }
    } catch (error) {
      this.log.error({ error }, 'Error connecting to Apprise container')
      await this.fastify.updateConfig({ enableApprise: false })
    }
  }
}
