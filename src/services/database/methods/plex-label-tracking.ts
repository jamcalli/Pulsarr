import type { DatabaseService } from '@services/database.service.js'

/**
 * Database row representation for plex_label_tracking table
 */
interface PlexLabelTrackingRow {
  id: number
  content_guids: string // JSON string that gets parsed to string[]
  content_type: 'movie' | 'show'
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
  content_guids: string[] // Parsed JSON array of GUIDs
  content_type: 'movie' | 'show'
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
 * labels in a single database row, replacing any existing labels. Uses full GUID
 * arrays for proper matching and content type for disambiguation.
 *
 * @param contentGuids - Array of GUIDs for the content (e.g., ['tmdb:123', 'imdb:tt456'])
 * @param contentType - Type of content ('movie' or 'show')
 * @param userId - The ID of the user who has labels applied
 * @param plexRatingKey - The Plex rating key of the labeled content
 * @param labelsApplied - Array of all label names applied to this content
 * @returns The ID of the tracking record (new or existing)
 */
export async function trackPlexLabels(
  this: DatabaseService,
  contentGuids: string[],
  contentType: 'movie' | 'show',
  userId: number,
  plexRatingKey: string,
  labelsApplied: string[],
): Promise<number> {
  // Handle empty arrays
  if (contentGuids.length === 0) {
    throw new Error('Content GUIDs array cannot be empty')
  }

  const normalizedGuids = contentGuids.map((g) => g.toLowerCase())
  const guidsJson = JSON.stringify(normalizedGuids.sort()) // Sort for consistency
  const labelsJson = JSON.stringify(labelsApplied.sort()) // Sort for consistency

  this.log.debug('trackPlexLabels: Looking for existing record', {
    userId,
    plexRatingKey,
    normalizedGuids,
    contentType,
  })

  // Use SQL to find existing record with overlapping GUIDs
  const existing = this.isPostgres
    ? await this.knex('plex_label_tracking')
        .where('user_id', userId)
        .where('plex_rating_key', plexRatingKey)
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(content_guids) elem WHERE lower(elem) = ANY(?))',
          [normalizedGuids],
        )
        .first()
    : await this.knex('plex_label_tracking')
        .where('user_id', userId)
        .where('plex_rating_key', plexRatingKey)
        .where((builder) => {
          for (const guid of normalizedGuids) {
            builder.orWhereRaw(
              "EXISTS (SELECT 1 FROM json_each(content_guids) WHERE json_each.type = 'text' AND lower(json_each.value) = ?)",
              [guid],
            )
          }
        })
        .first()

  if (existing) {
    // Update existing record with new complete label set
    await this.knex('plex_label_tracking').where('id', existing.id).update({
      content_guids: guidsJson,
      content_type: contentType,
      labels_applied: labelsJson,
      synced_at: this.timestamp,
    })
    return existing.id
  }

  // Insert new record with complete label set
  const result = await this.knex('plex_label_tracking')
    .insert({
      content_guids: guidsJson,
      content_type: contentType,
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
 * Uses GUID matching to find the correct tracking record and removes the specified
 * label. If no labels remain after removal, the entire tracking record is deleted.
 *
 * @param contentGuids - Array of GUIDs for the content
 * @param userId - The ID of the user
 * @param plexRatingKey - The Plex rating key
 * @param labelApplied - The Plex label name to untrack
 * @returns True if a record was modified/deleted, false if no matching record found
 */
export async function untrackPlexLabel(
  this: DatabaseService,
  contentGuids: string[],
  userId: number,
  plexRatingKey: string,
  labelApplied: string,
): Promise<boolean> {
  // Handle empty arrays
  if (contentGuids.length === 0) {
    this.log.warn('untrackPlexLabel: Empty content GUIDs array provided')
    return false
  }

  const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

  this.log.debug('untrackPlexLabel: Looking for existing record', {
    userId,
    plexRatingKey,
    labelApplied,
    normalizedGuids,
  })

  // Use SQL to find existing record with overlapping GUIDs
  const existing = this.isPostgres
    ? await this.knex('plex_label_tracking')
        .where('user_id', userId)
        .where('plex_rating_key', plexRatingKey)
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(content_guids) elem WHERE lower(elem) = ANY(?))',
          [normalizedGuids],
        )
        .first()
    : await this.knex('plex_label_tracking')
        .where('user_id', userId)
        .where('plex_rating_key', plexRatingKey)
        .where((builder) => {
          for (const guid of normalizedGuids) {
            builder.orWhereRaw(
              "EXISTS (SELECT 1 FROM json_each(content_guids) WHERE json_each.type = 'text' AND lower(json_each.value) = ?)",
              [guid],
            )
          }
        })
        .first()

  if (!existing) {
    return false
  }

  // Parse existing labels and remove the specified one
  const currentLabels = this.safeJsonParse<string[]>(
    existing.labels_applied,
    [],
    'plex_label_tracking.labels_applied',
  )
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
    content_guids: this.safeJsonParse<string[]>(
      row.content_guids,
      [],
      'plex_label_tracking.content_guids',
    ),
    content_type: row.content_type,
    user_id: row.user_id,
    plex_rating_key: row.plex_rating_key,
    labels_applied: this.safeJsonParse<string[]>(
      row.labels_applied,
      [],
      'plex_label_tracking.labels_applied',
    ),
    synced_at: row.synced_at,
  }))
}

/**
 * Retrieves all tracked Plex labels for content matching the given GUID array.
 *
 * Returns all Plex labels that are currently being tracked for content with matching GUIDs
 * across all users. Uses proper GUID matching to find records with overlapping GUIDs.
 *
 * @param contentGuids - Array of GUIDs for the content (e.g., ['tmdb:123', 'imdb:tt456'])
 * @param contentType - Type of content ('movie' or 'show') for disambiguation
 * @returns An array of Plex label tracking records for the content
 */
export async function getTrackedLabelsForContent(
  this: DatabaseService,
  contentGuids: string[],
  contentType: 'movie' | 'show',
): Promise<PlexLabelTracking[]> {
  // Handle empty arrays
  if (contentGuids.length === 0) {
    this.log.warn(
      'getTrackedLabelsForContent: Empty content GUIDs array provided',
    )
    return []
  }

  const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

  this.log.debug('getTrackedLabelsForContent: Searching for records', {
    contentType,
    normalizedGuids,
  })

  // Use SQL to find records with overlapping GUIDs
  const rows = this.isPostgres
    ? await this.knex('plex_label_tracking')
        .where('content_type', contentType)
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(content_guids) elem WHERE lower(elem) = ANY(?))',
          [normalizedGuids],
        )
        .orderBy('synced_at', 'asc')
        .select('*')
    : await this.knex('plex_label_tracking')
        .where('content_type', contentType)
        .where((builder) => {
          for (const guid of normalizedGuids) {
            builder.orWhereRaw(
              "EXISTS (SELECT 1 FROM json_each(content_guids) WHERE json_each.type = 'text' AND lower(json_each.value) = ?)",
              [guid],
            )
          }
        })
        .orderBy('synced_at', 'asc')
        .select('*')

  return rows.map((row) => ({
    id: row.id,
    content_guids: this.safeJsonParse<string[]>(
      row.content_guids,
      [],
      'plex_label_tracking.content_guids',
    ),
    content_type: row.content_type,
    user_id: row.user_id,
    plex_rating_key: row.plex_rating_key,
    labels_applied: this.safeJsonParse<string[]>(
      row.labels_applied,
      [],
      'plex_label_tracking.labels_applied',
    ),
    synced_at: row.synced_at,
  }))
}

/**
 * Removes all tracking records for a specific user and content combination.
 *
 * Deletes all Plex label tracking records associated with a user's content matching the given GUIDs.
 * This is typically used when a user removes content from their watchlist.
 *
 * @param contentGuids - Array of GUIDs for the content (e.g., ['tmdb:123', 'imdb:tt456'])
 * @param contentType - Type of content ('movie' or 'show') for disambiguation
 * @param userId - The ID of the user
 * @returns The number of tracking records that were deleted
 */
export async function cleanupUserContentTracking(
  this: DatabaseService,
  contentGuids: string[],
  contentType: 'movie' | 'show',
  userId: number,
): Promise<number> {
  // Handle empty arrays
  if (contentGuids.length === 0) {
    this.log.warn(
      'cleanupUserContentTracking: Empty content GUIDs array provided',
    )
    return 0
  }

  const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

  this.log.debug('cleanupUserContentTracking: Deleting records', {
    userId,
    contentType,
    normalizedGuids,
  })

  // Use SQL to delete records with overlapping GUIDs directly
  const deleted = this.isPostgres
    ? await this.knex('plex_label_tracking')
        .where('user_id', userId)
        .where('content_type', contentType)
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(content_guids) elem WHERE lower(elem) = ANY(?))',
          [normalizedGuids],
        )
        .delete()
    : await this.knex('plex_label_tracking')
        .where('user_id', userId)
        .where('content_type', contentType)
        .where((builder) => {
          for (const guid of normalizedGuids) {
            builder.orWhereRaw(
              "EXISTS (SELECT 1 FROM json_each(content_guids) WHERE json_each.type = 'text' AND lower(json_each.value) = ?)",
              [guid],
            )
          }
        })
        .delete()

  if (deleted > 0) {
    this.log.debug(
      `Cleaned up ${deleted} Plex label tracking records for user ${userId} content type ${contentType}`,
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
    content_guids: this.safeJsonParse<string[]>(
      row.content_guids,
      [],
      'plex_label_tracking.content_guids',
    ),
    content_type: row.content_type,
    user_id: row.user_id,
    plex_rating_key: row.plex_rating_key,
    labels_applied: this.safeJsonParse<string[]>(
      row.labels_applied,
      [],
      'plex_label_tracking.labels_applied',
    ),
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
    content_guids: this.safeJsonParse<string[]>(
      row.content_guids,
      [],
      'plex_label_tracking.content_guids',
    ),
    content_type: row.content_type,
    user_id: row.user_id,
    plex_rating_key: row.plex_rating_key,
    labels_applied: this.safeJsonParse<string[]>(
      row.labels_applied,
      [],
      'plex_label_tracking.labels_applied',
    ),
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
 * @param contentGuids - Array of GUIDs for the content (e.g., ['tmdb:123', 'imdb:tt456'])
 * @param contentType - Type of content ('movie' or 'show') for disambiguation
 * @param userId - The ID of the user
 * @param plexRatingKey - The Plex rating key
 * @param labelApplied - The label to check
 * @returns True if the label is already tracked, false otherwise
 */
export async function isLabelTracked(
  this: DatabaseService,
  contentGuids: string[],
  contentType: 'movie' | 'show',
  userId: number,
  plexRatingKey: string,
  labelApplied: string,
): Promise<boolean> {
  // Handle empty arrays
  if (contentGuids.length === 0) {
    this.log.warn('isLabelTracked: Empty content GUIDs array provided')
    return false
  }

  const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

  this.log.debug('isLabelTracked: Checking label tracking', {
    userId,
    contentType,
    plexRatingKey,
    labelApplied,
    normalizedGuids,
  })

  // Use SQL to find record with overlapping GUIDs and check if it contains the label
  const record = this.isPostgres
    ? await this.knex('plex_label_tracking')
        .where('user_id', userId)
        .where('content_type', contentType)
        .where('plex_rating_key', plexRatingKey)
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(content_guids) elem WHERE lower(elem) = ANY(?))',
          [normalizedGuids],
        )
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(labels_applied) label WHERE label = ?)',
          [labelApplied],
        )
        .first()
    : await this.knex('plex_label_tracking')
        .where('user_id', userId)
        .where('content_type', contentType)
        .where('plex_rating_key', plexRatingKey)
        .where((builder) => {
          for (const guid of normalizedGuids) {
            builder.orWhereRaw(
              "EXISTS (SELECT 1 FROM json_each(content_guids) WHERE json_each.type = 'text' AND lower(json_each.value) = ?)",
              [guid],
            )
          }
        })
        .whereRaw(
          "EXISTS (SELECT 1 FROM json_each(labels_applied) WHERE json_each.type = 'text' AND json_each.value = ?)",
          [labelApplied],
        )
        .first()

  return !!record
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
    const labels = this.safeJsonParse<string[]>(
      record.labels_applied,
      [],
      'plex_label_tracking.labels_applied',
    )
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
    const labels = this.safeJsonParse<string[]>(
      record.labels_applied,
      [],
      'plex_label_tracking.labels_applied',
    )
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
    const labels = this.safeJsonParse<string[]>(
      record.labels_applied,
      [],
      'plex_label_tracking.labels_applied',
    )
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
