/**
 * Media Available Notification Orchestration
 *
 * Consolidates all media availability notification logic into a single orchestration module.
 * Handles user notifications, public notifications, and all delivery channels.
 */

import type { Config } from '@root/types/config.types.js'
import type { MediaNotification } from '@root/types/discord.types.js'
import type { NotificationType } from '@root/types/notification.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type {
  NotificationResult,
  SonarrEpisodeSchema,
} from '@root/types/sonarr.types.js'
import { getTmdbUrl } from '@root/utils/guid-handler.js'
import { mapRowToUser } from '@services/database/methods/users.js'
import type { DatabaseService } from '@services/database.service.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { DiscordWebhookService } from '@services/notifications/channels/discord-webhook.service.js'
import {
  dispatchWebhooks,
  hasWebhooksForEvent,
} from '@services/notifications/channels/native-webhook.js'
import type { DiscordBotService } from '@services/notifications/discord-bot/bot.service.js'
import type { TautulliService } from '@services/notifications/tautulli/tautulli.service.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'

// ============================================================================
// Types
// ============================================================================

export interface MediaAvailableDeps {
  db: DatabaseService
  config: Config
  logger: FastifyBaseLogger
  discordBot: DiscordBotService
  discordWebhook: DiscordWebhookService
  tautulli: TautulliService
  apprise: AppriseService
}

/**
 * Media information for availability notifications.
 * Matches the shape used by webhook handlers throughout the codebase.
 */
export interface MediaInfo {
  type: 'movie' | 'show'
  guid: string
  title: string
  episodes?: SonarrEpisodeSchema[]
}

/**
 * Options for processing media available notifications.
 */
export interface MediaAvailableOptions {
  isBulkRelease: boolean
  instanceId?: number
  instanceType?: 'sonarr' | 'radarr'
  sequential?: boolean
}

// ============================================================================
// Helper Functions (exported for testing)
// ============================================================================

export function determineNotificationType(
  mediaInfo: MediaInfo,
  isBulkRelease: boolean,
): {
  contentType: 'movie' | 'season' | 'episode'
  seasonNumber?: number
  episodeNumber?: number
} | null {
  if (mediaInfo.type === 'movie') {
    return { contentType: 'movie' }
  }

  if (mediaInfo.type === 'show' && mediaInfo.episodes?.length) {
    if (isBulkRelease) {
      return {
        contentType: 'season',
        seasonNumber: mediaInfo.episodes[0].seasonNumber,
      }
    }
    return {
      contentType: 'episode',
      seasonNumber: mediaInfo.episodes[0].seasonNumber,
      episodeNumber: mediaInfo.episodes[0].episodeNumber,
    }
  }

  return null
}

export function getPublicContentNotificationFlags(
  config: Config['publicContentNotifications'],
): { hasDiscordUrls: boolean; hasAppriseUrls: boolean } {
  return {
    hasDiscordUrls: Boolean(
      config?.discordWebhookUrls?.length ||
        config?.discordWebhookUrlsMovies?.length ||
        config?.discordWebhookUrlsShows?.length,
    ),
    hasAppriseUrls: Boolean(
      config?.appriseUrls?.length ||
        config?.appriseUrlsMovies?.length ||
        config?.appriseUrlsShows?.length,
    ),
  }
}

export function extractUserDiscordIds(
  notifications: NotificationResult[],
): string[] {
  return Array.from(
    new Set(
      notifications
        .filter(
          (r) =>
            r.user.id !== -1 &&
            r.user.discord_id &&
            r.user.discord_id.trim() !== '',
        )
        .map((r) => r.user.discord_id as string),
    ),
  )
}

// ============================================================================
// Delivery Functions
// ============================================================================

async function sendDiscordDm(
  deps: MediaAvailableDeps,
  discordId: string,
  notification: MediaNotification,
  userId: number,
): Promise<void> {
  try {
    await deps.discordBot.sendDirectMessage(discordId, notification)
  } catch (error) {
    deps.logger.error(
      { error, userId, discord_id: discordId },
      'Failed to send Discord notification',
    )
  }
}

async function sendAppriseNotification(
  deps: MediaAvailableDeps,
  user: NotificationResult['user'],
  notification: MediaNotification,
): Promise<void> {
  try {
    await deps.apprise.sendMediaNotification(user, notification)
  } catch (error) {
    deps.logger.error(
      { error, userId: user.id },
      'Failed to send Apprise notification',
    )
  }
}

async function sendTautulliNotification(
  deps: MediaAvailableDeps,
  user: NotificationResult['user'],
  notification: MediaNotification,
  itemByUserId: Map<number, TokenWatchlistItem>,
  mediaInfo: MediaInfo,
): Promise<void> {
  try {
    const userItem = itemByUserId.get(user.id)
    if (!userItem) return

    const rawId =
      typeof userItem.id === 'string'
        ? Number.parseInt(userItem.id, 10)
        : userItem.id

    if (Number.isNaN(rawId)) {
      deps.logger.warn(
        { rawId, userId: user.id },
        'Skipping Tautulli – invalid item id',
      )
      return
    }

    const sent = await deps.tautulli.sendMediaNotification(
      user,
      notification,
      rawId,
      mediaInfo.guid,
      userItem.key,
    )

    deps.logger.debug(
      {
        userId: user.id,
        username: user.name,
        success: sent,
        mediaType: mediaInfo.type,
        guid: mediaInfo.guid,
      },
      'Sent Tautulli notification',
    )
  } catch (error) {
    deps.logger.error(
      { error, userId: user.id, guid: mediaInfo.guid },
      'Failed to send Tautulli notification',
    )
  }
}

async function sendPublicNotifications(
  deps: MediaAvailableDeps,
  result: NotificationResult,
  allResults: NotificationResult[],
): Promise<void> {
  if (result.user.notify_discord) {
    try {
      const userDiscordIds = extractUserDiscordIds(allResults)
      await deps.discordWebhook.sendPublicNotification(
        result.notification,
        userDiscordIds,
      )
    } catch (error) {
      deps.logger.error(
        { error, userId: result.user.id },
        'Failed to send public Discord notification',
      )
    }
  }

  if (result.user.notify_apprise && deps.apprise.isEnabled()) {
    try {
      await deps.apprise.sendPublicNotification(result.notification)
    } catch (error) {
      deps.logger.error(
        { error, userId: result.user.id },
        'Failed to send public Apprise notification',
      )
    }
  }
}

async function sendUserNotifications(
  deps: MediaAvailableDeps,
  result: NotificationResult,
  itemByUserId: Map<number, TokenWatchlistItem>,
  mediaInfo: MediaInfo,
): Promise<void> {
  if (result.user.notify_discord && result.user.discord_id) {
    await sendDiscordDm(
      deps,
      result.user.discord_id,
      result.notification,
      result.user.id,
    )
  }

  if (result.user.notify_apprise && deps.apprise.isEnabled()) {
    await sendAppriseNotification(deps, result.user, result.notification)
  }

  if (result.user.notify_tautulli && deps.tautulli.isEnabled()) {
    await sendTautulliNotification(
      deps,
      result.user,
      result.notification,
      itemByUserId,
      mediaInfo,
    )
  }
}

async function processIndividualNotification(
  deps: MediaAvailableDeps,
  result: NotificationResult,
  allResults: NotificationResult[],
  itemByUserId: Map<number, TokenWatchlistItem>,
  mediaInfo: MediaInfo,
): Promise<void> {
  if (result.user.id === -1) {
    await sendPublicNotifications(deps, result, allResults)
  } else {
    await sendUserNotifications(deps, result, itemByUserId, mediaInfo)
  }
}

// ============================================================================
// Database Operations
// ============================================================================

async function buildNotificationResults(
  deps: MediaAvailableDeps,
  mediaInfo: MediaInfo,
  options: MediaAvailableOptions,
): Promise<{
  notifications: NotificationResult[]
  watchlistItems: TokenWatchlistItem[]
  hasNativeWebhooks: boolean
  /** Shared enrichment data for all channels */
  enrichment: {
    posterUrl: string | undefined
    guids: string[]
    tmdbUrl: string | undefined
    episodeDetails: MediaNotification['episodeDetails']
  }
}> {
  // Check if native webhooks are configured for this event type
  const hasNativeWebhooks = await hasWebhooksForEvent('media.available', {
    db: deps.db,
    log: deps.logger,
  })

  const watchlistItems = await deps.db.getWatchlistItemsByGuid(mediaInfo.guid)

  // Extract shared enrichment data once
  const posterUrl = watchlistItems.find((item) => item.thumb)?.thumb
  const guidsSet = new Set<string>()
  for (const item of watchlistItems) {
    if (item.guids) {
      const itemGuids = Array.isArray(item.guids)
        ? item.guids
        : typeof item.guids === 'string'
          ? item.guids.split(',').map((g) => g.trim())
          : []
      for (const guid of itemGuids) {
        if (guid) guidsSet.add(guid)
      }
    }
  }
  const guids = Array.from(guidsSet)

  // Pre-compute episode details for shows (needed for TMDB URL deep linking)
  let episodeDetails: MediaNotification['episodeDetails']
  const notificationTypeInfo = determineNotificationType(
    mediaInfo,
    options.isBulkRelease,
  )
  if (notificationTypeInfo) {
    const { contentType, seasonNumber } = notificationTypeInfo
    if (contentType === 'season' && seasonNumber !== undefined) {
      episodeDetails = { seasonNumber }
    } else if (
      contentType === 'episode' &&
      mediaInfo.episodes &&
      mediaInfo.episodes.length > 0
    ) {
      const episode = mediaInfo.episodes[0]
      episodeDetails = {
        title: episode.title,
        ...(episode.overview && { overview: episode.overview }),
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        airDateUtc: episode.airDateUtc,
      }
    }
  }

  // Generate TMDB URL with deep linking for episodes/seasons
  const tmdbUrl = getTmdbUrl(guids, mediaInfo.type, episodeDetails)

  const enrichment = { posterUrl, guids, tmdbUrl, episodeDetails }
  const notifications: NotificationResult[] = []

  const userIds = [...new Set(watchlistItems.map((item) => item.user_id))]
  const userRows = await deps.db.knex('users').whereIn('id', userIds)

  const userMap = new Map(userRows.map((row) => [row.id, mapRowToUser(row)]))

  for (const item of watchlistItems) {
    const user = userMap.get(item.user_id)
    if (!user) continue

    if (!user.notify_discord && !user.notify_apprise && !user.notify_tautulli)
      continue

    if (!notificationTypeInfo) continue

    const { contentType, seasonNumber } = notificationTypeInfo

    const notificationTitle = mediaInfo.title || item.title
    const notification: MediaNotification = {
      type: mediaInfo.type,
      title: notificationTitle,
      username: user.name,
      posterUrl: enrichment.posterUrl,
      tmdbUrl: enrichment.tmdbUrl,
      episodeDetails: enrichment.episodeDetails,
    }

    const userId =
      typeof item.user_id === 'object'
        ? (item.user_id as { id: number }).id
        : Number(item.user_id)

    const itemId =
      typeof item.id === 'string' ? Number.parseInt(item.id, 10) : item.id

    const updateData: {
      status: 'notified'
      last_notified_at: string
      radarr_instance_id?: number
      sonarr_instance_id?: number
    } = {
      status: 'notified',
      last_notified_at: new Date().toISOString(),
    }

    if (options.instanceId && options.instanceType === 'radarr') {
      updateData.radarr_instance_id = options.instanceId
    } else if (options.instanceId && options.instanceType === 'sonarr') {
      updateData.sonarr_instance_id = options.instanceId
    }

    // Both operations must be atomic: if notification record creation fails,
    // we must not leave the watchlist item marked as 'notified'
    let notificationCreated = false
    await deps.db.knex.transaction(async (trx) => {
      await deps.db.updateWatchlistItem(item.user_id, item.key, updateData, trx)

      let notificationResult = null

      if (contentType === 'movie') {
        notificationResult = await deps.db.createNotificationRecord(
          {
            watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
            user_id: !Number.isNaN(userId) ? userId : null,
            type: 'movie' as NotificationType,
            title: notificationTitle,
            sent_to_discord: Boolean(user.notify_discord),
            sent_to_apprise: Boolean(user.notify_apprise),
            sent_to_tautulli: Boolean(user.notify_tautulli),
            sent_to_native_webhook: hasNativeWebhooks,
          },
          trx,
        )
      } else if (contentType === 'season') {
        notificationResult = await deps.db.createNotificationRecord(
          {
            watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
            user_id: !Number.isNaN(userId) ? userId : null,
            type: 'season' as NotificationType,
            title: notificationTitle,
            season_number: seasonNumber,
            sent_to_discord: Boolean(user.notify_discord),
            sent_to_apprise: Boolean(user.notify_apprise),
            sent_to_tautulli: Boolean(user.notify_tautulli),
            sent_to_native_webhook: hasNativeWebhooks,
          },
          trx,
        )
      } else if (
        contentType === 'episode' &&
        mediaInfo.episodes &&
        mediaInfo.episodes.length > 0
      ) {
        const episode = mediaInfo.episodes[0]

        notificationResult = await deps.db.createNotificationRecord(
          {
            watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
            user_id: !Number.isNaN(userId) ? userId : null,
            type: 'episode' as NotificationType,
            title: notificationTitle,
            message: episode.overview,
            season_number: episode.seasonNumber,
            episode_number: episode.episodeNumber,
            sent_to_discord: Boolean(user.notify_discord),
            sent_to_apprise: Boolean(user.notify_apprise),
            sent_to_tautulli: Boolean(user.notify_tautulli),
            sent_to_native_webhook: hasNativeWebhooks,
          },
          trx,
        )
      }

      notificationCreated = notificationResult !== null
    })

    if (notificationCreated) {
      notifications.push({
        user: {
          id: user.id,
          name: user.name,
          apprise: user.apprise,
          alias: user.alias,
          discord_id: user.discord_id,
          notify_apprise: user.notify_apprise,
          notify_discord: user.notify_discord,
          notify_tautulli: user.notify_tautulli,
          tautulli_notifier_id: user.tautulli_notifier_id,
          can_sync: user.can_sync,
        },
        notification,
      })
    }
  }

  // Handle public content notifications
  if (
    deps.config.publicContentNotifications?.enabled &&
    watchlistItems.length > 0
  ) {
    // Reuse notificationTypeInfo computed earlier (line 338)
    if (!notificationTypeInfo)
      return { notifications, watchlistItems, hasNativeWebhooks, enrichment }

    const { contentType, seasonNumber, episodeNumber } = notificationTypeInfo

    const referenceItem = watchlistItems[0]
    const notificationTitle =
      mediaInfo.title || referenceItem?.title || 'Unknown Title'

    const notification: MediaNotification = {
      type: mediaInfo.type,
      title: notificationTitle,
      username: 'Public Content',
      posterUrl: enrichment.posterUrl,
      tmdbUrl: enrichment.tmdbUrl,
      episodeDetails: enrichment.episodeDetails,
    }

    const existingPublicNotification = await deps.db
      .knex('notifications')
      .where({
        user_id: null,
        type: contentType,
        title: notificationTitle,
        watchlist_item_id: null,
        notification_status: 'active',
      })
      .modify((query) => {
        if (seasonNumber !== undefined) {
          query.where('season_number', seasonNumber)
        }
        if (episodeNumber !== undefined) {
          query.where('episode_number', episodeNumber)
        }
      })
      .first()

    if (existingPublicNotification) {
      deps.logger.debug(
        `Skipping public ${contentType} notification for ${mediaInfo.title}${
          seasonNumber !== undefined ? ` S${seasonNumber}` : ''
        }${episodeNumber !== undefined ? `E${episodeNumber}` : ''} - already sent`,
      )
    } else {
      const { hasDiscordUrls, hasAppriseUrls } =
        getPublicContentNotificationFlags(
          deps.config.publicContentNotifications,
        )

      if (contentType === 'movie') {
        await deps.db.createNotificationRecord({
          watchlist_item_id: null,
          user_id: null,
          type: 'movie' as NotificationType,
          title: notificationTitle,
          sent_to_discord: hasDiscordUrls,
          sent_to_apprise: hasAppriseUrls,
          sent_to_tautulli: false,
          sent_to_native_webhook: hasNativeWebhooks,
        })
      } else if (contentType === 'season') {
        await deps.db.createNotificationRecord({
          watchlist_item_id: null,
          user_id: null,
          type: 'season' as NotificationType,
          title: notificationTitle,
          season_number: seasonNumber,
          sent_to_discord: hasDiscordUrls,
          sent_to_apprise: hasAppriseUrls,
          sent_to_tautulli: false,
          sent_to_native_webhook: hasNativeWebhooks,
        })
      } else if (
        contentType === 'episode' &&
        mediaInfo.episodes &&
        mediaInfo.episodes.length > 0
      ) {
        const episode = mediaInfo.episodes[0]
        await deps.db.createNotificationRecord({
          watchlist_item_id: null,
          user_id: null,
          type: 'episode' as NotificationType,
          title: notificationTitle,
          message: episode.overview,
          season_number: episode.seasonNumber,
          episode_number: episode.episodeNumber,
          sent_to_discord: hasDiscordUrls,
          sent_to_apprise: hasAppriseUrls,
          sent_to_tautulli: false,
          sent_to_native_webhook: hasNativeWebhooks,
        })
      }

      notifications.push({
        user: {
          id: -1,
          name: 'Public Content',
          apprise: null,
          alias: null,
          discord_id: null,
          notify_apprise: hasAppriseUrls,
          notify_discord: hasDiscordUrls,
          notify_tautulli: false,
          tautulli_notifier_id: null,
          can_sync: false,
        },
        notification,
      })
    }
  }

  return { notifications, watchlistItems, hasNativeWebhooks, enrichment }
}

// ============================================================================
// Main Orchestration Function
// ============================================================================

/**
 * Sends media available notifications to all relevant users and public channels.
 *
 * This is the main entry point for media availability notifications. It:
 * 1. Looks up all users who watchlisted this content
 * 2. Checks each user's notification preferences
 * 3. Creates notification records in the database
 * 4. Dispatches to all enabled channels (Discord, Apprise, Tautulli)
 * 5. Handles public channel notifications if configured
 *
 * @param deps - Service dependencies (constructed by NotificationService)
 * @param mediaInfo - Information about the available media
 * @param options - Processing options
 * @returns Promise resolving to matched count
 */
export async function sendMediaAvailable(
  deps: MediaAvailableDeps,
  mediaInfo: MediaInfo,
  options: MediaAvailableOptions,
): Promise<{ matchedCount: number }> {
  const {
    notifications: notificationResults,
    watchlistItems: matchingItems,
    hasNativeWebhooks,
    enrichment,
  } = await buildNotificationResults(deps, mediaInfo, options)

  if (notificationResults.length === 0) {
    return { matchedCount: 0 }
  }

  const itemByUserId = new Map<number, TokenWatchlistItem>()
  for (const item of matchingItems) {
    itemByUserId.set(item.user_id, item)
  }

  if (options.sequential) {
    for (const result of notificationResults) {
      await processIndividualNotification(
        deps,
        result,
        notificationResults,
        itemByUserId,
        mediaInfo,
      )
    }
  } else {
    const limit = pLimit(10)
    await Promise.all(
      notificationResults.map((result) =>
        limit(() =>
          processIndividualNotification(
            deps,
            result,
            notificationResults,
            itemByUserId,
            mediaInfo,
          ),
        ),
      ),
    )
  }

  // Dispatch native webhooks if configured (uses shared enrichment data)
  if (hasNativeWebhooks) {
    // Only include episodeDetails if seasonNumber is present (required by schema)
    const episodeDetails =
      enrichment.episodeDetails?.seasonNumber !== undefined
        ? {
            seasonNumber: enrichment.episodeDetails.seasonNumber,
            episodeNumber: enrichment.episodeDetails.episodeNumber,
            title: enrichment.episodeDetails.title,
            overview: enrichment.episodeDetails.overview,
            airDateUtc: enrichment.episodeDetails.airDateUtc,
          }
        : undefined

    try {
      await dispatchWebhooks(
        'media.available',
        {
          mediaType: mediaInfo.type,
          title: mediaInfo.title,
          guids: enrichment.guids,
          posterUrl: enrichment.posterUrl,
          episodeDetails,
          isBulkRelease: options.isBulkRelease,
          instanceType: options.instanceType,
          instanceId: options.instanceId,
          watchlistedBy: notificationResults
            .filter((result) => result.user.id !== -1)
            .map((result) => ({
              userId: result.user.id,
              username: result.user.name,
              alias: result.user.alias ?? undefined,
            })),
        },
        { db: deps.db, log: deps.logger },
      )
    } catch (error) {
      deps.logger.error(
        { error, title: mediaInfo.title, type: mediaInfo.type },
        'Error dispatching native webhooks for media available',
      )
    }
  }

  return { matchedCount: matchingItems.length }
}
