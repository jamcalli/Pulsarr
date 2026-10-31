import type { NotificationType } from '@root/types/notification.types.js'
import { orderAsText } from '@services/database/ordering.js'
import type { DatabaseService } from '@services/database.service.js'
import type { Knex } from 'knex'

/** Returns null when an active episode, season or movie claim with the same key already exists. */
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
    sent_to_plex_mobile?: boolean
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
      .onConflict()
      .ignore()
      .returning('id')

    if (!result || result.length === 0) {
      return null
    }

    return this.extractId(result)
  } catch (error) {
    this.log.error({ error }, 'Error creating notification record:')
    throw error
  }
}

export async function updateNotificationDelivery(
  this: DatabaseService,
  id: number,
  delivery: {
    sent_to_discord: boolean
    sent_to_apprise: boolean
    sent_to_plex_mobile: boolean
    sent_to_native_webhook: boolean
  },
): Promise<void> {
  await this.knex('notifications').where({ id }).update(delivery)
}

export async function deleteNotificationRecord(
  this: DatabaseService,
  id: number,
): Promise<void> {
  await this.knex('notifications').where({ id }).delete()
}

/** An option left undefined is not filtered, and null matches a null column. */
export async function hasActiveNotification(
  this: DatabaseService,
  options: {
    userId?: number | null
    watchlistItemId?: number | null
    type: string
    title?: string
    seasonNumber?: number
    episodeNumber?: number
  },
): Promise<boolean> {
  const row = await this.knex('notifications')
    .where('notification_status', 'active')
    .where('type', options.type)
    .modify((q) => {
      if (options.userId !== undefined) {
        if (options.userId === null) {
          q.whereNull('user_id')
        } else {
          q.where('user_id', options.userId)
        }
      }
      if (options.watchlistItemId !== undefined) {
        if (options.watchlistItemId === null) {
          q.whereNull('watchlist_item_id')
        } else {
          q.where('watchlist_item_id', options.watchlistItemId)
        }
      }
      if (options.title !== undefined) {
        q.where('title', options.title)
      }
      if (options.seasonNumber !== undefined) {
        q.where('season_number', options.seasonNumber)
      }
      if (options.episodeNumber !== undefined) {
        q.where('episode_number', options.episodeNumber)
      }
    })
    .first()

  return row !== undefined
}

export async function getNotificationStats(
  this: DatabaseService,
  days = 30,
): Promise<{
  total_notifications: number
  by_type: { type: string; count: number }[]
  by_channel: { channel: string; count: number }[]
  by_user: { user_name: string; count: number }[]
}> {
  const isAllTime = days === 0

  this.log.debug(
    `Gathering notification statistics ${isAllTime ? '(all time)' : `for past ${days} days`}`,
  )

  let cutoffDateStr: string | undefined
  if (!isAllTime) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    cutoffDateStr = cutoffDate.toISOString()
  }

  let totalQuery = this.knex('notifications')
  if (!isAllTime && cutoffDateStr) {
    totalQuery = totalQuery.where('created_at', '>=', cutoffDateStr)
  }
  const totalResult = totalQuery.count('* as count').first()

  let byTypeQuery = this.knex('notifications')
  if (!isAllTime && cutoffDateStr) {
    byTypeQuery = byTypeQuery.where('created_at', '>=', cutoffDateStr)
  }
  const byTypeResult = orderAsText(
    byTypeQuery
      .select('type')
      .count('* as count')
      .groupBy('type')
      .orderBy('count', 'desc'),
    'type',
  )

  const channelQueries = [
    { channel: 'discord', column: 'sent_to_discord' },
    { channel: 'apprise', column: 'sent_to_apprise' },
    { channel: 'plex_mobile', column: 'sent_to_plex_mobile' },
    { channel: 'native_webhook', column: 'sent_to_native_webhook' },
  ]

  const byChannelQuery = Promise.all(
    channelQueries.map(async ({ channel, column }) => {
      let query = this.knex('notifications').count('* as count')
      if (!isAllTime && cutoffDateStr) {
        query = query.where('created_at', '>=', cutoffDateStr)
      }
      const result = await query.where(column, true).first()

      return {
        channel,
        count: Number(result?.count || 0),
      }
    }),
  )

  let byUserQuery = this.knex('notifications').join(
    'users',
    'notifications.user_id',
    '=',
    'users.id',
  )
  if (!isAllTime && cutoffDateStr) {
    byUserQuery = byUserQuery.where(
      'notifications.created_at',
      '>=',
      cutoffDateStr,
    )
  }
  const byUserResult = byUserQuery
    .select('users.name as user_name')
    .count('notifications.id as count')
    .groupBy('users.id')
    .orderBy('count', 'desc')
    .orderBy('users.name')
    .orderBy('users.id')

  const [total, byType, byChannel, byUser] = await Promise.all([
    totalResult,
    byTypeResult,
    byChannelQuery,
    byUserResult,
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
