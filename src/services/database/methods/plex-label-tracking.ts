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
 * Bulk operation for tracking Plex labels
 */
export interface TrackPlexLabelsOperation {
  contentGuids: string[]
  contentType: 'movie' | 'show'
  userId: number
  plexRatingKey: string
  labelsApplied: string[]
}

/**
 * Bulk operation for untracking Plex labels
 */
export interface UntrackPlexLabelOperation {
  contentGuids: string[]
  userId: number
  plexRatingKey: string
  labelApplied: string
}

/**
 * Result of bulk operations
 */
export interface BulkOperationResult {
  processedCount: number
  failedIds: string[]
}

/**
 * Processes multiple tracking operations for Plex labels in bulk.
 *
 * Efficiently creates or updates multiple tracking records with complete label sets.
 * For PostgreSQL, uses optimized CTEs and bulk upserts. For SQLite, uses chunked
 * transaction-based processing with proper error handling.
 *
 * @param operations - Array of tracking operations
 * @returns Object with processedCount and failedIds
 */
export async function trackPlexLabelsBulk(
  this: DatabaseService,
  operations: TrackPlexLabelsOperation[],
): Promise<BulkOperationResult> {
  const failedIds: string[] = []
  let processedCount = 0

  if (operations.length === 0) {
    return { processedCount: 0, failedIds: [] }
  }

  this.log.debug(
    `trackPlexLabelsBulk: Processing ${operations.length} operations`,
    { operationsCount: operations.length },
  )

  try {
    if (this.isPostgres) {
      // PostgreSQL: Process operations in chunks with efficient CTEs
      const chunks = this.chunkArray(operations, 50)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = await Promise.all(
            chunk.map(async (operation) => {
              try {
                const {
                  contentGuids,
                  contentType,
                  userId,
                  plexRatingKey,
                  labelsApplied,
                } = operation

                // Handle empty arrays
                if (contentGuids.length === 0) {
                  throw new Error('Content GUIDs array cannot be empty')
                }

                const normalizedGuids = contentGuids.map((g) => g.toLowerCase())
                const guidsJson = JSON.stringify(normalizedGuids.sort())
                const labelsJson = JSON.stringify(labelsApplied.sort())

                // Use PostgreSQL-specific upsert with GUID matching
                const result = await trx.raw(
                  `
                  WITH matched_record AS (
                    SELECT id FROM plex_label_tracking
                    WHERE user_id = ?
                      AND plex_rating_key = ?
                      AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(content_guids) elem 
                        WHERE lower(elem) = ANY(?)
                      )
                    LIMIT 1
                  ),
                  upserted AS (
                    INSERT INTO plex_label_tracking (
                      content_guids, content_type, user_id, plex_rating_key, 
                      labels_applied, synced_at
                    )
                    SELECT ?::jsonb, ?, ?, ?, ?::jsonb, ?
                    WHERE NOT EXISTS (SELECT 1 FROM matched_record)
                    RETURNING id
                  ),
                  updated AS (
                    UPDATE plex_label_tracking
                    SET 
                      content_guids = ?::jsonb,
                      content_type = ?,
                      labels_applied = ?::jsonb,
                      synced_at = ?
                    FROM matched_record
                    WHERE plex_label_tracking.id = matched_record.id
                    RETURNING plex_label_tracking.id
                  )
                  SELECT COALESCE(
                    (SELECT id FROM upserted),
                    (SELECT id FROM updated)
                  ) as record_id
                  `,
                  [
                    userId,
                    plexRatingKey,
                    normalizedGuids,
                    guidsJson,
                    contentType,
                    userId,
                    plexRatingKey,
                    labelsJson,
                    this.timestamp,
                    guidsJson,
                    contentType,
                    labelsJson,
                    this.timestamp,
                  ],
                )

                return {
                  plexRatingKey,
                  success: true,
                  recordId: result.rows[0]?.record_id || null,
                }
              } catch (error) {
                this.log.error('Failed to track labels for operation', {
                  error,
                  operation,
                })
                return {
                  plexRatingKey: operation.plexRatingKey,
                  success: false,
                }
              }
            }),
          )

          for (const result of chunkResults) {
            if (result.success) {
              processedCount++
              this.log.debug(
                `Tracked labels for rating key ${result.plexRatingKey}`,
                { recordId: result.recordId },
              )
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    } else {
      // SQLite: Use chunked operations with individual upserts
      const chunks = this.chunkArray(operations, 50)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = await Promise.all(
            chunk.map(async (operation) => {
              try {
                const {
                  contentGuids,
                  contentType,
                  userId,
                  plexRatingKey,
                  labelsApplied,
                } = operation

                // Handle empty arrays
                if (contentGuids.length === 0) {
                  throw new Error('Content GUIDs array cannot be empty')
                }

                const normalizedGuids = contentGuids.map((g) => g.toLowerCase())
                const guidsJson = JSON.stringify(normalizedGuids.sort())
                const labelsJson = JSON.stringify(labelsApplied.sort())

                // Find existing record with overlapping GUIDs
                const existing = await trx('plex_label_tracking')
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

                let recordId: number

                if (existing) {
                  // Update existing record with new complete label set
                  await trx('plex_label_tracking')
                    .where('id', existing.id)
                    .update({
                      content_guids: guidsJson,
                      content_type: contentType,
                      labels_applied: labelsJson,
                      synced_at: this.timestamp,
                    })
                  recordId = existing.id
                } else {
                  // Insert new record with complete label set
                  const result = await trx('plex_label_tracking')
                    .insert({
                      content_guids: guidsJson,
                      content_type: contentType,
                      user_id: userId,
                      plex_rating_key: plexRatingKey,
                      labels_applied: labelsJson,
                      synced_at: this.timestamp,
                    })
                    .returning('id')
                  recordId = this.extractId(result)
                }

                return {
                  plexRatingKey,
                  success: true,
                  recordId,
                }
              } catch (error) {
                this.log.error('Failed to track labels for operation', {
                  error,
                  operation,
                })
                return {
                  plexRatingKey: operation.plexRatingKey,
                  success: false,
                }
              }
            }),
          )

          for (const result of chunkResults) {
            if (result.success) {
              processedCount++
              this.log.debug(
                `Tracked labels for rating key ${result.plexRatingKey}`,
                { recordId: result.recordId },
              )
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    }
  } catch (error) {
    this.log.error('Error in bulk label tracking transaction', { error })
    return {
      processedCount: 0,
      failedIds: operations.map((op) => op.plexRatingKey),
    }
  }

  return { processedCount, failedIds }
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
  const result = await this.trackPlexLabelsBulk([
    {
      contentGuids,
      contentType,
      userId,
      plexRatingKey,
      labelsApplied,
    },
  ])

  if (result.failedIds.length > 0) {
    throw new Error(`Failed to track labels for rating key ${plexRatingKey}`)
  }

  // For backward compatibility, we need to return the record ID
  // Since we can't get that from the bulk operation result in a clean way,
  // we'll query for it
  const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

  const record = this.isPostgres
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

  if (!record) {
    throw new Error('Failed to retrieve tracking record after creation')
  }

  return record.id
}

/**
 * Processes multiple untracking operations for Plex labels in bulk.
 *
 * Efficiently removes specified labels from multiple tracking records.
 * For PostgreSQL, uses optimized CTEs with JSON filtering. For SQLite, uses
 * chunked transaction-based processing with proper error handling.
 *
 * @param operations - Array of untracking operations
 * @returns Object with processedCount and failedIds
 */
export async function untrackPlexLabelBulk(
  this: DatabaseService,
  operations: UntrackPlexLabelOperation[],
): Promise<BulkOperationResult> {
  const failedIds: string[] = []
  let processedCount = 0

  if (operations.length === 0) {
    return { processedCount: 0, failedIds: [] }
  }

  this.log.debug(
    `untrackPlexLabelBulk: Processing ${operations.length} operations`,
    { operationsCount: operations.length },
  )

  try {
    if (this.isPostgres) {
      // PostgreSQL: Process operations in chunks with efficient CTEs
      const chunks = this.chunkArray(operations, 50)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = await Promise.all(
            chunk.map(async (operation) => {
              try {
                const { contentGuids, userId, plexRatingKey, labelApplied } =
                  operation

                // Handle empty arrays
                if (contentGuids.length === 0) {
                  this.log.warn(
                    'untrackPlexLabelBulk: Empty content GUIDs array provided',
                    { operation },
                  )
                  return { plexRatingKey, success: false }
                }

                const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

                // Use PostgreSQL CTE to handle label removal with JSON operations
                const result = await trx.raw(
                  `
                  WITH updated_records AS (
                    UPDATE plex_label_tracking 
                    SET 
                      labels_applied = (
                        SELECT jsonb_agg(elem ORDER BY elem)
                        FROM jsonb_array_elements_text(labels_applied) elem
                        WHERE elem != ?
                      ),
                      synced_at = ?
                    WHERE user_id = ?
                      AND plex_rating_key = ?
                      AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(content_guids) elem 
                        WHERE lower(elem) = ANY(?)
                      )
                      AND labels_applied ? ?
                      AND jsonb_array_length(
                        (SELECT jsonb_agg(elem ORDER BY elem)
                         FROM jsonb_array_elements_text(labels_applied) elem
                         WHERE elem != ?)
                      ) > 0
                    RETURNING id
                  ),
                  deleted_records AS (
                    DELETE FROM plex_label_tracking
                    WHERE user_id = ?
                      AND plex_rating_key = ?
                      AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(content_guids) elem 
                        WHERE lower(elem) = ANY(?)
                      )
                      AND labels_applied ? ?
                      AND jsonb_array_length(
                        (SELECT jsonb_agg(elem ORDER BY elem)
                         FROM jsonb_array_elements_text(labels_applied) elem
                         WHERE elem != ?)
                      ) = 0
                    RETURNING id
                  )
                  SELECT 
                    (SELECT COUNT(*) FROM updated_records) as updated_count,
                    (SELECT COUNT(*) FROM deleted_records) as deleted_count
                  `,
                  [
                    labelApplied,
                    this.timestamp,
                    userId,
                    plexRatingKey,
                    normalizedGuids,
                    labelApplied,
                    labelApplied,
                    userId,
                    plexRatingKey,
                    normalizedGuids,
                    labelApplied,
                    labelApplied,
                  ],
                )

                const totalUpdated =
                  (result.rows[0]?.updated_count || 0) +
                  (result.rows[0]?.deleted_count || 0)

                return {
                  plexRatingKey,
                  success: totalUpdated > 0,
                  updatedCount: totalUpdated,
                }
              } catch (error) {
                this.log.error('Failed to untrack label for operation', {
                  error,
                  operation,
                })
                return {
                  plexRatingKey: operation.plexRatingKey,
                  success: false,
                }
              }
            }),
          )

          for (const result of chunkResults) {
            if (result.success) {
              processedCount++
              this.log.debug(
                `Untracked label for rating key ${result.plexRatingKey}`,
                { updatedCount: result.updatedCount },
              )
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    } else {
      // SQLite: Use chunked operations with individual label processing
      const chunks = this.chunkArray(operations, 50)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = await Promise.all(
            chunk.map(async (operation) => {
              try {
                const { contentGuids, userId, plexRatingKey, labelApplied } =
                  operation

                // Handle empty arrays
                if (contentGuids.length === 0) {
                  this.log.warn(
                    'untrackPlexLabelBulk: Empty content GUIDs array provided',
                    { operation },
                  )
                  return { plexRatingKey, success: false }
                }

                const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

                // Find existing record with overlapping GUIDs
                const existing = await trx('plex_label_tracking')
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
                  return { plexRatingKey, success: false }
                }

                // Parse existing labels and remove the specified one
                const currentLabels = this.safeJsonParse<string[]>(
                  existing.labels_applied,
                  [],
                  'plex_label_tracking.labels_applied',
                )
                const updatedLabels = currentLabels.filter(
                  (label) => label !== labelApplied,
                )

                // If no labels remain, delete the record
                if (updatedLabels.length === 0) {
                  const deleted = await trx('plex_label_tracking')
                    .where('id', existing.id)
                    .delete()
                  return {
                    plexRatingKey,
                    success: deleted > 0,
                    updatedCount: deleted,
                  }
                }

                // Otherwise, update with remaining labels
                await trx('plex_label_tracking')
                  .where('id', existing.id)
                  .update({
                    labels_applied: JSON.stringify(updatedLabels.sort()),
                    synced_at: this.timestamp,
                  })

                return {
                  plexRatingKey,
                  success: true,
                  updatedCount: 1,
                }
              } catch (error) {
                this.log.error('Failed to untrack label for operation', {
                  error,
                  operation,
                })
                return {
                  plexRatingKey: operation.plexRatingKey,
                  success: false,
                }
              }
            }),
          )

          for (const result of chunkResults) {
            if (result.success) {
              processedCount++
              this.log.debug(
                `Untracked label for rating key ${result.plexRatingKey}`,
                { updatedCount: result.updatedCount },
              )
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    }
  } catch (error) {
    this.log.error('Error in bulk label untracking transaction', { error })
    return {
      processedCount: 0,
      failedIds: operations.map((op) => op.plexRatingKey),
    }
  }

  return { processedCount, failedIds }
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
  const result = await this.untrackPlexLabelBulk([
    {
      contentGuids,
      userId,
      plexRatingKey,
      labelApplied,
    },
  ])

  // Return true if the operation succeeded (record was found and modified)
  return result.processedCount > 0
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
 * Removes tracking records for specific labels on multiple Plex rating keys in bulk.
 *
 * Efficiently processes multiple label removal operations in batches. For PostgreSQL,
 * uses optimized CTE-based queries. For SQLite, processes operations within chunked
 * transactions for better performance.
 *
 * @param operations - Array of operations, each containing plexRatingKey and labelsToRemove
 * @returns Object with processedCount (successful operations) and failedIds (failed rating keys)
 */
export async function removeTrackedLabels(
  this: DatabaseService,
  operations: Array<{ plexRatingKey: string; labelsToRemove: string[] }>,
): Promise<{ processedCount: number; failedIds: string[] }> {
  const failedIds: string[] = []
  let processedCount = 0

  if (operations.length === 0) {
    return { processedCount: 0, failedIds: [] }
  }

  this.log.debug(
    `removeTrackedLabels: Processing ${operations.length} operations`,
    { operationsCount: operations.length },
  )

  const isPostgres = this.knex.client.config.client === 'pg'

  try {
    if (isPostgres) {
      // PostgreSQL: Process operations individually with efficient queries
      const chunks = this.chunkArray(operations, 50)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = await Promise.all(
            chunk.map(async ({ plexRatingKey, labelsToRemove }) => {
              try {
                let totalUpdated = 0

                for (const label of labelsToRemove) {
                  const result = await trx.raw(
                    `
                    WITH updated_records AS (
                      UPDATE plex_label_tracking 
                      SET 
                        labels_applied = (
                          SELECT jsonb_agg(elem ORDER BY elem)
                          FROM jsonb_array_elements_text(labels_applied) elem
                          WHERE elem != ?
                        ),
                        synced_at = ?
                      WHERE plex_rating_key = ?
                        AND labels_applied ? ?
                        AND jsonb_array_length(
                          (SELECT jsonb_agg(elem ORDER BY elem)
                           FROM jsonb_array_elements_text(labels_applied) elem
                           WHERE elem != ?)
                        ) > 0
                      RETURNING id
                    ),
                    deleted_records AS (
                      DELETE FROM plex_label_tracking
                      WHERE plex_rating_key = ?
                        AND labels_applied ? ?
                        AND jsonb_array_length(
                          (SELECT jsonb_agg(elem ORDER BY elem)
                           FROM jsonb_array_elements_text(labels_applied) elem
                           WHERE elem != ?)
                        ) = 0
                      RETURNING id
                    )
                    SELECT 
                      (SELECT COUNT(*) FROM updated_records) as updated_count,
                      (SELECT COUNT(*) FROM deleted_records) as deleted_count
                    `,
                    [
                      label,
                      this.timestamp,
                      plexRatingKey,
                      label,
                      label,
                      plexRatingKey,
                      label,
                      label,
                    ],
                  )

                  totalUpdated +=
                    (result.rows[0]?.updated_count || 0) +
                    (result.rows[0]?.deleted_count || 0)
                }

                return {
                  plexRatingKey,
                  success: true,
                  updatedCount: totalUpdated,
                }
              } catch (error) {
                this.log.error(
                  `Failed to remove labels for rating key ${plexRatingKey}`,
                  { error, plexRatingKey, labelsToRemove },
                )
                return { plexRatingKey, success: false, updatedCount: 0 }
              }
            }),
          )

          for (const result of chunkResults) {
            if (result.success) {
              processedCount++
              if (result.updatedCount > 0) {
                this.log.debug(
                  `Updated ${result.updatedCount} tracking record(s) for rating key ${result.plexRatingKey}`,
                )
              }
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    } else {
      // SQLite: Use chunked operations with Promise.all for better performance
      const chunks = this.chunkArray(operations, 50)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = await Promise.all(
            chunk.map(async ({ plexRatingKey, labelsToRemove }) => {
              try {
                const records = await trx('plex_label_tracking')
                  .where('plex_rating_key', plexRatingKey)
                  .select('*')

                const toUpdate: Array<{ id: number; labels: string[] }> = []
                const toDelete: number[] = []

                for (const record of records) {
                  const labels = this.safeJsonParse<string[]>(
                    record.labels_applied,
                    [],
                    'plex_label_tracking.labels_applied',
                  )
                  const updatedLabels = labels.filter(
                    (label) => !labelsToRemove.includes(label),
                  )

                  if (updatedLabels.length !== labels.length) {
                    if (updatedLabels.length === 0) {
                      toDelete.push(record.id)
                    } else {
                      toUpdate.push({ id: record.id, labels: updatedLabels })
                    }
                  }
                }

                let totalUpdated = 0

                // Process updates in parallel
                if (toUpdate.length > 0) {
                  await Promise.all(
                    toUpdate.map((item) =>
                      trx('plex_label_tracking')
                        .where('id', item.id)
                        .update({
                          labels_applied: JSON.stringify(item.labels.sort()),
                          synced_at: this.timestamp,
                        }),
                    ),
                  )
                  totalUpdated += toUpdate.length
                }

                if (toDelete.length > 0) {
                  await trx('plex_label_tracking')
                    .whereIn('id', toDelete)
                    .delete()
                  totalUpdated += toDelete.length
                }

                return {
                  plexRatingKey,
                  success: true,
                  updatedCount: totalUpdated,
                }
              } catch (error) {
                this.log.error(
                  `Failed to remove labels for rating key ${plexRatingKey}`,
                  { error, plexRatingKey, labelsToRemove },
                )
                return { plexRatingKey, success: false, updatedCount: 0 }
              }
            }),
          )

          for (const result of chunkResults) {
            if (result.success) {
              processedCount++
              if (result.updatedCount > 0) {
                this.log.debug(
                  `Updated ${result.updatedCount} tracking record(s) for rating key ${result.plexRatingKey}`,
                )
              }
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    }
  } catch (error) {
    this.log.error('Error in bulk label removal transaction', { error })
    return {
      processedCount: 0,
      failedIds: operations.map((op) => op.plexRatingKey),
    }
  }


  return { processedCount, failedIds }
}

/**
 * Removes tracking records for a specific label on a specific Plex rating key.
 *
 * Backward-compatible wrapper for removeTrackedLabels that processes a single operation.
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
  const result = await this.removeTrackedLabels([
    { plexRatingKey, labelsToRemove: [labelApplied] },
  ])

  if (result.failedIds.length > 0) {
    this.log.warn(
      `Failed to remove label "${labelApplied}" for rating key ${plexRatingKey}`,
    )
    return 0
  }

  // For backward compatibility, we need to return the actual count of updated records
  // Since we can't get that from the bulk operation result, we'll do a simple check
  const isPostgres = this.knex.client.config.client === 'pg'

  if (isPostgres) {
    const result = await this.knex.raw(
      `
      WITH updated_records AS (
        UPDATE plex_label_tracking 
        SET 
          labels_applied = (
            SELECT jsonb_agg(elem ORDER BY elem)
            FROM jsonb_array_elements_text(labels_applied) elem
            WHERE elem != ?
          ),
          synced_at = ?
        WHERE plex_rating_key = ?
          AND labels_applied ? ?
          AND jsonb_array_length(
            (SELECT jsonb_agg(elem ORDER BY elem)
             FROM jsonb_array_elements_text(labels_applied) elem
             WHERE elem != ?)
          ) > 0
        RETURNING id
      ),
      deleted_records AS (
        DELETE FROM plex_label_tracking
        WHERE plex_rating_key = ?
          AND labels_applied ? ?
          AND jsonb_array_length(
            (SELECT jsonb_agg(elem ORDER BY elem)
             FROM jsonb_array_elements_text(labels_applied) elem
             WHERE elem != ?)
          ) = 0
        RETURNING id
      )
      SELECT 
        (SELECT COUNT(*) FROM updated_records) as updated_count,
        (SELECT COUNT(*) FROM deleted_records) as deleted_count
    `,
      [
        labelApplied,
        this.timestamp,
        plexRatingKey,
        labelApplied,
        labelApplied,
        plexRatingKey,
        labelApplied,
        labelApplied,
      ],
    )

    const totalUpdated =
      (result.rows[0]?.updated_count || 0) +
      (result.rows[0]?.deleted_count || 0)

    if (totalUpdated > 0) {
      this.log.debug(
        `Updated ${totalUpdated} tracking record(s) to remove label "${labelApplied}" on rating key ${plexRatingKey}`,
      )
    }

    return totalUpdated
  }

  // SQLite: Use the original approach (JSON operations are more limited)
  const records = await this.knex('plex_label_tracking')
    .where('plex_rating_key', plexRatingKey)
    .select('*')

  const toUpdate: Array<{ id: number; labels: string[] }> = []
  const toDelete: number[] = []

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
        toDelete.push(record.id)
      } else {
        toUpdate.push({ id: record.id, labels: updatedLabels })
      }
    }
  }

  // Batch operations for SQLite
  let totalUpdated = 0

  if (toUpdate.length > 0) {
    await this.knex.transaction(async (trx) => {
      for (const item of toUpdate) {
        await trx('plex_label_tracking')
          .where('id', item.id)
          .update({
            labels_applied: JSON.stringify(item.labels.sort()),
            synced_at: this.timestamp,
          })
      }
    })
    totalUpdated += toUpdate.length
  }

  if (toDelete.length > 0) {
    await this.knex('plex_label_tracking').whereIn('id', toDelete).delete()
    totalUpdated += toDelete.length
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
 * Remove multiple tracking records in bulk operations for orphaned labels.
 *
 * Efficiently processes multiple orphaned label cleanup operations in batches.
 * For PostgreSQL, uses optimized CTE-based queries. For SQLite, processes operations
 * within chunked transactions for better performance.
 *
 * @param operations - Array of operations, each containing plexRatingKey and orphanedLabels
 * @returns Object with processedCount (successful operations) and failedIds (failed rating keys)
 */
export async function removeOrphanedTrackingBulk(
  this: DatabaseService,
  operations: Array<{ plexRatingKey: string; orphanedLabels: string[] }>,
): Promise<{ processedCount: number; failedIds: string[] }> {
  const failedIds: string[] = []
  let processedCount = 0

  if (operations.length === 0) {
    return { processedCount: 0, failedIds: [] }
  }

  this.log.debug(
    `removeOrphanedTrackingBulk: Processing ${operations.length} operations`,
    { operationsCount: operations.length },
  )

  const isPostgres = this.knex.client.config.client === 'pg'

  try {
    if (isPostgres) {
      // PostgreSQL: Process operations in chunks with efficient queries
      const chunks = this.chunkArray(operations, 50)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = await Promise.all(
            chunk.map(async ({ plexRatingKey, orphanedLabels }) => {
              try {
                if (orphanedLabels.length === 0) {
                  return { plexRatingKey, success: true, updatedCount: 0 }
                }

                const orphanedArray = JSON.stringify(orphanedLabels)

                const result = await trx.raw(
                  `
                  WITH updated_records AS (
                    UPDATE plex_label_tracking 
                    SET 
                      labels_applied = (
                        SELECT jsonb_agg(elem ORDER BY elem)
                        FROM jsonb_array_elements_text(labels_applied) elem
                        WHERE NOT (elem = ANY(SELECT jsonb_array_elements_text(?::jsonb)))
                      ),
                      synced_at = ?
                    WHERE plex_rating_key = ?
                      AND labels_applied ?| array(SELECT jsonb_array_elements_text(?::jsonb))
                      AND jsonb_array_length(
                        (SELECT jsonb_agg(elem ORDER BY elem)
                         FROM jsonb_array_elements_text(labels_applied) elem
                         WHERE NOT (elem = ANY(SELECT jsonb_array_elements_text(?::jsonb))))
                      ) > 0
                    RETURNING id
                  ),
                  deleted_records AS (
                    DELETE FROM plex_label_tracking
                    WHERE plex_rating_key = ?
                      AND labels_applied ?| array(SELECT jsonb_array_elements_text(?::jsonb))
                      AND jsonb_array_length(
                        (SELECT jsonb_agg(elem ORDER BY elem)
                         FROM jsonb_array_elements_text(labels_applied) elem
                         WHERE NOT (elem = ANY(SELECT jsonb_array_elements_text(?::jsonb))))
                      ) = 0
                    RETURNING id
                  )
                  SELECT 
                    (SELECT COUNT(*) FROM updated_records) as updated_count,
                    (SELECT COUNT(*) FROM deleted_records) as deleted_count
                  `,
                  [
                    orphanedArray,
                    this.timestamp,
                    plexRatingKey,
                    orphanedArray,
                    orphanedArray,
                    plexRatingKey,
                    orphanedArray,
                    orphanedArray,
                  ],
                )

                const totalUpdated =
                  (result.rows[0]?.updated_count || 0) +
                  (result.rows[0]?.deleted_count || 0)

                return {
                  plexRatingKey,
                  success: true,
                  updatedCount: totalUpdated,
                }
              } catch (error) {
                this.log.error(
                  `Failed to remove orphaned labels for rating key ${plexRatingKey}`,
                  { error, plexRatingKey, orphanedLabels },
                )
                return { plexRatingKey, success: false, updatedCount: 0 }
              }
            }),
          )

          for (const result of chunkResults) {
            if (result.success) {
              processedCount++
              if (result.updatedCount > 0) {
                this.log.debug(
                  `Updated ${result.updatedCount} tracking record(s) to remove orphaned labels for rating key ${result.plexRatingKey}`,
                )
              }
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    } else {
      // SQLite: Use chunked operations with Promise.all for better performance
      const chunks = this.chunkArray(operations, 50)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = await Promise.all(
            chunk.map(async ({ plexRatingKey, orphanedLabels }) => {
              try {
                if (orphanedLabels.length === 0) {
                  return { plexRatingKey, success: true, updatedCount: 0 }
                }

                const records = await trx('plex_label_tracking')
                  .where('plex_rating_key', plexRatingKey)
                  .select('*')

                const toUpdate: Array<{ id: number; labels: string[] }> = []
                const toDelete: number[] = []

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
                    if (updatedLabels.length === 0) {
                      toDelete.push(record.id)
                    } else {
                      toUpdate.push({ id: record.id, labels: updatedLabels })
                    }
                  }
                }

                let totalUpdated = 0

                // Process updates in parallel
                if (toUpdate.length > 0) {
                  await Promise.all(
                    toUpdate.map((item) =>
                      trx('plex_label_tracking')
                        .where('id', item.id)
                        .update({
                          labels_applied: JSON.stringify(item.labels.sort()),
                          synced_at: this.timestamp,
                        }),
                    ),
                  )
                  totalUpdated += toUpdate.length
                }

                if (toDelete.length > 0) {
                  await trx('plex_label_tracking')
                    .whereIn('id', toDelete)
                    .delete()
                  totalUpdated += toDelete.length
                }

                return {
                  plexRatingKey,
                  success: true,
                  updatedCount: totalUpdated,
                }
              } catch (error) {
                this.log.error(
                  `Failed to remove orphaned labels for rating key ${plexRatingKey}`,
                  { error, plexRatingKey, orphanedLabels },
                )
                return { plexRatingKey, success: false, updatedCount: 0 }
              }
            }),
          )

          for (const result of chunkResults) {
            if (result.success) {
              processedCount++
              if (result.updatedCount > 0) {
                this.log.debug(
                  `Updated ${result.updatedCount} tracking record(s) to remove orphaned labels for rating key ${result.plexRatingKey}`,
                )
              }
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    }
  } catch (error) {
    this.log.error('Error in bulk orphaned tracking removal transaction', {
      error,
    })
    return {
      processedCount: 0,
      failedIds: operations.map((op) => op.plexRatingKey),
    }
  }

  return { processedCount, failedIds }
}

/**
 * Remove multiple tracking records in a batch operation.
 *
 * Backward-compatible wrapper for removeOrphanedTrackingBulk that processes a single operation.
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

  const isPostgres = this.knex.client.config.client === 'pg'

  if (isPostgres) {
    // PostgreSQL: Use efficient JSON operations in a single query
    const orphanedArray = JSON.stringify(orphanedLabels)

    const result = await this.knex.raw(
      `
      WITH updated_records AS (
        UPDATE plex_label_tracking 
        SET 
          labels_applied = (
            SELECT jsonb_agg(elem ORDER BY elem)
            FROM jsonb_array_elements_text(labels_applied) elem
            WHERE NOT (elem = ANY(SELECT jsonb_array_elements_text(?::jsonb)))
          ),
          synced_at = ?
        WHERE plex_rating_key = ?
          AND labels_applied ?| array(SELECT jsonb_array_elements_text(?::jsonb))
          AND jsonb_array_length(
            (SELECT jsonb_agg(elem ORDER BY elem)
             FROM jsonb_array_elements_text(labels_applied) elem
             WHERE NOT (elem = ANY(SELECT jsonb_array_elements_text(?::jsonb))))
          ) > 0
        RETURNING id
      ),
      deleted_records AS (
        DELETE FROM plex_label_tracking
        WHERE plex_rating_key = ?
          AND labels_applied ?| array(SELECT jsonb_array_elements_text(?::jsonb))
          AND jsonb_array_length(
            (SELECT jsonb_agg(elem ORDER BY elem)
             FROM jsonb_array_elements_text(labels_applied) elem
             WHERE NOT (elem = ANY(SELECT jsonb_array_elements_text(?::jsonb))))
          ) = 0
        RETURNING id
      )
      SELECT 
        (SELECT COUNT(*) FROM updated_records) as updated_count,
        (SELECT COUNT(*) FROM deleted_records) as deleted_count
    `,
      [
        orphanedArray,
        this.timestamp,
        plexRatingKey,
        orphanedArray,
        orphanedArray,
        plexRatingKey,
        orphanedArray,
        orphanedArray,
      ],
    )

    const totalUpdated =
      (result.rows[0]?.updated_count || 0) +
      (result.rows[0]?.deleted_count || 0)

    if (totalUpdated > 0) {
      this.log.debug(
        `Updated ${totalUpdated} tracking record(s) to remove orphaned labels for rating key ${plexRatingKey}`,
        { orphanedLabels },
      )
    }

    return totalUpdated
  }

  // SQLite: Use batched approach (JSON operations are more limited)
  const records = await this.knex('plex_label_tracking')
    .where('plex_rating_key', plexRatingKey)
    .select('*')

  const toUpdate: Array<{ id: number; labels: string[] }> = []
  const toDelete: number[] = []

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
        toDelete.push(record.id)
      } else {
        toUpdate.push({ id: record.id, labels: updatedLabels })
      }
    }
  }

  // Batch operations for SQLite
  let totalUpdated = 0

  if (toUpdate.length > 0) {
    await this.knex.transaction(async (trx) => {
      for (const item of toUpdate) {
        await trx('plex_label_tracking')
          .where('id', item.id)
          .update({
            labels_applied: JSON.stringify(item.labels.sort()),
            synced_at: this.timestamp,
          })
      }
    })
    totalUpdated += toUpdate.length
  }

  if (toDelete.length > 0) {
    await this.knex('plex_label_tracking').whereIn('id', toDelete).delete()
    totalUpdated += toDelete.length
  }

  if (totalUpdated > 0) {
    this.log.debug(
      `Updated ${totalUpdated} tracking record(s) to remove orphaned labels for rating key ${plexRatingKey}`,
      { orphanedLabels },
    )
  }

  return totalUpdated
}
