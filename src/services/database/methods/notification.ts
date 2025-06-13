import type { DatabaseService } from '@services/database.service.js'
import type {
  SonarrEpisodeSchema,
  MediaNotification,
  NotificationResult,
} from '@root/types/sonarr.types.js'
import type {
  PendingWebhook,
  PendingWebhookCreate,
} from '@root/types/pending-webhooks.types.js'
import type { User } from '@root/types/config.types.js'
import {
  determineNotificationType,
  getPublicContentNotificationFlags,
  createPublicContentNotification,
} from '@root/utils/notification-processor.js'

/**
 * Processes notifications for media items
 *
 * @param mediaInfo - Information about the media item
 * @param isBulkRelease - Whether this is a bulk release (e.g., full season)
 * @param byGuid - Whether to process by GUID for public content
 * @returns Promise resolving to array of notification results
 */
export async function processNotifications(
  this: DatabaseService,
  mediaInfo: {
    type: 'movie' | 'show'
    guid: string
    title: string
    episodes?: SonarrEpisodeSchema[]
  },
  isBulkRelease: boolean,
  byGuid = false,
): Promise<NotificationResult[]> {
  const watchlistItems = await this.getWatchlistItemsByGuid(mediaInfo.guid)
  const notifications: NotificationResult[] = []

  // Fetch all users in a single query to avoid N+1 queries
  const userIds = [...new Set(watchlistItems.map((item) => item.user_id))]
  const userRows = await this.knex('users').whereIn('id', userIds)

  // Create a map of user ID to formatted User object
  const userMap = new Map(
    userRows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        apprise: row.apprise,
        alias: row.alias,
        discord_id: row.discord_id,
        notify_apprise: Boolean(row.notify_apprise),
        notify_discord: Boolean(row.notify_discord),
        notify_tautulli: Boolean(row.notify_tautulli),
        tautulli_notifier_id: row.tautulli_notifier_id,
        can_sync: Boolean(row.can_sync),
        is_primary_token: Boolean(row.is_primary_token),
        created_at: row.created_at,
        updated_at: row.updated_at,
      } satisfies User,
    ]),
  )

  for (const item of watchlistItems) {
    const user = userMap.get(item.user_id)
    if (!user) continue

    if (
      !byGuid &&
      !user.notify_discord &&
      !user.notify_apprise &&
      !user.notify_tautulli
    )
      continue

    if (
      item.type === 'show' &&
      item.series_status === 'ended' &&
      item.last_notified_at &&
      !isBulkRelease
    ) {
      continue
    }

    const notificationTypeInfo = determineNotificationType(
      mediaInfo,
      isBulkRelease,
    )
    if (!notificationTypeInfo) {
      continue
    }
    const { contentType, seasonNumber, episodeNumber } = notificationTypeInfo

    const existingNotification = await this.knex('notifications')
      .where({
        user_id: user.id,
        type: contentType,
        watchlist_item_id: item.id,
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

    if (existingNotification) {
      this.log.info(
        `Skipping ${contentType} notification for ${mediaInfo.title}${
          seasonNumber !== undefined ? ` S${seasonNumber}` : ''
        }${
          episodeNumber !== undefined ? `E${episodeNumber}` : ''
        } - already sent previously to user ${user.name}`,
      )
      continue
    }

    // Update watchlist item status and record history atomically
    await this.knex.transaction(async (trx) => {
      await trx('watchlist_items').where('id', item.id).update({
        last_notified_at: new Date().toISOString(),
        status: 'notified',
      })

      await trx('watchlist_status_history').insert({
        watchlist_item_id: item.id,
        status: 'notified',
        timestamp: new Date().toISOString(),
      })
    })

    const notificationTitle = mediaInfo.title || item.title
    const notification: MediaNotification = {
      type: mediaInfo.type,
      title: notificationTitle,
      username: user.name,
      posterUrl: item.thumb || undefined,
    }

    const userId =
      typeof item.user_id === 'object'
        ? (item.user_id as { id: number }).id
        : Number(item.user_id)

    const itemId =
      typeof item.id === 'string' ? Number.parseInt(item.id, 10) : item.id

    if (contentType === 'movie') {
      await this.createNotificationRecord({
        watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
        user_id: !Number.isNaN(userId) ? userId : null,
        type: 'movie',
        title: notificationTitle,
        sent_to_discord: Boolean(user.notify_discord),
        sent_to_apprise: Boolean(user.notify_apprise),
        sent_to_webhook: false,
        sent_to_tautulli: Boolean(user.notify_tautulli),
      })
    } else if (contentType === 'season') {
      notification.episodeDetails = {
        seasonNumber: seasonNumber,
      }

      await this.createNotificationRecord({
        watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
        user_id: !Number.isNaN(userId) ? userId : null,
        type: 'season',
        title: notificationTitle,
        season_number: seasonNumber,
        sent_to_discord: Boolean(user.notify_discord),
        sent_to_apprise: Boolean(user.notify_apprise),
        sent_to_webhook: false,
        sent_to_tautulli: Boolean(user.notify_tautulli),
      })
    } else if (
      contentType === 'episode' &&
      mediaInfo.episodes &&
      mediaInfo.episodes.length > 0
    ) {
      const episode = mediaInfo.episodes[0]

      notification.episodeDetails = {
        title: episode.title,
        ...(episode.overview && { overview: episode.overview }),
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        airDateUtc: episode.airDateUtc,
      }

      await this.createNotificationRecord({
        watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
        user_id: !Number.isNaN(userId) ? userId : null,
        type: 'episode',
        title: notificationTitle,
        message: episode.overview,
        season_number: episode.seasonNumber,
        episode_number: episode.episodeNumber,
        sent_to_discord: Boolean(user.notify_discord),
        sent_to_apprise: Boolean(user.notify_apprise),
        sent_to_webhook: false,
        sent_to_tautulli: Boolean(user.notify_tautulli),
      })
    }

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

  if (byGuid) {
    const notificationTypeInfo = determineNotificationType(
      mediaInfo,
      isBulkRelease,
    )
    if (!notificationTypeInfo) {
      return notifications
    }
    const { contentType, seasonNumber, episodeNumber } = notificationTypeInfo

    const referenceItem = watchlistItems.length > 0 ? watchlistItems[0] : null
    const notificationTitle =
      mediaInfo.title || referenceItem?.title || 'Unknown Title'

    const notification: MediaNotification = {
      type: mediaInfo.type,
      title: notificationTitle,
      username: 'Public Content',
      posterUrl: referenceItem?.thumb || undefined,
    }

    if (contentType === 'season' && seasonNumber !== undefined) {
      notification.episodeDetails = {
        seasonNumber: seasonNumber,
      }
    } else if (
      contentType === 'episode' &&
      mediaInfo.episodes &&
      mediaInfo.episodes.length > 0
    ) {
      const episode = mediaInfo.episodes[0]
      notification.episodeDetails = {
        title: episode.title,
        ...(episode.overview && { overview: episode.overview }),
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        airDateUtc: episode.airDateUtc,
      }
    }

    const existingPublicNotification = await this.knex('notifications')
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
      this.log.info(
        `Skipping public ${contentType} notification for ${mediaInfo.title}${
          seasonNumber !== undefined ? ` S${seasonNumber}` : ''
        }${
          episodeNumber !== undefined ? `E${episodeNumber}` : ''
        } - already sent previously`,
      )
    } else {
      const { hasDiscordUrls, hasAppriseUrls } =
        getPublicContentNotificationFlags(
          this.config.publicContentNotifications,
        )

      if (contentType === 'movie') {
        await this.createNotificationRecord({
          watchlist_item_id: null,
          user_id: null,
          type: 'movie',
          title: notificationTitle,
          sent_to_discord: hasDiscordUrls,
          sent_to_apprise: hasAppriseUrls,
          sent_to_webhook: false,
          sent_to_tautulli: false,
        })
      } else if (contentType === 'season') {
        await this.createNotificationRecord({
          watchlist_item_id: null,
          user_id: null,
          type: 'season',
          title: notificationTitle,
          season_number: seasonNumber,
          sent_to_discord: hasDiscordUrls,
          sent_to_apprise: hasAppriseUrls,
          sent_to_webhook: false,
          sent_to_tautulli: false,
        })
      } else if (
        contentType === 'episode' &&
        mediaInfo.episodes &&
        mediaInfo.episodes.length > 0
      ) {
        const episode = mediaInfo.episodes[0]
        await this.createNotificationRecord({
          watchlist_item_id: null,
          user_id: null,
          type: 'episode',
          title: notificationTitle,
          message: episode.overview,
          season_number: episode.seasonNumber,
          episode_number: episode.episodeNumber,
          sent_to_discord: hasDiscordUrls,
          sent_to_apprise: hasAppriseUrls,
          sent_to_webhook: false,
          sent_to_tautulli: false,
        })
      }

      const publicContentUser = createPublicContentNotification(
        notification,
        hasDiscordUrls,
        hasAppriseUrls,
      )

      notifications.push(publicContentUser)
    }
  }

  return notifications
}

/**
 * Creates a notification record in the database
 *
 * @param notification - Notification data to create
 * @returns Promise resolving to the ID of the created notification
 */
export async function createNotificationRecord(
  this: DatabaseService,
  notification: {
    watchlist_item_id: number | null
    user_id: number | null
    type: 'episode' | 'season' | 'movie' | 'watchlist_add'
    title: string
    message?: string
    season_number?: number
    episode_number?: number
    sent_to_discord: boolean
    sent_to_apprise: boolean
    sent_to_webhook?: boolean
    sent_to_tautulli?: boolean
    notification_status?: string
  },
): Promise<number> {
  const [id] = await this.knex('notifications')
    .insert({
      ...notification,
      season_number: notification.season_number || null,
      episode_number: notification.episode_number || null,
      notification_status: notification.notification_status || 'active',
      sent_to_webhook: notification.sent_to_webhook || false,
      created_at: this.timestamp,
    })
    .returning('id')

  return id
}

/**
 * Checks if a webhook notification exists for a particular item and user
 *
 * @param userId - ID of the user who would receive the notification
 * @param type - Type of notification to check for
 * @param title - Title of the content item
 * @returns Promise resolving to the notification if found, undefined otherwise
 */
export async function getExistingWebhookNotification(
  this: DatabaseService,
  userId: number,
  type: string,
  title: string,
): Promise<{ id: number } | undefined> {
  return await this.knex('notifications')
    .where({
      user_id: userId,
      type,
      title,
      sent_to_webhook: true,
    })
    .select('id')
    .first()
}

/**
 * Resets notification status for content items
 *
 * @param options - Options for filtering which notifications to reset
 * @returns Promise resolving to the number of notifications reset
 */
export async function resetContentNotifications(
  this: DatabaseService,
  options: {
    olderThan?: Date
    watchlistItemId?: number
    userId?: number
    contentType?: string
    seasonNumber?: number
    episodeNumber?: number
  },
): Promise<number> {
  const query = this.knex('notifications')
    .where('notification_status', 'active')
    .update({
      notification_status: 'reset',
      updated_at: this.timestamp,
    })

  if (options.olderThan) {
    query.where('created_at', '<', options.olderThan.toISOString())
  }

  if (options.watchlistItemId) {
    query.where('watchlist_item_id', options.watchlistItemId)
  }

  if (options.userId) {
    query.where('user_id', options.userId)
  }

  if (options.contentType) {
    query.where('type', options.contentType)
  }

  if (options.seasonNumber !== undefined) {
    query.where('season_number', options.seasonNumber)
  }

  if (options.episodeNumber !== undefined) {
    query.where('episode_number', options.episodeNumber)
  }

  const count = await query
  this.log.info(`Reset ${count} notifications`)
  return count
}

/**
 * Retrieves comprehensive notification statistics
 *
 * @param days - Number of days to look back (default: 30)
 * @returns Promise resolving to object with notification statistics
 */
export async function getNotificationStats(
  this: DatabaseService,
  days = 30,
): Promise<{
  total_notifications: number
  by_type: { type: string; count: number }[]
  by_channel: { channel: string; count: number }[]
  by_user: { user_name: string; count: number }[]
}> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const cutoffDateStr = cutoffDate.toISOString()

  this.log.debug(
    `Gathering notification statistics for past ${days} days (since ${cutoffDateStr})`,
  )

  const totalQuery = this.knex('notifications')
    .where('created_at', '>=', cutoffDateStr)
    .count('* as count')
    .first()

  const byTypeQuery = this.knex('notifications')
    .where('created_at', '>=', cutoffDateStr)
    .select('type')
    .count('* as count')
    .groupBy('type')
    .orderBy('count', 'desc')

  const channelQueries = [
    { channel: 'discord', column: 'sent_to_discord' },
    { channel: 'apprise', column: 'sent_to_apprise' },
    { channel: 'webhook', column: 'sent_to_webhook' },
    { channel: 'tautulli', column: 'sent_to_tautulli' },
  ]

  const byChannelQuery = Promise.all(
    channelQueries.map(async ({ channel, column }) => {
      const result = await this.knex('notifications')
        .count('* as count')
        .where('created_at', '>=', cutoffDateStr)
        .where(column, true)
        .first()

      return {
        channel,
        count: Number(result?.count || 0),
      }
    }),
  )

  const byUserQuery = this.knex('notifications')
    .join('users', 'notifications.user_id', '=', 'users.id')
    .where('notifications.created_at', '>=', cutoffDateStr)
    .select('users.name as user_name')
    .count('notifications.id as count')
    .groupBy('users.id')
    .orderBy('count', 'desc')

  const [total, byType, byChannel, byUser] = await Promise.all([
    totalQuery,
    byTypeQuery,
    byChannelQuery,
    byUserQuery,
  ])

  const stats = {
    total_notifications: Number(total?.count || 0),
    by_type: byType.map((row) => ({
      type: String(row.type),
      count: Number(row.count),
    })),
    by_channel: byChannel.map((row: { channel: string; count: number }) => ({
      channel: String(row.channel),
      count: Number(row.count),
    })),
    by_user: byUser.map((row) => ({
      user_name: String(row.user_name),
      count: Number(row.count),
    })),
  }

  this.log.debug('Notification statistics gathered:', {
    total: stats.total_notifications,
    typeCount: stats.by_type.length,
    channelCount: stats.by_channel.length,
    userCount: stats.by_user.length,
  })

  return stats
}

/**
 * Creates a pending webhook notification
 *
 * @param webhook - Pending webhook data to create
 * @returns Promise resolving to the created webhook object
 */
export async function createPendingWebhook(
  this: DatabaseService,
  webhook: PendingWebhookCreate,
): Promise<PendingWebhook> {
  const result = await this.knex('pending_webhooks')
    .insert({
      ...webhook,
      received_at: this.timestamp,
      expires_at: webhook.expires_at.toISOString(),
      payload: JSON.stringify(webhook.payload),
    })
    .returning('id')

  const id =
    typeof result[0] === 'object' && result[0] !== null
      ? result[0].id
      : result[0]

  return {
    id,
    ...webhook,
    received_at: new Date(this.timestamp),
    expires_at: webhook.expires_at,
  }
}

/**
 * Retrieves pending webhook notifications
 *
 * @param limit - Maximum number of webhooks to retrieve
 * @returns Promise resolving to array of pending webhooks
 */
export async function getPendingWebhooks(
  this: DatabaseService,
  limit = 50,
): Promise<PendingWebhook[]> {
  const webhooks = await this.knex('pending_webhooks')
    .where('expires_at', '>', new Date().toISOString())
    .orderBy('received_at', 'asc')
    .limit(limit)

  return webhooks.map((webhook) => ({
    ...webhook,
    payload: this.safeJsonParse(webhook.payload, {}, 'pending_webhook.payload'),
    received_at: new Date(webhook.received_at),
    expires_at: new Date(webhook.expires_at),
  }))
}

/**
 * Deletes a pending webhook notification
 *
 * @param id - ID of the webhook to delete
 * @returns Promise resolving to true if deleted, false otherwise
 */
export async function deletePendingWebhook(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deleted = await this.knex('pending_webhooks').where({ id }).delete()
  return deleted > 0
}

/**
 * Cleans up expired pending webhook notifications
 *
 * @returns Promise resolving to number of webhooks cleaned up
 */
export async function cleanupExpiredWebhooks(
  this: DatabaseService,
): Promise<number> {
  const deleted = await this.knex('pending_webhooks')
    .where('expires_at', '<', new Date().toISOString())
    .delete()

  return deleted
}

/**
 * Retrieves pending webhooks by GUID and media type
 *
 * @param guid - GUID to search for
 * @param mediaType - Type of media ('movie' or 'show')
 * @returns Promise resolving to array of matching webhooks
 */
export async function getWebhooksByGuid(
  this: DatabaseService,
  guid: string,
  mediaType: 'movie' | 'show',
): Promise<PendingWebhook[]> {
  const webhooks = await this.knex('pending_webhooks')
    .where({ guid, media_type: mediaType })
    .where('expires_at', '>', new Date().toISOString())

  return webhooks.map((webhook) => ({
    ...webhook,
    payload: this.safeJsonParse(webhook.payload, {}, 'pending_webhook.payload'),
    received_at: new Date(webhook.received_at),
    expires_at: new Date(webhook.expires_at),
  }))
}
