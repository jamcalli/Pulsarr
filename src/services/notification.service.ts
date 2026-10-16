import type {
  ApprovalRequest,
  RouterDecision,
} from '@root/types/approval.types.js'
import type { User } from '@root/types/config.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  NotificationTestResult,
  SystemTestTarget,
  UpdateAvailableRelease,
  UserTestChannel,
  WatchlistCapNotification,
} from '@root/types/notification.types.js'
import type { Friend, Item as WatchlistItem } from '@root/types/plex.types.js'
import type { ProgressEvent } from '@root/types/progress.types.js'
import type { RoutingDetails } from '@root/types/router.types.js'
import { createServiceLogger } from '@utils/logger.js'
import { systemStatusEvent } from '@utils/system-status-event.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { AppriseService } from './notifications/channels/apprise.service.js'
import { DiscordWebhookService } from './notifications/channels/discord-webhook.service.js'
import { PlexMobileService } from './notifications/channels/plex-mobile.service.js'
import { DiscordBotService } from './notifications/discord-bot/bot.service.js'
import { sendApprovalBatch } from './notifications/orchestration/approval.js'
import { sendDeleteSyncNotification } from './notifications/orchestration/delete-sync.js'
import { sendMediaAvailable } from './notifications/orchestration/media-available.js'
import type {
  MediaAvailableOptions,
  MediaInfo,
} from './notifications/orchestration/media-available-enrichment.js'
import {
  sendApprovalAuto,
  sendApprovalResolved,
  sendUserCreated,
  sendWatchlistRemoved,
} from './notifications/orchestration/native-events.js'
import {
  type TestSendOutcome,
  testSystemTarget,
  testUserChannel,
} from './notifications/orchestration/test-send.js'
import { sendUpdateAvailable } from './notifications/orchestration/update-available.js'
import {
  sendWatchlistAdded,
  type WatchlistItemInfo,
} from './notifications/orchestration/watchlist-added.js'
import {
  clearWatchlistCap,
  sendWatchlistCapReached,
} from './notifications/orchestration/watchlist-cap.js'
import { NotificationState } from './notifications/state.js'
import type { NotificationDeps } from './notifications/types.js'

const SHUTDOWN_DRAIN_MS = 5_000

export class NotificationService {
  private readonly log: FastifyBaseLogger
  private readonly _discordBot: DiscordBotService
  private readonly _discordWebhook: DiscordWebhookService
  private readonly _plexMobile: PlexMobileService
  private readonly _apprise: AppriseService
  private readonly inFlight = new Set<Promise<boolean>>()
  private readonly state = new NotificationState()

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'NOTIFICATIONS')
    this.log.debug('Initializing notification service')

    this._discordBot = new DiscordBotService(this.log, this.fastify)
    this._discordBot.onStatusChange(() => this.emitStatusEvents())
    this._discordWebhook = new DiscordWebhookService(this.log)
    this._plexMobile = new PlexMobileService(this.log, this.fastify)
    this._apprise = new AppriseService(this.log, this.fastify)
  }

  get discordBot(): DiscordBotService {
    return this._discordBot
  }

  get discordWebhook(): DiscordWebhookService {
    return this._discordWebhook
  }

  get plexMobile(): PlexMobileService {
    return this._plexMobile
  }

  get apprise(): AppriseService {
    return this._apprise
  }

  statusEvents(): ProgressEvent[] {
    return [
      systemStatusEvent('discord-status', 'Discord bot status', {
        status: this._discordBot.getBotStatus(),
      }),
      systemStatusEvent('plex-mobile-status', 'Plex mobile status', {
        status: this._plexMobile.getStatus(),
      }),
      systemStatusEvent('apprise-status', 'Apprise status', {
        status: this._apprise.getStatus(),
      }),
    ]
  }

  emitStatusEvents(): void {
    if (!this.fastify.progress.hasActiveConnections()) {
      return
    }
    for (const event of this.statusEvents()) {
      this.fastify.progress.emit(event)
    }
  }

  get hasBotConfig(): boolean {
    const required = ['discordBotToken', 'discordClientId'] as const
    return required.every((key) => Boolean(this.fastify.config[key]))
  }

  async initialize(): Promise<void> {
    if (this.hasBotConfig) {
      this.log.info('Discord bot configuration found, attempting auto-start')
      try {
        const started = await this._discordBot.startBot()
        if (!started) {
          this.log.warn('Failed to auto-start Discord bot')
        }
      } catch (error) {
        this.log.error({ error }, 'Error during Discord bot auto-start')
      }
    } else {
      this.log.debug(
        'Discord bot configuration incomplete, bot features will require manual initialization',
      )
    }

    try {
      await this._plexMobile.initialize()
    } catch (error) {
      this.log.error({ error }, 'Failed to initialize Plex Mobile service')
    }

    // Not awaited so startup never blocks, and boot-time callers await apprise.whenReady()
    this._apprise.initialize().catch((error) => {
      this.log.error({ error }, 'Unexpected error in Apprise initialization')
    })
  }

  async shutdown(): Promise<void> {
    this._plexMobile.shutdown()
    this.state.clearTimers()
    await this.drainDeliveries()

    if (this._discordBot.getBotStatus() === 'running') {
      this.log.info('Stopping Discord bot during shutdown')
      await this._discordBot.stopBot()
    }
  }

  private async drainDeliveries(): Promise<void> {
    if (this.inFlight.size === 0) return
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.allSettled(this.inFlight),
      new Promise((resolve) => {
        timer = setTimeout(resolve, SHUTDOWN_DRAIN_MS)
      }),
    ])
    clearTimeout(timer)
  }

  /** Tracks delivery work for shutdown. The returned promise never rejects. */
  private track(work: Promise<boolean>): Promise<boolean> {
    const tracked = work.catch((error) => {
      this.log.error({ error }, 'Notification delivery failed')
      return false
    })
    this.inFlight.add(tracked)
    void tracked.finally(() => this.inFlight.delete(tracked))
    return tracked
  }

  // config is a getter because updateConfig reassigns fastify.config and deps outlive a single call
  private get deps(): NotificationDeps {
    const { fastify } = this
    return {
      db: fastify.db,
      logger: this.log,
      get config() {
        return fastify.config
      },
      state: this.state,
      discordBot: this._discordBot,
      discordWebhook: this._discordWebhook,
      apprise: this._apprise,
      plexMobile: this._plexMobile,
      detach: (work) => {
        void this.track(work)
      },
    }
  }

  private unwrapTestOutcome(outcome: TestSendOutcome): NotificationTestResult {
    switch (outcome.status) {
      case 'sent':
        return outcome.result
      case 'not_found':
        throw this.fastify.httpErrors.notFound(outcome.message)
      case 'not_configured':
        throw this.fastify.httpErrors.badRequest(outcome.message)
    }
  }

  /** Throws 400 when the setting has no saved URL. */
  async testSystemTarget(
    target: SystemTestTarget,
  ): Promise<NotificationTestResult> {
    return this.unwrapTestOutcome(await testSystemTarget(target, this.deps))
  }

  /** Throws 404 for an unknown user and 400 when the user lacks the channel. */
  async testUserChannel(
    userId: number,
    channel: UserTestChannel,
  ): Promise<NotificationTestResult> {
    return this.unwrapTestOutcome(
      await testUserChannel(userId, channel, this.deps),
    )
  }

  sendDeleteSyncNotification(
    results: DeleteSyncResult,
    dryRun: boolean,
  ): Promise<boolean> {
    return this.track(sendDeleteSyncNotification(this.deps, results, dryRun))
  }

  sendUpdateAvailableNotification(
    release: UpdateAvailableRelease,
  ): Promise<boolean> {
    return this.track(sendUpdateAvailable(this.deps, release))
  }

  sendWatchlistAdded(
    user: Friend & { userId: number },
    item: WatchlistItemInfo,
    routingDetails?: RoutingDetails[],
  ): Promise<boolean> {
    return this.track(sendWatchlistAdded(this.deps, user, item, routingDetails))
  }

  sendApprovalBatch(
    queuedRequests: ApprovalRequest[],
    totalPending: number,
  ): Promise<boolean> {
    return this.track(
      sendApprovalBatch(this.deps, queuedRequests, totalPending),
    )
  }

  /** Trailing-edge debounce. Each call resets the timer and the delivery runs after the quiet period. */
  sendWatchlistCapReached(event: WatchlistCapNotification): void {
    sendWatchlistCapReached(this.deps, event)
  }

  /** Call when the user is at or under the cap, so going over again notifies even at a previously notified count. */
  clearWatchlistCap(
    userId: number,
    contentType: WatchlistCapNotification['contentType'],
  ): void {
    clearWatchlistCap(this.state, userId, contentType)
  }

  /** Resolves once matching and record claims are done. Deliveries keep running in the background. */
  sendMediaAvailable(
    mediaInfo: MediaInfo,
    options: MediaAvailableOptions,
  ): Promise<{ matchedCount: number }> {
    return sendMediaAvailable(this.deps, mediaInfo, options)
  }

  sendApprovalResolved(
    request: ApprovalRequest,
    resolution: 'approved' | 'denied',
    resolvedBy: number | null,
    notes?: string,
  ): Promise<boolean> {
    return this.track(
      sendApprovalResolved(this.deps, request, resolution, resolvedBy, notes),
    )
  }

  sendApprovalAuto(
    request: ApprovalRequest,
    routing: NonNullable<RouterDecision['routing']>,
    reason: string,
  ): Promise<boolean> {
    return this.track(sendApprovalAuto(this.deps, request, routing, reason))
  }

  sendWatchlistRemoved(
    userId: number,
    username: string,
    item: WatchlistItem & { id: number },
  ): Promise<boolean> {
    return this.track(sendWatchlistRemoved(this.deps, userId, username, item))
  }

  sendUserCreated(user: User): Promise<boolean> {
    return this.track(sendUserCreated(this.deps, user))
  }
}
