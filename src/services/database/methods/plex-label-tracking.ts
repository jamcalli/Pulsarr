import type { DatabaseService } from '@services/database.service.js'

/**
 * Database row representation for plex_label_tracking table
 */
interface PlexLabelTrackingRow {
  id: number
  watchlist_id: number
  plex_rating_key: string
  label_applied: string
  synced_at: string
}

/**
 * Plex label tracking record
 */
export interface PlexLabelTracking {
  id: number
  watchlist_id: number
  plex_rating_key: string
  label_applied: string
  synced_at: string
}

/**
 * Creates a new tracking record linking a Plex label to a watchlist item.
 *
 * Inserts a record to track which Plex labels are associated with specific watchlist items.
 * This allows the system to manage label synchronization and cleanup operations.
 * Uses an upsert pattern to avoid duplicates.
 *
 * @param watchlistId - The ID of the watchlist item
 * @param plexRatingKey - The Plex rating key of the labeled content
 * @param labelApplied - The Plex label name that was applied
 * @returns The ID of the tracking record (new or existing)
 */
export async function trackPlexLabel(
  this: DatabaseService,
  watchlistId: number,
  plexRatingKey: string,
  labelApplied: string,
): Promise<number> {
  // Check if record already exists to avoid duplicates
  const existing = await this.knex('plex_label_tracking')
    .where('watchlist_id', watchlistId)
    .where('plex_rating_key', plexRatingKey)
    .where('label_applied', labelApplied)
    .first()

  if (existing) {
    // Update the sync timestamp for existing records
    await this.knex('plex_label_tracking')
      .where('id', existing.id)
      .update({ synced_at: this.timestamp })
    return existing.id
  }

  // Insert new record
  const result = await this.knex('plex_label_tracking')
    .insert({
      watchlist_id: watchlistId,
      plex_rating_key: plexRatingKey,
      label_applied: labelApplied,
      synced_at: this.timestamp,
    })
    .returning('id')

  return this.extractId(result)
}

/**
 * Removes a tracking record for a specific Plex label and watchlist item.
 *
 * Deletes the tracking record that links a specific Plex label to a watchlist item.
 * This is typically used when labels are removed or cleaned up.
 *
 * @param watchlistId - The ID of the watchlist item
 * @param plexRatingKey - The Plex rating key
 * @param labelApplied - The Plex label name to untrack
 * @returns True if a record was deleted, false if the record wasn't found
 */
export async function untrackPlexLabel(
  this: DatabaseService,
  watchlistId: number,
  plexRatingKey: string,
  labelApplied: string,
): Promise<boolean> {
  const deleted = await this.knex('plex_label_tracking')
    .where('watchlist_id', watchlistId)
    .where('plex_rating_key', plexRatingKey)
    .where('label_applied', labelApplied)
    .delete()

  return deleted > 0
}

/**
 * Retrieves all tracked Plex labels for a specific watchlist item.
 *
 * Returns all Plex labels that are currently being tracked for the specified watchlist item.
 * Results are ordered by creation time (oldest first) for consistent processing.
 *
 * @param watchlistId - The ID of the watchlist item
 * @returns An array of Plex label tracking records for the watchlist item
 */
export async function getTrackedLabelsForWatchlist(
  this: DatabaseService,
  watchlistId: number,
): Promise<PlexLabelTracking[]> {
  const rows = (await this.knex('plex_label_tracking')
    .where('watchlist_id', watchlistId)
    .orderBy('synced_at', 'asc')
    .select('*')) as PlexLabelTrackingRow[]

  return rows.map((row) => ({
    id: row.id,
    watchlist_id: row.watchlist_id,
    plex_rating_key: row.plex_rating_key,
    label_applied: row.label_applied,
    synced_at: row.synced_at,
  }))
}

/**
 * Removes all tracking records for a specific watchlist item.
 *
 * Deletes all Plex label tracking records associated with a watchlist item.
 * This is typically used when a watchlist item is being deleted or when cleaning up labels.
 *
 * @param watchlistId - The ID of the watchlist item
 * @returns The number of tracking records that were deleted
 */
export async function cleanupWatchlistTracking(
  this: DatabaseService,
  watchlistId: number,
): Promise<number> {
  const deleted = await this.knex('plex_label_tracking')
    .where('watchlist_id', watchlistId)
    .delete()

  if (deleted > 0) {
    this.log.debug(
      `Cleaned up ${deleted} Plex label tracking records for watchlist item ${watchlistId}`,
    )
  }

  return deleted
}

/**
 * Retrieves all Plex label tracking records from the database.
 *
 * Returns all tracking records, typically used for batch operations or system-wide
 * label management. Results are ordered by watchlist ID and creation time for
 * consistent processing.
 *
 * @returns An array of all Plex label tracking records
 */
export async function getAllTrackedLabels(
  this: DatabaseService,
): Promise<PlexLabelTracking[]> {
  const rows = (await this.knex('plex_label_tracking')
    .orderBy(['watchlist_id', 'synced_at'])
    .select('*')) as PlexLabelTrackingRow[]

  return rows.map((row) => ({
    id: row.id,
    watchlist_id: row.watchlist_id,
    plex_rating_key: row.plex_rating_key,
    label_applied: row.label_applied,
    synced_at: row.synced_at,
  }))
}

/**
 * Gets all tracked labels for a specific Plex rating key.
 *
 * Returns all labels that are currently being tracked for the specified Plex content.
 * Useful for determining what labels are already applied to a piece of content.
 *
 * @param plexRatingKey - The Plex rating key
 * @returns An array of Plex label tracking records for the rating key
 */
export async function getTrackedLabelsForRatingKey(
  this: DatabaseService,
  plexRatingKey: string,
): Promise<PlexLabelTracking[]> {
  const rows = (await this.knex('plex_label_tracking')
    .where('plex_rating_key', plexRatingKey)
    .orderBy('synced_at', 'asc')
    .select('*')) as PlexLabelTrackingRow[]

  return rows.map((row) => ({
    id: row.id,
    watchlist_id: row.watchlist_id,
    plex_rating_key: row.plex_rating_key,
    label_applied: row.label_applied,
    synced_at: row.synced_at,
  }))
}

/**
 * Removes all tracking records for a specific Plex rating key.
 *
 * Deletes all tracking records associated with a specific piece of Plex content.
 * This is typically used when content is removed from Plex or during cleanup.
 *
 * @param plexRatingKey - The Plex rating key
 * @returns The number of tracking records that were deleted
 */
export async function cleanupRatingKeyTracking(
  this: DatabaseService,
  plexRatingKey: string,
): Promise<number> {
  const deleted = await this.knex('plex_label_tracking')
    .where('plex_rating_key', plexRatingKey)
    .delete()

  if (deleted > 0) {
    this.log.debug(
      `Cleaned up ${deleted} Plex label tracking records for rating key ${plexRatingKey}`,
    )
  }

  return deleted
}

/**
 * Checks if a specific label is already tracked for a watchlist item and rating key.
 *
 * @param watchlistId - The ID of the watchlist item
 * @param plexRatingKey - The Plex rating key
 * @param labelApplied - The label to check
 * @returns True if the label is already tracked, false otherwise
 */
export async function isLabelTracked(
  this: DatabaseService,
  watchlistId: number,
  plexRatingKey: string,
  labelApplied: string,
): Promise<boolean> {
  const result = await this.knex('plex_label_tracking')
    .where('watchlist_id', watchlistId)
    .where('plex_rating_key', plexRatingKey)
    .where('label_applied', labelApplied)
    .first()

  return !!result
}
