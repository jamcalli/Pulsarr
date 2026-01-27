/**
 * Webhook Queue Service
 *
 * Orchestrates webhook batching and processing for Sonarr/Radarr notifications.
 * Consolidates queue state management, episode detection, and pending webhook handling.
 */

import type {
  RadarrPayload,
  SonarrPayload,
  WebhookPayload,
} from '@root/schemas/notifications/webhook.schema.js'
import type { RadarrInstance } from '@root/types/radarr.types.js'
import type { SonarrInstance } from '@root/types/sonarr.types.js'
import type { WebhookQueue } from '@root/types/webhook.types.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  addEpisodesToQueue,
  addEpisodeToQueue,
  clearAllTimeouts,
  type EpisodeQueueDeps,
  ensureShowQueue,
  isEpisodeAlreadyQueued,
  type QueueManagerDeps,
} from './webhook-queue/batching/index.js'
import {
  type EpisodeCheckerDeps,
  fetchExpectedEpisodeCount,
  isRecentEpisode,
  isSeasonComplete,
  type SeasonCompletionDeps,
} from './webhook-queue/detection/index.js'
import {
  cleanupExpiredWebhooks,
  type PendingStoreDeps,
  type PendingWebhookParams,
  processPendingWebhooks,
  queuePendingWebhook,
  type RetryProcessorDeps,
} from './webhook-queue/persistence/index.js'
import {
  type NotificationHandlerDeps,
  notifyOrQueueShow,
  processQueuedWebhooks,
  type QueueProcessorDeps,
  type SyncSuppressionDeps,
  shouldSuppressRadarrNotification,
} from './webhook-queue/processing/index.js'

export interface WebhookQueueConfig {
  retryInterval: number
  maxAge: number
  cleanupInterval: number
}

export class WebhookQueueService {
  private readonly log: FastifyBaseLogger
  private readonly _queue: WebhookQueue = {}
  private readonly _config: WebhookQueueConfig
  private _isRunning = false
  private _processingState = {
    processingWebhooks: false,
    cleaningUp: false,
  }

  constructor(
    baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    config?: Partial<WebhookQueueConfig>,
  ) {
    this.log = createServiceLogger(baseLog, 'WEBHOOK_QUEUE')
    this._config = {
      retryInterval: config?.retryInterval ?? 20,
      maxAge: config?.maxAge ?? 10,
      cleanupInterval: config?.cleanupInterval ?? 60,
    }
  }

  // ============================================================================
  // Getters
  // ============================================================================

  get queue(): WebhookQueue {
    return this._queue
  }

  get config(): WebhookQueueConfig {
    return this._config
  }

  // ============================================================================
  // Dependencies
  // ============================================================================

  private get queueManagerDeps(): QueueManagerDeps {
    return { logger: this.log }
  }

  private get episodeCheckerDeps(): EpisodeCheckerDeps {
    return {
      logger: this.log,
      newEpisodeThreshold: this.fastify.config.newEpisodeThreshold,
    }
  }

  private get seasonCompletionDeps(): SeasonCompletionDeps {
    return {
      logger: this.log,
      queue: this._queue,
      getSeriesByTvdbId: (tvdbId) =>
        this.fastify.sonarrManager.getSeriesByTvdbIdFromAny(tvdbId),
    }
  }

  private get pendingStoreDeps(): PendingStoreDeps {
    return {
      db: this.fastify.db,
      logger: this.log,
      maxAgeMinutes: this._config.maxAge,
    }
  }

  private get queueProcessorDeps(): QueueProcessorDeps {
    return {
      logger: this.log,
      queue: this._queue,
      notifications: this.fastify.notifications,
      episodeCheckerDeps: this.episodeCheckerDeps,
      pendingStoreDeps: this.pendingStoreDeps,
    }
  }

  private get retryProcessorDeps(): RetryProcessorDeps {
    const plexLabelSyncService = this.fastify.plexLabelSyncService
    return {
      db: this.fastify.db,
      logger: this.log,
      notifications: this.fastify.notifications,
      plexLabelSyncEnabled: this.fastify.config.plexLabelSync?.enabled ?? false,
      syncLabelsOnWebhook: plexLabelSyncService
        ? (payload) =>
            plexLabelSyncService.syncLabelsOnWebhook(payload).then(() => {})
        : null,
    }
  }

  private get episodeQueueDeps(): EpisodeQueueDeps {
    return {
      logger: this.log,
      queue: this._queue,
      queueWaitTime: this.fastify.config.queueWaitTime,
      processQueuedWebhooks: (tvdbId, seasonNumber) =>
        this.processQueuedWebhooks(tvdbId, seasonNumber),
      fetchExpectedEpisodeCount: (tvdbId, seasonNumber) =>
        this.fetchExpectedEpisodeCount(tvdbId, seasonNumber),
      isSeasonComplete: (tvdbId, seasonNumber) =>
        this.isSeasonComplete(tvdbId, seasonNumber),
    }
  }

  private get notificationHandlerDeps(): NotificationHandlerDeps {
    return {
      logger: this.log,
      getWatchlistItemsByGuid: (guid) =>
        this.fastify.db.getWatchlistItemsByGuid(guid),
      sendMediaAvailable: (mediaInfo, options) =>
        this.fastify.notifications.sendMediaAvailable(mediaInfo, options),
      queuePendingWebhook: (params) => this.queuePendingWebhook(params),
    }
  }

  private get syncSuppressionDeps(): SyncSuppressionDeps {
    return {
      logger: this.log,
      isRadarrItemSyncing: (itemId, instanceId) =>
        this.fastify.db.isRadarrItemSyncing(itemId, instanceId),
      updateWatchlistRadarrInstanceStatus: (
        itemId,
        instanceId,
        status,
        error,
      ) =>
        this.fastify.db.updateWatchlistRadarrInstanceStatus(
          itemId,
          instanceId,
          status,
          error,
        ),
      updateRadarrSyncingStatus: (itemId, instanceId, syncing) =>
        this.fastify.db.updateRadarrSyncingStatus(itemId, instanceId, syncing),
    }
  }

  // ============================================================================
  // Public Methods - Delegating to Submodules
  // ============================================================================

  isEpisodeAlreadyQueued(
    tvdbId: string,
    seasonNumber: number,
    episodeNumber: number,
  ): boolean {
    return isEpisodeAlreadyQueued(
      tvdbId,
      seasonNumber,
      episodeNumber,
      this._queue,
    )
  }

  isRecentEpisode(airDateUtc: string): boolean {
    return isRecentEpisode(airDateUtc, this.episodeCheckerDeps)
  }

  async processQueuedWebhooks(
    tvdbId: string,
    seasonNumber: number,
  ): Promise<void> {
    return processQueuedWebhooks(tvdbId, seasonNumber, this.queueProcessorDeps)
  }

  async queuePendingWebhook(params: PendingWebhookParams): Promise<void> {
    return queuePendingWebhook(params, this.pendingStoreDeps)
  }

  async fetchExpectedEpisodeCount(
    tvdbId: string,
    seasonNumber: number,
  ): Promise<number | null> {
    return fetchExpectedEpisodeCount(
      tvdbId,
      seasonNumber,
      this.seasonCompletionDeps,
    )
  }

  isSeasonComplete(tvdbId: string, seasonNumber: number): boolean {
    return isSeasonComplete(tvdbId, seasonNumber, this.seasonCompletionDeps)
  }

  // ============================================================================
  // Webhook Handlers
  // ============================================================================

  async handleMovieWebhook(
    body: RadarrPayload,
    instance: RadarrInstance | null,
  ): Promise<void> {
    const tmdbGuid = `tmdb:${body.movie.tmdbId}`
    const matchingItems =
      await this.fastify.db.getWatchlistItemsByGuid(tmdbGuid)

    // No matches - queue for later
    if (matchingItems.length === 0) {
      this.log.info(
        {
          title: body.movie.title,
          tmdbId: body.movie.tmdbId,
          instanceName: instance?.name ?? body.instanceName,
        },
        'Movie not in watchlist yet, queuing webhook for later processing',
      )
      await this.queuePendingWebhook({
        instanceType: 'radarr',
        instanceId: instance?.id ?? null,
        guid: tmdbGuid,
        title: body.movie.title,
        mediaType: 'movie',
        payload: body,
      })
      return
    }

    // Check sync status suppression
    if (instance) {
      const suppressed = await shouldSuppressRadarrNotification(
        matchingItems,
        instance,
        this.syncSuppressionDeps,
      )
      if (suppressed) return
    }

    this.log.info(
      {
        title: body.movie.title,
        tmdbId: body.movie.tmdbId,
        instanceName: instance?.name ?? body.instanceName,
      },
      'Processing movie download',
    )

    await this.fastify.notifications.sendMediaAvailable(
      { type: 'movie', guid: tmdbGuid, title: body.movie.title },
      {
        isBulkRelease: false,
        sequential: true,
        instanceId: instance?.id,
        instanceType: 'radarr',
      },
    )
  }

  async handleSonarrWebhook(
    body: SonarrPayload,
    instance: SonarrInstance | null,
  ): Promise<void> {
    const tvdbId = body.series.tvdbId.toString()
    const seasonNumber = body.episodes[0].seasonNumber
    const episodeNumber = body.episodes[0].episodeNumber

    this.log.debug(
      {
        tvdbId,
        instanceName: instance?.name ?? body.instanceName,
        series: body.series.title,
        seasonNumber,
        episodeNumber,
        eventType: body.eventType,
        hasEpisodeFile: 'episodeFile' in body,
        hasEpisodeFiles: 'episodeFiles' in body,
        episodeCount: body.episodes.length,
      },
      'Processing Sonarr webhook',
    )

    // Single episode path
    if ('episodeFile' in body && !('episodeFiles' in body)) {
      await this.handleSingleEpisode(body, tvdbId, seasonNumber, instance)
      return
    }

    // Bulk episode path
    if ('episodeFiles' in body) {
      await this.handleBulkEpisodes(body, tvdbId, seasonNumber, instance)
    }
  }

  triggerLabelSync(body: WebhookPayload): void {
    if (!this.fastify.config.plexLabelSync?.enabled) {
      return
    }

    const svc = this.fastify.plexLabelSyncService
    if (!svc) {
      this.log.warn(
        'plexLabelSync.enabled is true but plexLabelSyncService is not registered',
      )
      return
    }

    setImmediate(() => {
      void svc.syncLabelsOnWebhook(body).catch((error: unknown) => {
        this.log.error(
          { error, instanceName: body.instanceName },
          'Plex label sync failed for webhook',
        )
      })
    })
  }

  // ============================================================================
  // Private Handlers
  // ============================================================================

  private async handleSingleEpisode(
    body: SonarrPayload,
    tvdbId: string,
    seasonNumber: number,
    instance: SonarrInstance | null,
  ): Promise<void> {
    const episode = body.episodes[0]
    const episodeNumber = episode.episodeNumber

    const isCompleteDownload =
      body.eventType === 'Download' && 'episodeFile' in body && body.episodeFile

    if (!isCompleteDownload) {
      this.log.debug('Skipping non-download webhook')
      return
    }

    this.log.debug(
      { tvdbId, season: seasonNumber, episode: episodeNumber },
      'Processing individual episode completion',
    )

    ensureShowQueue(tvdbId, body.series.title, this._queue, this.log)

    // Recent episode - notify immediately
    if (this.isRecentEpisode(episode.airDateUtc)) {
      await notifyOrQueueShow(
        tvdbId,
        body.series.title,
        [episode],
        instance,
        this.notificationHandlerDeps,
      )
      return
    }

    // Non-recent - add to queue for batching
    await addEpisodeToQueue(
      tvdbId,
      seasonNumber,
      episode,
      instance?.id ?? null,
      this.episodeQueueDeps,
    )
  }

  private async handleBulkEpisodes(
    body: SonarrPayload,
    tvdbId: string,
    seasonNumber: number,
    instance: SonarrInstance | null,
  ): Promise<void> {
    ensureShowQueue(tvdbId, body.series.title, this._queue, this.log)

    // Split recent vs non-recent
    const recentEpisodes = body.episodes.filter((ep) =>
      this.isRecentEpisode(ep.airDateUtc),
    )
    const nonRecentEpisodes = body.episodes.filter(
      (ep) => !this.isRecentEpisode(ep.airDateUtc),
    )

    // Recent episodes - notify immediately
    if (recentEpisodes.length > 0) {
      this.log.debug(
        {
          count: recentEpisodes.length,
          tvdbId,
          series: body.series.title,
          instanceId: instance?.id ?? null,
        },
        'Processing recent episodes for immediate notification',
      )
      await notifyOrQueueShow(
        tvdbId,
        body.series.title,
        recentEpisodes,
        instance,
        this.notificationHandlerDeps,
      )
    }

    // Non-recent - add to queue
    if (nonRecentEpisodes.length > 0) {
      this.log.debug(
        {
          count: nonRecentEpisodes.length,
          tvdbId,
          seasonNumber,
          series: body.series.title,
        },
        'Adding non-recent episodes to queue',
      )
      await addEpisodesToQueue(
        tvdbId,
        seasonNumber,
        nonRecentEpisodes,
        instance?.id ?? null,
        this.episodeQueueDeps,
      )
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    await this.fastify.scheduler.scheduleJob(
      'pending-webhooks-processor',
      async () => {
        const deleted = await this.processRetryWebhooks()
        if (deleted > 0) {
          this.log.debug(`Deleted ${deleted} pending webhooks`)
        }
      },
    )

    await this.fastify.db.updateSchedule('pending-webhooks-processor', {
      type: 'interval',
      config: { seconds: this._config.retryInterval },
      enabled: true,
    })

    await this.fastify.scheduler.scheduleJob(
      'pending-webhooks-cleanup',
      async () => {
        const cleaned = await this.cleanupExpiredWebhooks()
        if (cleaned > 0) {
          this.log.info(`Cleaned up ${cleaned} expired webhooks`)
        }
      },
    )

    await this.fastify.db.updateSchedule('pending-webhooks-cleanup', {
      type: 'interval',
      config: { seconds: this._config.cleanupInterval },
      enabled: true,
    })

    this._isRunning = true

    await this.processRetryWebhooks()
  }

  private async processRetryWebhooks(): Promise<number> {
    if (!this._isRunning) {
      return 0
    }
    return processPendingWebhooks(
      this._processingState,
      this.retryProcessorDeps,
    )
  }

  private async cleanupExpiredWebhooks(): Promise<number> {
    if (!this._isRunning) {
      return 0
    }
    return cleanupExpiredWebhooks(
      this._processingState,
      this.retryProcessorDeps,
    )
  }

  shutdown(): void {
    this._isRunning = false
    clearAllTimeouts(this._queue, this.queueManagerDeps)
    for (const key of Object.keys(this._queue)) {
      delete this._queue[key]
    }
    this.log.debug('Webhook queue shutdown complete')
  }
}
