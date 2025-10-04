import type { User } from '@root/types/config.types.js'
import type { NotificationType } from '@root/types/notification.types.js'
import type {
  MediaNotification,
  NotificationResult,
  SonarrEpisodeSchema,
} from '@root/types/sonarr.types.js'
import {
  createPublicContentNotification,
  determineNotificationType,
  getPublicContentNotificationFlags,
} from '@root/utils/notification-processor.js'
import type { DatabaseService } from '@services/database.service.js'
import type { Knex } from 'knex'

/**
 * Processes media release notifications for users and public channels, creating notification records and updating watchlist statuses as appropriate.
 *
 * For each relevant watchlist item, determines user notification preferences and media status, updates the watchlist item to "notified," and creates a notification record if needed. Also handles creation of public content notifications if enabled and not previously sent. Associates notifications with specific Sonarr or Radarr instances when provided.
 *
 * @param mediaInfo - Information about the media item, including type, GUID, title, and optional episode details
 * @param isBulkRelease - Indicates if the release is a bulk release (such as a full season)
 * @param instanceId - Optional Sonarr or Radarr instance ID to associate with the notification
 * @param instanceType - Optional instance type ('sonarr' or 'radarr') corresponding to the instance ID
 * @returns An array of notification results containing user and notification details
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
  instanceId?: number,
  instanceType?: 'sonarr' | 'radarr',
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
        requires_approval: Boolean(row.requires_approval),
        is_primary_token: Boolean(row.is_primary_token),
        created_at: row.created_at,
        updated_at: row.updated_at,
      } satisfies User,
    ]),
  )

  // Process individual user notifications
  for (const item of watchlistItems) {
    const user = userMap.get(item.user_id)
    if (!user) continue

    if (!user.notify_discord && !user.notify_apprise && !user.notify_tautulli)
      continue

    const notificationTypeInfo = determineNotificationType(
      mediaInfo,
      isBulkRelease,
    )
    if (!notificationTypeInfo) {
      continue
    }
    const { contentType, seasonNumber, episodeNumber: _ } = notificationTypeInfo

    // Note: Duplicate prevention is now handled by database unique constraint
    // and ON CONFLICT DO NOTHING in createNotificationRecord method

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

    // Update watchlist item status using updateWatchlistItem method
    // This will record status history, prevent regression, and update junction tables
    const updateData: {
      status: 'notified'
      last_notified_at: string
      radarr_instance_id?: number
      sonarr_instance_id?: number
    } = {
      status: 'notified',
      last_notified_at: new Date().toISOString(),
    }

    // Add instance ID to update if provided
    if (instanceId && instanceType === 'radarr') {
      updateData.radarr_instance_id = instanceId
    } else if (instanceId && instanceType === 'sonarr') {
      updateData.sonarr_instance_id = instanceId
    }

    await this.updateWatchlistItem(item.user_id, item.key, updateData)

    // Create notification record atomically
    let notificationCreated = false
    await this.knex.transaction(async (trx) => {
      // Create the notification within the same transaction
      let notificationResult = null
      if (contentType === 'movie') {
        notificationResult = await this.createNotificationRecord(
          {
            watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
            user_id: !Number.isNaN(userId) ? userId : null,
            type: 'movie',
            title: notificationTitle,
            sent_to_discord: Boolean(user.notify_discord),
            sent_to_apprise: Boolean(user.notify_apprise),
            sent_to_webhook: false,
            sent_to_tautulli: Boolean(user.notify_tautulli),
          },
          trx,
        )
      } else if (contentType === 'season') {
        notification.episodeDetails = {
          seasonNumber: seasonNumber,
        }

        notificationResult = await this.createNotificationRecord(
          {
            watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
            user_id: !Number.isNaN(userId) ? userId : null,
            type: 'season',
            title: notificationTitle,
            season_number: seasonNumber,
            sent_to_discord: Boolean(user.notify_discord),
            sent_to_apprise: Boolean(user.notify_apprise),
            sent_to_webhook: false,
            sent_to_tautulli: Boolean(user.notify_tautulli),
          },
          trx,
        )
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

        notificationResult = await this.createNotificationRecord(
          {
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
          },
          trx,
        )
      }

      // Only mark as created if the notification record was successfully inserted
      notificationCreated = notificationResult !== null
    })

    // Only add notification to external processing if database record was created
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

  // Handle public content notifications if enabled and we have users
  if (
    this.config.publicContentNotifications?.enabled &&
    watchlistItems.length > 0
  ) {
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
      this.log.debug(
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
 * Inserts a notification record into the database, preventing duplicates based on unique constraints.
 *
 * If a notification with the same user, watchlist item, type, season, episode, and status already exists, the insertion is ignored.
 *
 * @param notification - The notification details to insert
 * @param trx - Optional database transaction to use for the operation
 * @returns The ID of the created notification, or null if a duplicate prevented insertion
 */
export async function createNotificationRecord(
  this: DatabaseService,
  notification: {
    watchlist_item_id: number | null
    user_id: number | null
    type: NotificationType
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
  trx?: Knex.Transaction,
): Promise<number | null> {
  const insertData = {
    ...notification,
    season_number:
      notification.season_number === undefined
        ? null
        : notification.season_number,
    episode_number:
      notification.episode_number === undefined
        ? null
        : notification.episode_number,
    notification_status: notification.notification_status || 'active',
    sent_to_webhook: notification.sent_to_webhook || false,
    created_at: this.timestamp,
  }

  try {
    const query = trx || this.knex
    const result = await query('notifications')
      .insert(insertData)
      .onConflict([
        'user_id',
        'watchlist_item_id',
        'type',
        'season_number',
        'episode_number',
        'notification_status',
      ])
      .ignore()
      .returning('id')

    // If no rows returned, the insert was ignored due to conflict
    if (!result || result.length === 0) {
      return null
    }

    return this.extractId(result)
  } catch (error) {
    this.log.error({ error }, 'Error creating notification record:')
    throw error
  }
}

/**
 * Retrieves an existing webhook notification for a user, notification type, and content title.
 *
 * @param userId - The user's ID
 * @param type - The notification type
 * @param title - The content title
 * @returns The notification ID if a matching webhook notification exists, otherwise undefined
 */
export async function getExistingWebhookNotification(
  this: DatabaseService,
  userId: number,
  type: NotificationType,
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
 * Resets the status of active notifications to "reset" based on specified filtering criteria.
 *
 * Updates notifications matching the provided options, such as creation date, watchlist item, user, content type, season, or episode.
 *
 * @param options - Criteria for selecting which notifications to reset
 * @returns The number of notifications that were updated
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
 * Gathers notification statistics for the past specified number of days.
 *
 * Returns totals for notifications, counts grouped by notification type, notification channel, and user.
 *
 * @param days - Number of days to include in the statistics (default: 30)
 * @returns An object containing total notification count, counts by type, by channel, and by user
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

  this.log.debug(
    {
      total: stats.total_notifications,
      typeCount: stats.by_type.length,
      channelCount: stats.by_channel.length,
      userCount: stats.by_user.length,
    },
    'Notification statistics gathered',
  )

  return stats
}

/**
 * Record a status transition for a watchlist item if the same status is not already present.
 *
 * Useful for backfilling missing status transitions discovered during sync. This inserts a
 * row into `watchlist_status_history` with the provided ISO timestamp, but will do nothing
 * if an entry with the same watchlist_item_id and status already exists.
 *
 * @param watchlistItemId - ID of the watchlist item to update
 * @param status - One of 'pending', 'requested', 'grabbed', or 'notified'
 * @param timestamp - ISO 8601 timestamp when the status change occurred
 * @throws When the database operation fails (original error is rethrown)
 */
export async function addStatusHistoryEntry(
  this: DatabaseService,
  watchlistItemId: number,
  status: 'pending' | 'requested' | 'grabbed' | 'notified',
  timestamp: string,
): Promise<void> {
  try {
    // Check if this status entry already exists to avoid duplicates
    const existing = await this.knex('watchlist_status_history')
      .where({
        watchlist_item_id: watchlistItemId,
        status: status,
      })
      .first()

    if (existing) {
      this.log.debug(
        `Status '${status}' already exists for watchlist item ${watchlistItemId}, skipping`,
      )
      return
    }

    await this.knex('watchlist_status_history').insert({
      watchlist_item_id: watchlistItemId,
      status: status,
      timestamp: timestamp,
    })

    this.log.debug(
      `Added status history entry: watchlist_item_id=${watchlistItemId}, status='${status}', timestamp='${timestamp}'`,
    )
  } catch (error) {
    this.log.error(
      { error },
      `Error adding status history entry for watchlist item ${watchlistItemId}`,
    )
    throw error
  }
}
