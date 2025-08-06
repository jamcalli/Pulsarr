import type { DatabaseService } from '@services/database.service.js'

/**
 * Database row representation for plex_label_tracking table
 */
interface PlexLabelTrackingRow {
  id: number
  content_key: string
  user_id: number
  plex_rating_key: string
  labels_applied: string // JSON string that gets parsed to string[]
  synced_at: string
}

/**
 * Plex label tracking record
 */
export interface PlexLabelTracking {
  id: number
  content_key: string
  user_id: number
  plex_rating_key: string
  labels_applied: string[] // Parsed JSON array of labels
  synced_at: string
}

/**
 * Updates the tracking record with the complete set of labels for a content item.
 *
 * Creates or updates a tracking record with the complete array of labels applied
 * to a specific piece of content for a user. This efficient approach stores all
 * labels in a single database row, replacing any existing labels.
 *
 * @param contentKey - The TMDB/Plex content identifier
 * @param userId - The ID of the user who has labels applied
 * @param plexRatingKey - The Plex rating key of the labeled content
 * @param labelsApplied - Array of all label names applied to this content
 * @returns The ID of the tracking record (new or existing)
 */
export async function trackPlexLabels(
  this: DatabaseService,
  contentKey: string,
  userId: number,
  plexRatingKey: string,
  labelsApplied: string[],
): Promise<number> {
  const labelsJson = JSON.stringify(labelsApplied.sort()) // Sort for consistency

  // Check if record already exists
  const existing = await this.knex('plex_label_tracking')
    .where('content_key', contentKey)
    .where('user_id', userId)
    .where('plex_rating_key', plexRatingKey)
    .first()

  if (existing) {
    // Update existing record with new complete label set
    await this.knex('plex_label_tracking').where('id', existing.id).update({
      labels_applied: labelsJson,
      synced_at: this.timestamp,
    })
    return existing.id
  }

  // Insert new record with complete label set
  const result = await this.knex('plex_label_tracking')
    .insert({
      content_key: contentKey,
      user_id: userId,
      plex_rating_key: plexRatingKey,
      labels_applied: labelsJson,
      synced_at: this.timestamp,
    })
    .returning('id')

  return this.extractId(result)
}

/**
 * Removes a tracking record for a specific Plex label and user/content combination.
 *
 * Deletes the tracking record that links a specific Plex label to a user's content.
 * This is typically used when labels are removed or cleaned up.
 *
 * @param contentKey - The TMDB/Plex content identifier
 * @param userId - The ID of the user
 * @param plexRatingKey - The Plex rating key
 * @param labelApplied - The Plex label name to untrack
 * @returns True if a record was deleted, false if the record wasn't found
 */
export async function untrackPlexLabel(
  this: DatabaseService,
  contentKey: string,
  userId: number,
  plexRatingKey: string,
  labelApplied: string,
): Promise<boolean> {
  // Get existing record
  const existing = await this.knex('plex_label_tracking')
    .where('content_key', contentKey)
    .where('user_id', userId)
    .where('plex_rating_key', plexRatingKey)
    .first()

  if (!existing) {
    return false
  }

  // Parse existing labels and remove the specified one
  const currentLabels: string[] = JSON.parse(existing.labels_applied || '[]')
  const updatedLabels = currentLabels.filter((label) => label !== labelApplied)

  // If no labels remain, delete the record
  if (updatedLabels.length === 0) {
    const deleted = await this.knex('plex_label_tracking')
      .where('id', existing.id)
      .delete()
    return deleted > 0
  }

  // Otherwise, update with remaining labels
  await this.knex('plex_label_tracking')
    .where('id', existing.id)
    .update({
      labels_applied: JSON.stringify(updatedLabels.sort()),
      synced_at: this.timestamp,
    })

  return true
}

/**
 * Retrieves all tracked Plex labels for a specific user.
 *
 * Returns all Plex labels that are currently being tracked for the specified user.
 * Results are ordered by creation time (oldest first) for consistent processing.
 *
 * @param userId - The ID of the user
 * @returns An array of Plex label tracking records for the user
 */
export async function getTrackedLabelsForUser(
  this: DatabaseService,
  userId: number,
): Promise<PlexLabelTracking[]> {
  const rows = (await this.knex('plex_label_tracking')
    .where('user_id', userId)
    .orderBy('synced_at', 'asc')
    .select('*')) as PlexLabelTrackingRow[]

  return rows.map((row) => ({
    id: row.id,
    content_key: row.content_key,
    user_id: row.user_id,
    plex_rating_key: row.plex_rating_key,
    labels_applied: JSON.parse(row.labels_applied || '[]'),
    synced_at: row.synced_at,
  }))
}

/**
 * Retrieves all tracked Plex labels for a specific content item.
 *
 * Returns all Plex labels that are currently being tracked for the specified content
 * across all users. Useful for determining what labels are applied to a piece of content.
 *
 * @param contentKey - The TMDB/Plex content identifier
 * @returns An array of Plex label tracking records for the content
 */
export async function getTrackedLabelsForContent(
  this: DatabaseService,
  contentKey: string,
): Promise<PlexLabelTracking[]> {
  const rows = (await this.knex('plex_label_tracking')
    .where('content_key', contentKey)
    .orderBy('synced_at', 'asc')
    .select('*')) as PlexLabelTrackingRow[]

  return rows.map((row) => ({
    id: row.id,
    content_key: row.content_key,
    user_id: row.user_id,
    plex_rating_key: row.plex_rating_key,
    labels_applied: JSON.parse(row.labels_applied || '[]'),
    synced_at: row.synced_at,
  }))
}

/**
 * Removes all tracking records for a specific user and content combination.
 *
 * Deletes all Plex label tracking records associated with a user's specific content.
 * This is typically used when a user removes content from their watchlist.
 *
 * @param contentKey - The TMDB/Plex content identifier
 * @param userId - The ID of the user
 * @returns The number of tracking records that were deleted
 */
export async function cleanupUserContentTracking(
  this: DatabaseService,
  contentKey: string,
  userId: number,
): Promise<number> {
  const deleted = await this.knex('plex_label_tracking')
    .where('content_key', contentKey)
    .where('user_id', userId)
    .delete()

  if (deleted > 0) {
    this.log.debug(
      `Cleaned up ${deleted} Plex label tracking records for user ${userId} content ${contentKey}`,
    )
  }

  return deleted
}

/**
 * Removes all tracking records for a specific user.
 *
 * Deletes all Plex label tracking records associated with a user.
 * This is typically used when cleaning up labels for a user or when a user is deleted.
 *
 * @param userId - The ID of the user
 * @returns The number of tracking records that were deleted
 */
export async function cleanupUserTracking(
  this: DatabaseService,
  userId: number,
): Promise<number> {
  const deleted = await this.knex('plex_label_tracking')
    .where('user_id', userId)
    .delete()

  if (deleted > 0) {
    this.log.debug(
      `Cleaned up ${deleted} Plex label tracking records for user ${userId}`,
    )
  }

  return deleted
}

/**
 * Retrieves all Plex label tracking records from the database.
 *
 * Returns all tracking records, typically used for batch operations or system-wide
 * label management. Results are ordered by user ID and creation time for
 * consistent processing.
 *
 * @returns An array of all Plex label tracking records
 */
export async function getAllTrackedLabels(
  this: DatabaseService,
): Promise<PlexLabelTracking[]> {
  const rows = (await this.knex('plex_label_tracking')
    .orderBy(['user_id', 'synced_at'])
    .select('*')) as PlexLabelTrackingRow[]

  return rows.map((row) => ({
    id: row.id,
    content_key: row.content_key,
    user_id: row.user_id,
    plex_rating_key: row.plex_rating_key,
    labels_applied: JSON.parse(row.labels_applied || '[]'),
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
    content_key: row.content_key,
    user_id: row.user_id,
    plex_rating_key: row.plex_rating_key,
    labels_applied: JSON.parse(row.labels_applied || '[]'),
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
 * Checks if a specific label is already tracked for a user/content/rating key combination.
 *
 * @param contentKey - The TMDB/Plex content identifier
 * @param userId - The ID of the user
 * @param plexRatingKey - The Plex rating key
 * @param labelApplied - The label to check
 * @returns True if the label is already tracked, false otherwise
 */
export async function isLabelTracked(
  this: DatabaseService,
  contentKey: string,
  userId: number,
  plexRatingKey: string,
  labelApplied: string,
): Promise<boolean> {
  const result = await this.knex('plex_label_tracking')
    .where('content_key', contentKey)
    .where('user_id', userId)
    .where('plex_rating_key', plexRatingKey)
    .first()

  if (!result) {
    return false
  }

  const labels: string[] = JSON.parse(result.labels_applied || '[]')
  return labels.includes(labelApplied)
}

/**
 * Removes all Plex label tracking records from the database.
 *
 * Deletes every tracking record in the system, typically used during bulk label removal
 * or system resets. Use with caution as this will remove all tracking information.
 *
 * @returns The number of tracking records that were deleted
 */
export async function clearAllLabelTracking(
  this: DatabaseService,
): Promise<number> {
  const deleted = await this.knex('plex_label_tracking').delete()

  if (deleted > 0) {
    this.log.info(
      `Cleared all ${deleted} Plex label tracking records from database`,
    )
  }

  return deleted
}

/**
 * Removes tracking records for a specific label on a specific Plex rating key.
 *
 * Deletes all tracking records that match the given rating key and label,
 * regardless of watchlist item. This is useful for orphaned label cleanup.
 *
 * @param plexRatingKey - The Plex rating key
 * @param labelApplied - The label to remove tracking for
 * @returns The number of tracking records that were deleted
 */
export async function removeTrackedLabel(
  this: DatabaseService,
  plexRatingKey: string,
  labelApplied: string,
): Promise<number> {
  // Get all records for this rating key
  const records = await this.knex('plex_label_tracking')
    .where('plex_rating_key', plexRatingKey)
    .select('*')

  let totalUpdated = 0

  for (const record of records) {
    const labels: string[] = JSON.parse(record.labels_applied || '[]')
    const updatedLabels = labels.filter((label) => label !== labelApplied)

    if (updatedLabels.length !== labels.length) {
      // Label was found and removed
      if (updatedLabels.length === 0) {
        // Delete record if no labels remain
        await this.knex('plex_label_tracking').where('id', record.id).delete()
      } else {
        // Update with remaining labels
        await this.knex('plex_label_tracking')
          .where('id', record.id)
          .update({
            labels_applied: JSON.stringify(updatedLabels.sort()),
            synced_at: this.timestamp,
          })
      }
      totalUpdated++
    }
  }

  if (totalUpdated > 0) {
    this.log.debug(
      `Updated ${totalUpdated} tracking record(s) to remove label "${labelApplied}" on rating key ${plexRatingKey}`,
    )
  }

  return totalUpdated
}

/**
 * Find orphaned tracking records where the applied label doesn't match any current valid user labels.
 *
 * Uses SQL queries to efficiently identify tracking records that should be cleaned up because:
 * - The label doesn't match the current label prefix for any sync-enabled user
 * - The watchlist item references a user who no longer has sync enabled
 * - The label prefix has changed and old labels are now orphaned
 *
 * @param validLabels - Set of currently valid user labels (lowercase)
 * @param labelPrefix - The prefix from the label configuration (e.g., "pulsarr")
 * @returns Array of tracking records with orphaned labels grouped by rating key
 */
export async function getOrphanedLabelTracking(
  this: DatabaseService,
  validLabels: Set<string>,
  labelPrefix: string,
): Promise<Array<{ plex_rating_key: string; orphaned_labels: string[] }>> {
  // Get all tracking records
  const allRecords = await this.knex('plex_label_tracking')
    .select('plex_rating_key', 'labels_applied')
    .orderBy('plex_rating_key')

  if (allRecords.length === 0) {
    return []
  }

  // Group by rating key and filter for orphaned labels
  const orphanedByRatingKey = new Map<string, string[]>()

  for (const record of allRecords) {
    const labels: string[] = JSON.parse(record.labels_applied || '[]')
    const orphanedLabels: string[] = []

    for (const label of labels) {
      const labelLower = label.toLowerCase()

      // Check if it's an app-managed label that's now orphaned
      if (
        labelLower.startsWith(`${labelPrefix.toLowerCase()}:`) &&
        !validLabels.has(labelLower)
      ) {
        orphanedLabels.push(label)
      }
    }

    if (orphanedLabels.length > 0) {
      orphanedByRatingKey.set(record.plex_rating_key, orphanedLabels)
    }
  }

  // Convert map to array format
  return Array.from(orphanedByRatingKey.entries()).map(
    ([plex_rating_key, orphaned_labels]) => ({
      plex_rating_key,
      orphaned_labels,
    }),
  )
}

/**
 * Remove multiple tracking records in a batch operation.
 *
 * Efficiently removes tracking records for multiple orphaned labels on a rating key.
 * Uses a single delete query with WHERE IN clause for optimal performance.
 *
 * @param plexRatingKey - The Plex rating key
 * @param orphanedLabels - Array of label names to remove tracking for
 * @returns The number of tracking records that were deleted
 */
export async function removeOrphanedTracking(
  this: DatabaseService,
  plexRatingKey: string,
  orphanedLabels: string[],
): Promise<number> {
  if (orphanedLabels.length === 0) {
    return 0
  }

  // Get all records for this rating key
  const records = await this.knex('plex_label_tracking')
    .where('plex_rating_key', plexRatingKey)
    .select('*')

  let totalUpdated = 0

  for (const record of records) {
    const labels: string[] = JSON.parse(record.labels_applied || '[]')
    const updatedLabels = labels.filter(
      (label) => !orphanedLabels.includes(label),
    )

    if (updatedLabels.length !== labels.length) {
      // Some orphaned labels were found and removed
      if (updatedLabels.length === 0) {
        // Delete record if no labels remain
        await this.knex('plex_label_tracking').where('id', record.id).delete()
      } else {
        // Update with remaining labels
        await this.knex('plex_label_tracking')
          .where('id', record.id)
          .update({
            labels_applied: JSON.stringify(updatedLabels.sort()),
            synced_at: this.timestamp,
          })
      }
      totalUpdated++
    }
  }

  if (totalUpdated > 0) {
    this.log.debug(
      `Updated ${totalUpdated} tracking record(s) to remove orphaned labels for rating key ${plexRatingKey}`,
      { orphanedLabels },
    )
  }

  return totalUpdated
}
