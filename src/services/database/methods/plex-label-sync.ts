import type { DatabaseService } from '@services/database.service.js'

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

/** Upserts by watchlist item, keeping retry_count and created_at on an existing row. */
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
      expires_at: expiresAt,
    })
    .returning('id')

  return this.extractId(result)
}

/** Non-expired rows only, oldest first. */
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

/** Returns false when the row is missing or already expired. */
export async function updatePendingLabelSyncRetry(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const now = new Date().toISOString()

  const updated = await this.knex('pending_label_syncs')
    .where('id', id)
    .where('expires_at', '>', now)
    .update({
      retry_count: this.knex.raw('retry_count + 1'),
      last_retry_at: this.timestamp,
    })

  return updated > 0
}

export async function deletePendingLabelSync(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deleted = await this.knex('pending_label_syncs')
    .where('id', id)
    .delete()

  return deleted > 0
}

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

/** Non-expired rows only, oldest first. */
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
