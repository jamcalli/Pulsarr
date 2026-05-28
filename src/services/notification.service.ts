import {
  buildRoutingPayload,
  type WebhookPayloadMap,
} from '@root/schemas/webhooks/webhook-payloads.schema.js'
import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { User } from '@root/types/config.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { Friend, Item as WatchlistItem } from '@root/types/plex.types.js'
import type { SonarrEpisodeSchema } from '@root/types/sonarr.types.js'
import type {
  WebhookDispatchResult,
  WebhookEventType,
} from '@root/types/webhook-endpoint.types.js'
import { parseGuids } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  AppriseService,
  DiscordWebhookService,
  dispatchWebhooks,
  PlexMobileService,
} from './notifications/channels/index.js'
import {
  type BotStatus,
  DiscordBotService,
} from './notifications/discord-bot/index.js'
import {
  type ApprovalRequest as ApprovalRequestNotification,
  sendApprovalBatch,
  sendDeleteSyncCompleted,
  sendMediaAvailable,
  sendUpdateAvailable,
  sendWatchlistAdded,
  sendWatchlistCapNotification,
  type UpdateAvailableRelease,
  type WatchlistCapEvent,
  type WatchlistItemInfo,
} from './notifications/orchestration/index.js'

export class NotificationService {
  private readonly log: FastifyBaseLogger
  private readonly _discordBot: DiscordBotService
  private readonly _discordWebhook: DiscordWebhookService
  private readonly _plexMobile: PlexMobileService
  private readonly _apprise: AppriseService

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'NOTIFICATIONS')
    this.log.debug('Initializing notification service')

    this._discordBot = new DiscordBotService(this.log, this.fastify)
    this._discordWebhook = new DiscordWebhookService(this.log, this.fastify)
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

  getBotStatus(): BotStatus {
    return this._discordBot.getBotStatus()
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

    // Fire-and-forget to avoid blocking startup; callers fired during boot
    // should await fastify.notifications.apprise.whenReady().
    this._apprise.initialize().catch((error) => {
      this.log.error({ error }, 'Unexpected error in Apprise initialization')
    })
  }

  async shutdown(): Promise<void> {
    if (this._discordBot.getBotStatus() === 'running') {
      this.log.info('Stopping Discord bot during shutdown')
      await this._discordBot.stopBot()
    }

    this._plexMobile.shutdown()
  }

  async sendDeleteSyncNotification(
    results: DeleteSyncResult,
    dryRun: boolean,
    notifyOption?: string,
  ): Promise<boolean> {
    return sendDeleteSyncCompleted(
      {
        db: this.fastify.db,
        logger: this.log,
        discordBot: this._discordBot,
        discordWebhook: this._discordWebhook,
        apprise: this._apprise,
        config: {
          deleteSyncNotify:
            notifyOption || this.fastify.config.deleteSyncNotify || 'none',
          deleteSyncNotifyOnlyOnDeletion:
            this.fastify.config.deleteSyncNotifyOnlyOnDeletion || false,
          discordWebhookUrl: this.fastify.config.discordWebhookUrl,
        },
      },
      results,
      dryRun,
    )
  }

  async sendUpdateAvailableNotification(
    release: UpdateAvailableRelease,
  ): Promise<boolean> {
    return sendUpdateAvailable(
      {
        logger: this.log,
        discordWebhook: this._discordWebhook,
        apprise: this._apprise,
        config: {
          discordWebhookUrl: this.fastify.config.discordWebhookUrl,
        },
      },
      release,
    )
  }

  async sendWatchlistAdded(
    user: Friend & { userId: number },
    item: WatchlistItemInfo,
    routingDetails?: Array<{
      instanceId: number
      instanceType: 'radarr' | 'sonarr'
      qualityProfile?: number | string | null
      rootFolder?: string | null
      tags?: string[]
      searchOnAdd?: boolean | null
      minimumAvailability?: string | null
      seasonMonitoring?: string | null
      seriesType?: string | null
      monitor?: 'movieOnly' | 'movieAndCollection' | 'none' | null
      ruleId?: number
      ruleName?: string
    }>,
  ): Promise<boolean> {
    return sendWatchlistAdded(
      {
        db: this.fastify.db,
        logger: this.log,
        discordWebhook: this._discordWebhook,
        apprise: this._apprise,
      },
      user,
      item,
      routingDetails,
    )
  }

  async sendApprovalBatch(
    queuedRequests: ApprovalRequestNotification[],
    totalPending: number,
  ): Promise<number> {
    return sendApprovalBatch(
      {
        db: this.fastify.db,
        logger: this.log,
        discordBot: this._discordBot,
        discordWebhook: this._discordWebhook,
        apprise: this._apprise,
        config: {
          approvalNotify: this.fastify.config.approvalNotify || 'none',
        },
      },
      queuedRequests,
      totalPending,
    )
  }

  // Trailing-edge debounce: each call resets the timer; fires after quiet period.
  sendWatchlistCapReached(event: WatchlistCapEvent): void {
    sendWatchlistCapNotification(
      {
        db: this.fastify.db,
        logger: this.log,
        discordBot: this._discordBot,
        discordWebhook: this._discordWebhook,
        apprise: this._apprise,
        config: {
          watchlistCapNotify: this.fastify.config.watchlistCapNotify || 'none',
          watchlistCapNotifyUser:
            this.fastify.config.watchlistCapNotifyUser || false,
        },
      },
      event,
    )
  }

  async sendMediaAvailable(
    mediaInfo: {
      type: 'movie' | 'show'
      guid: string
      title: string
      episodes?: SonarrEpisodeSchema[]
    },
    options: {
      isBulkRelease: boolean
      instanceId?: number
      instanceType?: 'sonarr' | 'radarr'
      sequential?: boolean
    },
  ): Promise<{ matchedCount: number }> {
    return sendMediaAvailable(
      {
        db: this.fastify.db,
        config: this.fastify.config,
        logger: this.log,
        discordBot: this._discordBot,
        discordWebhook: this._discordWebhook,
        plexMobile: this._plexMobile,
        apprise: this._apprise,
      },
      mediaInfo,
      options,
    )
  }

  async sendNativeWebhook<T extends WebhookEventType>(
    eventType: T,
    data: WebhookPayloadMap[T],
  ): Promise<WebhookDispatchResult> {
    return dispatchWebhooks(eventType, data, {
      db: this.fastify.db,
      log: this.log,
    })
  }

  async sendApprovalResolved(
    request: ApprovalRequest,
    resolution: 'approved' | 'denied',
    resolvedBy: number | null,
    notes?: string,
  ): Promise<boolean> {
    // Include routing info only when approved (not for rejections)
    const proposedRouting =
      resolution === 'approved'
        ? request.proposedRouterDecision?.approval?.proposedRouting
        : undefined

    // Map internal 'denied' status to 'rejected' for webhook payload
    const status =
      resolution === 'denied' ? ('rejected' as const) : ('approved' as const)

    const routing = proposedRouting
      ? buildRoutingPayload(proposedRouting)
      : undefined

    const payload = {
      approvalId: request.id,
      status,
      content: {
        title: request.contentTitle,
        type: request.contentType,
        key: request.contentKey,
        guids: request.contentGuids,
      },
      requestedBy: {
        userId: request.userId,
        username: request.userName,
      },
      resolvedBy: {
        userId: resolvedBy,
      },
      approvalNotes: notes,
      triggeredBy: request.triggeredBy,
      createdAt: request.createdAt,
      resolvedAt: request.updatedAt,
      routing,
    }

    const result = await dispatchWebhooks('approval.resolved', payload, {
      db: this.fastify.db,
      log: this.log,
    })

    if (result.succeeded > 0) {
      try {
        await this.fastify.db.createNotificationRecord({
          watchlist_item_id: null,
          user_id: request.userId,
          type: 'approval_resolved',
          title: request.contentTitle,
          message: `Approval ${resolution}: ${request.contentTitle}`,
          sent_to_discord: false,
          sent_to_apprise: false,
          sent_to_native_webhook: true,
        })
      } catch (error) {
        this.log.error(
          { error, requestId: request.id },
          'Failed to record approval resolved notification',
        )
      }
    }

    return result.succeeded > 0
  }

  async sendApprovalAuto(
    request: ApprovalRequest,
    routing: {
      instanceType: 'radarr' | 'sonarr'
      instanceId: number
      qualityProfile: number | string | null
      rootFolder: string | null
      tags: string[]
      searchOnAdd?: boolean | null
      minimumAvailability?: string | null
      seasonMonitoring?: string | null
      seriesType?: 'standard' | 'anime' | 'daily' | null
      monitor?: 'movieOnly' | 'movieAndCollection' | 'none' | null
      syncedInstances?: number[]
    },
    reason: string,
  ): Promise<boolean> {
    const payload = {
      approvalId: request.id,
      content: {
        title: request.contentTitle,
        type: request.contentType,
        key: request.contentKey,
        guids: request.contentGuids,
      },
      user: {
        userId: request.userId,
        username: request.userName,
      },
      routing: buildRoutingPayload(routing),
      reason,
    }

    const result = await dispatchWebhooks('approval.auto', payload, {
      db: this.fastify.db,
      log: this.log,
    })

    if (result.succeeded > 0) {
      try {
        await this.fastify.db.createNotificationRecord({
          watchlist_item_id: null,
          user_id: request.userId,
          type: 'approval_auto',
          title: request.contentTitle,
          message: `Auto-approved: ${request.contentTitle}`,
          sent_to_discord: false,
          sent_to_apprise: false,
          sent_to_native_webhook: true,
        })
      } catch (error) {
        this.log.error(
          { error, requestId: request.id },
          'Failed to record auto-approval notification',
        )
      }
    }

    return result.succeeded > 0
  }

  async sendWatchlistRemoved(
    userId: number,
    username: string,
    item: WatchlistItem & { id: number },
  ): Promise<boolean> {
    const guids =
      typeof item.guids === 'string'
        ? parseGuids(item.guids)
        : (item.guids ?? [])
    const contentType =
      item.type === 'show' ? ('show' as const) : ('movie' as const)

    const payload = {
      watchlistItemId: item.id,
      content: {
        title: item.title,
        type: contentType,
        key: item.key,
        guids,
      },
      removedBy: {
        userId,
        username,
      },
    }

    const result = await dispatchWebhooks('watchlist.removed', payload, {
      db: this.fastify.db,
      log: this.log,
    })

    if (result.succeeded > 0) {
      try {
        await this.fastify.db.createNotificationRecord({
          watchlist_item_id: item.id,
          user_id: userId,
          type: 'watchlist_removed',
          title: item.title,
          message: `Removed from watchlist: ${item.title}`,
          sent_to_discord: false,
          sent_to_apprise: false,
          sent_to_native_webhook: true,
        })
      } catch (error) {
        this.log.error(
          { error, userId, title: item.title },
          'Failed to record watchlist removed notification',
        )
      }
    }

    return result.succeeded > 0
  }

  async sendUserCreated(user: User): Promise<boolean> {
    const payload = {
      user: {
        id: user.id,
        name: user.name,
        alias: user.alias ?? null,
      },
      canSync: user.can_sync ?? true,
      requiresApproval: user.requires_approval ?? false,
      createdAt: user.created_at ?? new Date().toISOString(),
    }

    const result = await dispatchWebhooks('user.created', payload, {
      db: this.fastify.db,
      log: this.log,
    })

    if (result.succeeded > 0) {
      try {
        await this.fastify.db.createNotificationRecord({
          watchlist_item_id: null,
          user_id: user.id,
          type: 'user_created',
          title: user.name,
          message: `New user created: ${user.name}`,
          sent_to_discord: false,
          sent_to_apprise: false,
          sent_to_native_webhook: true,
        })
      } catch (error) {
        this.log.error(
          { error, userId: user.id },
          'Failed to record user created notification',
        )
      }
    }

    return result.succeeded > 0
  }
}
