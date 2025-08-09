import type { DatabaseService } from '@services/database.service.js'

/**
 * Database row representation for pending_label_syncs table
 */
interface PendingLabelSyncRow {
  id: number
  watchlist_item_id: number
  content_title: string
  webhook_tags: string
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
  webhook_tags: string[]
  retry_count: number
  last_retry_at: string | null
  created_at: string
  expires_at: string
}

/**
 * Pending label sync record with additional watchlist item data for processing
 */
export interface PendingLabelSyncWithPlexKeys {
  id: number
  watchlist_item_id: number
  content_title: string
  webhook_tags: string[]
  retry_count: number
  last_retry_at: string | null
  created_at: string
  expires_at: string
  plex_key: string | null
  user_id: number
  guids: string[]
  type: string
}

/**
 * Creates or updates a pending label sync record for a watchlist item, resetting retry state and updating expiration.
 *
 * If a record already exists for the specified watchlist item, its content title, webhook tags, and expiration are updated, and retry tracking is reset.
 *
 * @param watchlistItemId - The ID of the watchlist item to synchronize
 * @param contentTitle - The title of the content associated with the sync
 * @param expiresInMinutes - Number of minutes until the sync attempt expires (default: 10)
 * @param webhookTags - Tags to associate with the sync attempt
 * @returns The ID of the created or updated pending label sync record
 */
export async function createPendingLabelSync(
  this: DatabaseService,
  watchlistItemId: number,
  contentTitle: string,
  expiresInMinutes = 10,
  webhookTags: string[] = [],
): Promise<number> {
  const expiresAt = new Date(
    Date.now() + expiresInMinutes * 60 * 1000,
  ).toISOString()

  const result = await this.knex('pending_label_syncs')
    .insert({
      watchlist_item_id: watchlistItemId,
      content_title: contentTitle,
      webhook_tags: JSON.stringify(webhookTags),
      retry_count: 0,
      last_retry_at: null,
      created_at: this.timestamp,
      expires_at: expiresAt,
    })
    .onConflict('watchlist_item_id')
    .merge({
      content_title: contentTitle,
      webhook_tags: JSON.stringify(webhookTags),
      retry_count: 0,
      last_retry_at: null,
      expires_at: expiresAt,
      // Preserve original created_at on upsert
    })
    .returning('id')

  return this.extractId(result)
}

/**
 * Retrieves all pending label sync records that have not expired, ordered by creation time.
 *
 * Only records with an expiration timestamp later than the current time are returned. The `webhook_tags` field is parsed from JSON into a string array for each record.
 *
 * @returns An array of active pending label sync records
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
    webhook_tags: this.safeJsonParse<string[]>(
      row.webhook_tags,
      [],
      'pending_label_syncs.webhook_tags',
    ),
    retry_count: row.retry_count,
    last_retry_at: row.last_retry_at,
    created_at: row.created_at,
    expires_at: row.expires_at,
  }))
}

/**
 * Increments the retry count and updates the last retry timestamp for a pending label sync record if it is not expired.
 *
 * @param id - The unique identifier of the pending label sync record
 * @returns True if the record was updated; false if the record was not found or is expired
 */
export async function updatePendingLabelSyncRetry(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const now = new Date().toISOString()

  const updated = await this.knex('pending_label_syncs')
    .where('id', id)
    .where('expires_at', '>', now) // Only update if not expired
    .update({
      retry_count: this.knex.raw('retry_count + 1'),
      last_retry_at: this.timestamp,
    })

  return updated > 0
}

/**
 * Removes a pending label sync record identified by its ID.
 *
 * @param id - The unique identifier of the pending label sync record to delete
 * @returns True if a record was deleted; false if no matching record existed
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
 * Deletes all expired pending label sync records from the database.
 *
 * Removes records from the `pending_label_syncs` table where the expiration timestamp is less than or equal to the current time.
 *
 * @returns The number of expired records deleted
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
 * Retrieves a watchlist item by its ID, including its Plex key and GUIDs.
 *
 * @param watchlistItemId - The unique identifier of the watchlist item to fetch
 * @returns An object containing the item's ID, user ID, title, Plex key (if available), and an array of GUIDs, or null if the item does not exist
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
    guids: this.safeJsonParse(row.guids, [], 'watchlist_items.guids'),
  }
}

/**
 * Retrieves all non-expired pending label sync records joined with their associated watchlist items, including Plex key, user ID, GUIDs, and content type.
 *
 * @returns An array of pending label syncs with enriched watchlist item data for GUID construction and resolution.
 */
export async function getPendingLabelSyncsWithPlexKeys(
  this: DatabaseService,
): Promise<PendingLabelSyncWithPlexKeys[]> {
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
    webhook_tags: this.safeJsonParse<string[]>(
      row.webhook_tags,
      [],
      'pending_label_syncs.webhook_tags',
    ),
    retry_count: row.retry_count,
    last_retry_at: row.last_retry_at,
    created_at: row.created_at,
    expires_at: row.expires_at,
    plex_key: row.plex_key,
    user_id: row.user_id,
    guids: this.safeJsonParse(row.guids, [], 'watchlist_items.guids'),
    type: row.type,
  }))
}
