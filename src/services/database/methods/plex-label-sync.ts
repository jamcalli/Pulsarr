import type { DatabaseService } from '@services/database.service.js'

/**
 * Database row representation for pending_label_syncs table
 */
interface PendingLabelSyncRow {
  id: number
  watchlist_item_id: number
  content_title: string
  retry_count: number
  last_retry_at: string | null
  created_at: string
  expires_at: string
}

/**
 * Pending label sync record
 */
export interface PendingLabelSync {
  id: number
  watchlist_item_id: number
  content_title: string
  retry_count: number
  last_retry_at: string | null
  created_at: string
  expires_at: string
}

/**
 * Creates a new pending label sync record for content that needs label synchronization.
 *
 * Inserts a record to track content that should have labels applied but couldn't be processed
 * immediately, typically because the content hasn't been indexed by Plex yet.
 *
 * @param watchlistItemId - The watchlist item ID that contains the Plex key
 * @param contentTitle - Human-readable title of the content for logging/debugging
 * @param expiresInMinutes - Number of minutes until this sync attempt expires (defaults to 30)
 * @returns The ID of the newly created pending sync record
 */
export async function createPendingLabelSync(
  this: DatabaseService,
  watchlistItemId: number,
  contentTitle: string,
  expiresInMinutes = 30,
): Promise<number> {
  const expiresAt = new Date(
    Date.now() + expiresInMinutes * 60 * 1000,
  ).toISOString()

  const result = await this.knex('pending_label_syncs')
    .insert({
      watchlist_item_id: watchlistItemId,
      content_title: contentTitle,
      retry_count: 0,
      last_retry_at: null,
      created_at: this.timestamp,
      expires_at: expiresAt,
    })
    .onConflict('watchlist_item_id')
    .merge({
      content_title: contentTitle,
      retry_count: 0,
      last_retry_at: null,
      expires_at: expiresAt,
      created_at: this.timestamp,
    })
    .returning('id')

  return this.extractId(result)
}

/**
 * Retrieves all pending label sync records that haven't expired yet.
 *
 * Returns pending syncs that are still within their expiration window and can be retried.
 * Results are ordered by creation time (oldest first) to process items in FIFO order.
 *
 * @returns An array of pending label sync records that haven't expired
 */
export async function getPendingLabelSyncs(
  this: DatabaseService,
): Promise<PendingLabelSync[]> {
  const now = new Date().toISOString()

  const rows = (await this.knex('pending_label_syncs')
    .where('expires_at', '>', now)
    .orderBy('created_at', 'asc')
    .select('*')) as PendingLabelSyncRow[]

  return rows.map((row) => ({
    id: row.id,
    watchlist_item_id: row.watchlist_item_id,
    content_title: row.content_title,
    retry_count: row.retry_count,
    last_retry_at: row.last_retry_at,
    created_at: row.created_at,
    expires_at: row.expires_at,
  }))
}

/**
 * Updates the retry count and timestamp for a pending label sync after a failed attempt.
 *
 * Increments the retry count and sets the last retry timestamp to track retry attempts.
 * This helps with debugging and prevents infinite retry loops.
 *
 * @param id - The ID of the pending sync record to update
 * @returns True if a record was updated, false if the record wasn't found
 */
export async function updatePendingLabelSyncRetry(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const updated = await this.knex('pending_label_syncs')
    .where('id', id)
    .update({
      retry_count: this.knex.raw('retry_count + 1'),
      last_retry_at: this.timestamp,
    })

  return updated > 0
}

/**
 * Removes a pending label sync record after successful processing.
 *
 * Deletes the pending sync record when label synchronization has been completed successfully.
 *
 * @param id - The ID of the pending sync record to delete
 * @returns True if a record was deleted, false if the record wasn't found
 */
export async function deletePendingLabelSync(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deleted = await this.knex('pending_label_syncs')
    .where('id', id)
    .delete()

  return deleted > 0
}

/**
 * Removes expired pending label sync records from the database.
 *
 * Cleans up pending sync records that have exceeded their expiration time and should
 * no longer be retried. This prevents the table from growing indefinitely with stale records.
 *
 * @returns The number of expired records that were deleted
 */
export async function expirePendingLabelSyncs(
  this: DatabaseService,
): Promise<number> {
  const now = new Date().toISOString()

  const deleted = await this.knex('pending_label_syncs')
    .where('expires_at', '<=', now)
    .delete()

  if (deleted > 0) {
    this.log.debug(`Expired ${deleted} pending label sync records`)
  }

  return deleted
}

/**
 * Gets watchlist item with Plex key for direct metadata access.
 *
 * Retrieves the watchlist item including the Plex key that can be used for direct
 * metadata access, eliminating the need for GUID-based searching.
 *
 * @param watchlistItemId - The watchlist item ID
 * @returns The watchlist item with Plex key or null if not found
 */
export async function getWatchlistItemWithPlexKey(
  this: DatabaseService,
  watchlistItemId: number,
): Promise<{
  id: number
  user_id: number
  title: string
  plex_key: string | null
  guids: string[]
} | null> {
  const row = await this.knex('watchlist_items')
    .where('id', watchlistItemId)
    .select('id', 'user_id', 'title', 'key as plex_key', 'guids')
    .first()

  if (!row) {
    return null
  }

  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    plex_key: row.plex_key,
    guids: Array.isArray(row.guids) ? row.guids : [],
  }
}

/**
 * Gets all pending label syncs with their associated watchlist items and GUID parts.
 *
 * Returns pending syncs joined with watchlist items to provide access to
 * GUID parts and content type for proper GUID construction and resolution.
 *
 * @returns Array of pending syncs with watchlist item data
 */
export async function getPendingLabelSyncsWithPlexKeys(
  this: DatabaseService,
): Promise<
  Array<{
    id: number
    watchlist_item_id: number
    content_title: string
    retry_count: number
    last_retry_at: string | null
    created_at: string
    expires_at: string
    plex_key: string | null
    user_id: number
    guids: string[]
    type: string
  }>
> {
  const now = new Date().toISOString()

  const rows = await this.knex('pending_label_syncs')
    .join(
      'watchlist_items',
      'pending_label_syncs.watchlist_item_id',
      'watchlist_items.id',
    )
    .where('pending_label_syncs.expires_at', '>', now)
    .orderBy('pending_label_syncs.created_at', 'asc')
    .select(
      'pending_label_syncs.*',
      'watchlist_items.key as plex_key',
      'watchlist_items.user_id',
      'watchlist_items.guids',
      'watchlist_items.type',
    )

  return rows.map((row) => ({
    id: row.id,
    watchlist_item_id: row.watchlist_item_id,
    content_title: row.content_title,
    retry_count: row.retry_count,
    last_retry_at: row.last_retry_at,
    created_at: row.created_at,
    expires_at: row.expires_at,
    plex_key: row.plex_key,
    user_id: row.user_id,
    guids: Array.isArray(row.guids) ? row.guids : [],
    type: row.type,
  }))
}
