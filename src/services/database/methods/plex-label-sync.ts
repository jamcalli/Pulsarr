import type { DatabaseService } from '@services/database.service.js'

/**
 * Database row representation for pending_label_syncs table
 */
interface PendingLabelSyncRow {
  id: number
  guid: string
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
  guid: string
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
 * @param guid - The content identifier (e.g., 'tmdb:123456', 'tvdb:789')
 * @param contentTitle - Human-readable title of the content for logging/debugging
 * @param expiresInMinutes - Number of minutes until this sync attempt expires (defaults to 30)
 * @returns The ID of the newly created pending sync record
 */
export async function createPendingLabelSync(
  this: DatabaseService,
  guid: string,
  contentTitle: string,
  expiresInMinutes = 30,
): Promise<number> {
  const expiresAt = new Date(
    Date.now() + expiresInMinutes * 60 * 1000,
  ).toISOString()

  const result = await this.knex('pending_label_syncs')
    .insert({
      guid,
      content_title: contentTitle,
      retry_count: 0,
      last_retry_at: null,
      created_at: this.timestamp,
      expires_at: expiresAt,
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
    guid: row.guid,
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
