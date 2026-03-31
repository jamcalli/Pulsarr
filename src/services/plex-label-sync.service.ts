/**
 * Plex Label Sync Service
 *
 * Thin orchestrator that wires config and service dependencies into the
 * decomposed label-sync modules (orchestration, cleanup, tracking).
 */

import type {
  RadarrMovieWithTags,
  SonarrSeriesWithTags,
  SyncResult,
} from '@root/types/plex-label-sync.types.js'
import type { WebhookPayload } from '@schemas/notifications/webhook.schema.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

import {
  cleanupLabelsForWatchlistItems,
  cleanupOrphanedPlexLabels,
  removeAllLabels,
  resetLabels,
} from './plex-label-sync/cleanup/index.js'
import {
  fetchTagsForWatchlistItem,
  syncAllLabels,
} from './plex-label-sync/orchestration/batch-sync.js'
import { processPendingLabelSyncs } from './plex-label-sync/orchestration/pending-sync.js'
import {
  syncLabelForNewWatchlistItem,
  syncLabelsOnWebhook,
} from './plex-label-sync/orchestration/webhook-sync.js'

export class PlexLabelSyncService {
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'PLEX_LABEL_SYNC')
    this.log.info('Initializing PlexLabelSyncService')
  }

  private get config(): PlexLabelSyncConfig {
    return (
      this.fastify.config.plexLabelSync || {
        enabled: false,
        labelPrefix: 'pulsarr',
        concurrencyLimit: 5,
        cleanupOrphanedLabels: false,
        removedLabelMode: 'remove' as const,
        removedLabelPrefix: 'pulsarr:removed',
        autoResetOnScheduledSync: false,
        scheduleTime: undefined,
        dayOfWeek: '*',
        tagSync: {
          enabled: false,
          syncRadarrTags: true,
          syncSonarrTags: true,
        },
      }
    )
  }

  private get removedLabelMode(): 'remove' | 'keep' | 'special-label' {
    return this.config.removedLabelMode || 'remove'
  }

  private get plexServer() {
    return this.fastify.plexServerService
  }

  private get db() {
    return this.fastify.db
  }

  private get removedLabelPrefix(): string {
    return this.config.removedLabelPrefix || 'pulsarr:removed'
  }

  async syncLabelsOnWebhook(webhook: WebhookPayload): Promise<boolean> {
    return syncLabelsOnWebhook(webhook, {
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      radarrManager: this.fastify.radarrManager,
      sonarrManager: this.fastify.sonarrManager,
      fastify: this.fastify,
      labelPrefix: this.config.labelPrefix,
      removedLabelPrefix: this.removedLabelPrefix,
      removedLabelMode: this.removedLabelMode,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
      queuePendingLabelSyncByWatchlistId:
        this.queuePendingLabelSyncByWatchlistId.bind(this),
      extractContentGuidFromWebhook:
        this.extractContentGuidFromWebhook.bind(this),
      extractTagsFromWebhook: this.extractTagsFromWebhook.bind(this),
      fetchTagsForWatchlistItem: this.fetchTagsForWatchlistItem.bind(this),
    })
  }

  async syncAllLabels(): Promise<SyncResult> {
    return syncAllLabels({
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      radarrManager: this.fastify.radarrManager,
      sonarrManager: this.fastify.sonarrManager,
      fastify: this.fastify,
      removedLabelMode: this.removedLabelMode,
      removedLabelPrefix: this.removedLabelPrefix,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
      resetLabels: this.resetLabels.bind(this),
      cleanupOrphanedPlexLabels: this.cleanupOrphanedPlexLabels.bind(this),
    })
  }

  async queuePendingLabelSyncByWatchlistId(
    watchlistItemId: number,
    title: string,
    webhookTags: string[] = [],
  ): Promise<void> {
    try {
      await this.db.createPendingLabelSync(
        watchlistItemId,
        title,
        10, // 10 minute default expiration
        webhookTags,
      )
    } catch (error) {
      this.log.error({ error }, 'Error queuing pending label sync:')
    }
  }

  async fetchTagsForWatchlistItem(watchlistItem: {
    id: string | number
    title: string
    key: string | null
    type?: string
    guids?: string[]
    tmdbId?: number
    tvdbId?: number
  }): Promise<string[]> {
    return fetchTagsForWatchlistItem(watchlistItem, {
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      radarrManager: this.fastify.radarrManager,
      sonarrManager: this.fastify.sonarrManager,
      fastify: this.fastify,
      removedLabelMode: this.removedLabelMode,
      removedLabelPrefix: this.removedLabelPrefix,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
      resetLabels: this.resetLabels.bind(this),
      cleanupOrphanedPlexLabels: this.cleanupOrphanedPlexLabels.bind(this),
    })
  }

  async syncLabelForNewWatchlistItem(
    watchlistItemId: number,
    title: string,
    fetchTags = true,
  ): Promise<boolean> {
    return syncLabelForNewWatchlistItem(watchlistItemId, title, fetchTags, {
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      radarrManager: this.fastify.radarrManager,
      sonarrManager: this.fastify.sonarrManager,
      fastify: this.fastify,
      labelPrefix: this.config.labelPrefix,
      removedLabelPrefix: this.removedLabelPrefix,
      removedLabelMode: this.removedLabelMode,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
      queuePendingLabelSyncByWatchlistId:
        this.queuePendingLabelSyncByWatchlistId.bind(this),
      extractContentGuidFromWebhook:
        this.extractContentGuidFromWebhook.bind(this),
      extractTagsFromWebhook: this.extractTagsFromWebhook.bind(this),
      fetchTagsForWatchlistItem: this.fetchTagsForWatchlistItem.bind(this),
    })
  }

  private extractTagsFromWebhook(webhook: WebhookPayload): string[] {
    try {
      if ('eventType' in webhook && webhook.eventType === 'Test') {
        return []
      }

      if ('movie' in webhook && webhook.movie.tags) {
        return webhook.movie.tags.map(String)
      }

      if ('series' in webhook && webhook.series.tags) {
        return webhook.series.tags.map(String)
      }

      return []
    } catch (error) {
      this.log.error({ error }, 'Error extracting tags from webhook:')
      return []
    }
  }

  private extractContentGuidFromWebhook(
    webhook: WebhookPayload,
  ): { guids: string[]; contentType: 'movie' | 'show' } | null {
    try {
      if ('eventType' in webhook && webhook.eventType === 'Test') {
        return null
      }

      if ('movie' in webhook) {
        return {
          guids: [`tmdb:${webhook.movie.tmdbId}`],
          contentType: 'movie',
        }
      }

      if ('series' in webhook) {
        return {
          guids: [`tvdb:${webhook.series.tvdbId}`],
          contentType: 'show',
        }
      }

      return null
    } catch (error) {
      this.log.error({ error }, 'Error extracting content GUID from webhook:')
      return null
    }
  }

  async processPendingLabelSyncs(): Promise<SyncResult> {
    return processPendingLabelSyncs({
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      removedLabelMode: this.removedLabelMode,
      removedLabelPrefix: this.removedLabelPrefix,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
    })
  }

  async cleanupLabelsForWatchlistItems(
    watchlistItems: Array<{
      id: number
      title?: string
      key: string
      user_id: number
      guids: string[]
      contentType: 'movie' | 'show'
    }>,
  ): Promise<void> {
    return cleanupLabelsForWatchlistItems(watchlistItems, {
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      radarrManager: this.fastify.radarrManager,
      sonarrManager: this.fastify.sonarrManager,
      fastify: this.fastify,
      labelPrefix: this.config.labelPrefix,
      removedLabelPrefix: this.removedLabelPrefix,
      removedLabelMode: this.removedLabelMode,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
    })
  }

  async removeAllLabels(): Promise<{
    processed: number
    removed: number
    failed: number
  }> {
    return removeAllLabels({
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      fastify: this.fastify,
      labelPrefix: this.config.labelPrefix,
      removedLabelPrefix: this.removedLabelPrefix,
      removedLabelMode: this.removedLabelMode,
    })
  }

  async cleanupOrphanedPlexLabels(
    radarrMoviesWithTags?: RadarrMovieWithTags[],
    sonarrSeriesWithTags?: SonarrSeriesWithTags[],
  ): Promise<{
    removed: number
    failed: number
  }> {
    return cleanupOrphanedPlexLabels(
      radarrMoviesWithTags,
      sonarrSeriesWithTags,
      {
        plexServer: this.plexServer,
        db: this.db,
        logger: this.log,
        config: this.config,
        radarrManager: this.fastify.radarrManager,
        sonarrManager: this.fastify.sonarrManager,
        fastify: this.fastify,
        labelPrefix: this.config.labelPrefix,
        removedLabelPrefix: this.removedLabelPrefix,
        removedLabelMode: this.removedLabelMode,
        tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
        removedTagPrefix:
          this.fastify.config.removedTagPrefix || 'pulsarr-removed',
      },
    )
  }

  async resetLabels(
    watchlistItems?: Array<{
      id: string | number
      user_id: number
      guids?: string[] | string
      title: string
      type?: string
      key: string | null
    }>,
  ): Promise<{ processed: number; updated: number; failed: number }> {
    return resetLabels(watchlistItems, {
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      fastify: this.fastify,
      labelPrefix: this.config.labelPrefix,
      removedLabelPrefix: this.removedLabelPrefix,
      removedLabelMode: this.removedLabelMode,
    })
  }
}
