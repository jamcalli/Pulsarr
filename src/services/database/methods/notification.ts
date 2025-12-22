import type { NotificationType } from '@root/types/notification.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { Knex } from 'knex'

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
    sent_to_tautulli?: boolean
    sent_to_native_webhook?: boolean
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
    { channel: 'tautulli', column: 'sent_to_tautulli' },
    { channel: 'native_webhook', column: 'sent_to_native_webhook' },
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
