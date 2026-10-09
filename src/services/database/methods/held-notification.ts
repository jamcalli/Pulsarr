import type {
  HeldEpisode,
  HeldNotification,
  HeldNotificationCreate,
} from '@root/types/notification-delivery.types.js'
import type { DatabaseService } from '@services/database.service.js'

interface HeldNotificationRow {
  id: number
  user_id: number
  media_type: 'movie' | 'show'
  guid: string
  title: string
  watchlist_item_key: string | null
  is_bulk_release: boolean | number
  episodes: string | HeldEpisode[]
  notification: string | HeldNotification['notification']
  reason: HeldNotification['reason']
  deliver_after: string | Date
  claimed_at: string | Date | null
  created_at: string | Date
}

// SQLite hands back JSON columns as strings, PostgreSQL as parsed values
function parseJsonColumn<T>(
  db: DatabaseService,
  value: string | T,
  fallback: T,
  context: string,
): T {
  return typeof value === 'string'
    ? db.safeJsonParse<T>(value, fallback, context)
    : (value ?? fallback)
}

function mapRow(
  db: DatabaseService,
  row: HeldNotificationRow,
): HeldNotification {
  return {
    id: row.id,
    user_id: row.user_id,
    media_type: row.media_type,
    guid: row.guid,
    title: row.title,
    watchlist_item_key: row.watchlist_item_key,
    is_bulk_release: Boolean(row.is_bulk_release),
    episodes: parseJsonColumn<HeldEpisode[]>(
      db,
      row.episodes,
      [],
      'held_notification.episodes',
    ),
    notification: parseJsonColumn(
      db,
      row.notification,
      { type: row.media_type, title: row.title, username: '' },
      'held_notification.notification',
    ),
    reason: row.reason,
    deliver_after: new Date(row.deliver_after),
    claimed_at: row.claimed_at ? new Date(row.claimed_at) : null,
    created_at: new Date(row.created_at),
  }
}

/**
 * Persists a notification held for quiet hours or digest batching.
 *
 * @param data - The held notification, including when it becomes due
 * @returns The new row ID
 */
export async function createHeldNotification(
  this: DatabaseService,
  data: HeldNotificationCreate,
): Promise<number> {
  const result = await this.knex('held_notifications')
    .insert({
      user_id: data.user_id,
      media_type: data.media_type,
      guid: data.guid,
      title: data.title,
      watchlist_item_key: data.watchlist_item_key,
      is_bulk_release: data.is_bulk_release,
      episodes: JSON.stringify(data.episodes),
      notification: JSON.stringify(data.notification),
      reason: data.reason,
      deliver_after: data.deliver_after.toISOString(),
      created_at: this.timestamp,
    })
    .returning('id')

  return this.extractId(result)
}

/**
 * Returns the IDs of users with at least one unclaimed held notification due
 * at or before `now`.
 *
 * @param now - The current time
 * @returns Distinct user IDs, ascending
 */
export async function getUserIdsWithDueHeldNotifications(
  this: DatabaseService,
  now: Date,
): Promise<number[]> {
  const rows = await this.knex('held_notifications')
    .distinct('user_id')
    .whereNull('claimed_at')
    .where('deliver_after', '<=', now.toISOString())
    .orderBy('user_id', 'asc')

  return rows.map((row: { user_id: number }) => Number(row.user_id))
}

/**
 * Returns the IDs of users with at least one unclaimed held notification,
 * due or not.
 *
 * @returns Distinct user IDs, ascending
 */
export async function getUserIdsWithHeldNotifications(
  this: DatabaseService,
): Promise<number[]> {
  const rows = await this.knex('held_notifications')
    .distinct('user_id')
    .whereNull('claimed_at')
    .orderBy('user_id', 'asc')

  return rows.map((row: { user_id: number }) => Number(row.user_id))
}

/**
 * Claims every unclaimed held notification of a user for delivery.
 *
 * The claim update only touches rows that are still unclaimed, so a row is
 * handed to exactly one caller even if two flushes race.
 *
 * @param userId - The user whose held notifications to claim
 * @param claimedAt - Claim timestamp
 * @returns The claimed rows
 */
export async function claimHeldNotifications(
  this: DatabaseService,
  userId: number,
  claimedAt: Date,
): Promise<HeldNotification[]> {
  const claimedAtIso = claimedAt.toISOString()

  return this.knex.transaction(async (trx) => {
    const candidates = await trx('held_notifications')
      .select('id')
      .where({ user_id: userId })
      .whereNull('claimed_at')

    const ids = candidates.map((row: { id: number }) => row.id)
    if (ids.length === 0) return []

    await trx('held_notifications')
      .whereIn('id', ids)
      .whereNull('claimed_at')
      .update({ claimed_at: claimedAtIso })

    const rows = await trx('held_notifications')
      .whereIn('id', ids)
      .where('claimed_at', claimedAtIso)
      .orderBy('id', 'asc')

    return rows.map((row: HeldNotificationRow) => mapRow(this, row))
  })
}

/**
 * Deletes held notifications after delivery.
 *
 * @param ids - Row IDs to delete
 * @returns Number of rows deleted
 */
export async function deleteHeldNotifications(
  this: DatabaseService,
  ids: number[],
): Promise<number> {
  if (ids.length === 0) return 0
  return this.knex('held_notifications').whereIn('id', ids).delete()
}

/**
 * Deletes rows claimed by a delivery that never finished (the process
 * stopped mid-delivery). Their send may already have gone out, so they are
 * dropped rather than retried to rule out a duplicate.
 *
 * @returns Number of rows deleted
 */
export async function deleteInterruptedHeldNotifications(
  this: DatabaseService,
): Promise<number> {
  return this.knex('held_notifications').whereNotNull('claimed_at').delete()
}

/**
 * Counts held notifications that are waiting for delivery.
 *
 * @param userId - Optionally restrict the count to one user
 * @returns Number of unclaimed held notifications
 */
export async function countHeldNotifications(
  this: DatabaseService,
  userId?: number,
): Promise<number> {
  const result = await this.knex('held_notifications')
    .whereNull('claimed_at')
    .modify((qb) => {
      if (userId !== undefined) qb.where({ user_id: userId })
    })
    .count('* as count')
    .first()

  return Number(result?.count ?? 0)
}
