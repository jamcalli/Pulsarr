import type { DatabaseService } from '@services/database.service.js'

/**
 * Batch chunk size for processing operations in chunks to avoid overwhelming the database
 */
const BATCH_CHUNK_SIZE = 50

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
 * Bulk creates or updates Plex label tracking records for multiple operations.
 *
 * Processes an array of label tracking operations, ensuring each operation either inserts a new record or updates an existing one with the specified labels and content GUIDs. Supports both PostgreSQL and SQLite backends with optimized, chunked transactions. Returns the number of successfully processed operations and an array of Plex rating keys that failed.
 *
 * @param operations - Array of label tracking operations to process in bulk
 * @returns An object with the count of successfully processed operations and an array of failed Plex rating keys
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
      const chunks = this.chunkArray(operations, BATCH_CHUNK_SIZE)

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
                const guidsJson = JSON.stringify(normalizedGuids)
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
      const chunks = this.chunkArray(operations, BATCH_CHUNK_SIZE)

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
                const guidsJson = JSON.stringify(normalizedGuids)
                const normalizedLabels = labelsApplied.map((l) =>
                  l.toLowerCase(),
                )
                const labelsJson = JSON.stringify(normalizedLabels.sort())

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
 * Creates or updates a Plex label tracking record for a user and content item, replacing any existing labels with the provided set.
 *
 * If a tracking record does not exist for the given user, content GUIDs, and Plex rating key, a new record is created; otherwise, the labels are updated. Returns the ID of the created or updated record.
 *
 * @param contentGuids - GUIDs identifying the content item
 * @param contentType - The type of content ('movie' or 'show')
 * @param userId - The user ID for whom labels are tracked
 * @param plexRatingKey - The Plex rating key of the content
 * @param labelsApplied - All labels to associate with this content for the user
 * @returns The ID of the created or updated tracking record
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
 * Removes a specified label from multiple Plex label tracking records in bulk.
 *
 * For each operation, removes the given label from matching records identified by user, rating key, and content GUIDs. If a record has no labels remaining after removal, it is deleted. Supports both PostgreSQL and SQLite backends with optimized, chunked processing.
 *
 * @param operations - The list of untracking operations to process
 * @returns An object containing the number of successfully processed operations and an array of rating keys for which untracking failed
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
      const chunks = this.chunkArray(operations, BATCH_CHUNK_SIZE)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = await Promise.all(
            chunk.map(async (operation) => {
              try {
                const { contentGuids, userId, plexRatingKey, labelApplied } =
                  operation

                // Handle empty arrays
                if (contentGuids.length === 0) {
                  throw new Error('Content GUIDs array cannot be empty')
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
      const chunks = this.chunkArray(operations, BATCH_CHUNK_SIZE)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = await Promise.all(
            chunk.map(async (operation) => {
              try {
                const { contentGuids, userId, plexRatingKey, labelApplied } =
                  operation

                // Handle empty arrays
                if (contentGuids.length === 0) {
                  throw new Error('Content GUIDs array cannot be empty')
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
 * Removes a specific label from the tracking record for the given user, content GUIDs, and Plex rating key.
 *
 * Deletes the tracking record if no labels remain after removal.
 *
 * @returns True if a record was updated or deleted; false if no matching record was found.
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
 * Retrieves all Plex label tracking records associated with a specific user.
 *
 * The results are ordered by the synchronization timestamp in ascending order.
 *
 * @param userId - The ID of the user whose tracked labels are being retrieved
 * @returns An array of PlexLabelTracking records for the user
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
 * Retrieves all Plex label tracking records for content matching any of the provided GUIDs and content type.
 *
 * Returns an array of tracking records across all users where the content GUIDs overlap with the specified list and match the given content type. If the GUID array is empty, returns an empty array.
 *
 * @param contentGuids - List of content GUIDs to match against tracked records
 * @param contentType - The type of content ('movie' or 'show')
 * @returns Array of Plex label tracking records for the specified content
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
 * Deletes all Plex label tracking records for a user that match the specified content GUIDs and content type.
 *
 * Typically used when a user removes content from their watchlist. No records are deleted if the content GUIDs array is empty.
 *
 * @param contentGuids - Content GUIDs to match for deletion
 * @param contentType - Content type ('movie' or 'show') to filter records
 * @param userId - User ID whose tracking records are targeted
 * @returns The number of tracking records deleted
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
 * Removes all Plex label tracking records associated with a specific user.
 *
 * @param userId - The ID of the user whose tracking records should be deleted
 * @returns The number of tracking records removed
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
 * Parses JSON fields into arrays and returns all records, ordered by user ID and synchronization time.
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
 * Returns all Plex label tracking records associated with the specified Plex rating key.
 *
 * @param plexRatingKey - The Plex rating key to query
 * @returns An array of Plex label tracking records for the given rating key
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
 * Deletes all Plex label tracking records associated with the specified Plex rating key.
 *
 * @param plexRatingKey - The Plex rating key whose tracking records should be deleted
 * @returns The number of records deleted
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
 * Checks if a specific label is tracked for the given user, content GUIDs, content type, and Plex rating key.
 *
 * Returns `true` if a tracking record exists that matches the user, content type, rating key, and contains both any of the provided content GUIDs and the specified label; otherwise, returns `false`.
 *
 * @returns True if the label is tracked for the specified user, content, and rating key; false otherwise.
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
 * Deletes all Plex label tracking records from the database.
 *
 * Removes all label tracking information for every user and content item.
 *
 * @returns The number of records deleted
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
 * Removes specified labels from tracking records for multiple Plex rating keys in bulk.
 *
 * For each operation, removes one or more labels from the tracked labels of the given rating key. If all labels are removed from a record, the record is deleted. Supports efficient batch processing for both PostgreSQL and SQLite databases.
 *
 * @param operations - List of operations, each specifying a Plex rating key and the labels to remove from its tracking record.
 * @returns An object containing the number of successfully processed operations, a list of rating keys for which removal failed, and the total number of records updated or deleted.
 */
export async function removeTrackedLabels(
  this: DatabaseService,
  operations: Array<{ plexRatingKey: string; labelsToRemove: string[] }>,
): Promise<{
  processedCount: number
  failedIds: string[]
  totalUpdatedCount: number
}> {
  const failedIds: string[] = []
  let processedCount = 0
  let totalUpdatedCount = 0

  if (operations.length === 0) {
    return { processedCount: 0, failedIds: [], totalUpdatedCount: 0 }
  }

  this.log.debug(
    `removeTrackedLabels: Processing ${operations.length} operations`,
    { operationsCount: operations.length },
  )

  try {
    if (this.isPostgres) {
      // PostgreSQL: Process operations individually with efficient queries
      const chunks = this.chunkArray(operations, BATCH_CHUNK_SIZE)

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
              totalUpdatedCount += result.updatedCount
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
      const chunks = this.chunkArray(operations, BATCH_CHUNK_SIZE)

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
              totalUpdatedCount += result.updatedCount
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
      totalUpdatedCount: 0,
    }
  }

  return { processedCount, failedIds, totalUpdatedCount }
}

/**
 * Removes a specific label from all tracking records associated with a given Plex rating key.
 *
 * Calls the bulk label removal operation for the specified label and rating key. Returns the number of records updated or deleted. Returns 0 if the operation fails.
 *
 * @param plexRatingKey - The Plex rating key from which to remove the label
 * @param labelApplied - The label to remove
 * @returns The number of tracking records updated or deleted, or 0 if the operation fails
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

  // Use the count information from the bulk operation result
  if (result.totalUpdatedCount > 0) {
    this.log.debug(
      `Updated ${result.totalUpdatedCount} tracking record(s) to remove label "${labelApplied}" on rating key ${plexRatingKey}`,
    )
  }

  return result.totalUpdatedCount
}

/**
 * Returns tracking records that contain labels with the specified prefix which are not present in the set of valid labels.
 *
 * @param validLabels - Set of currently valid user labels (in lowercase)
 * @param labelPrefix - Prefix used to identify app-managed labels (e.g., "pulsarr")
 * @returns Array of objects, each with a Plex rating key and its orphaned labels
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
 * Removes orphaned labels from multiple Plex label tracking records in bulk.
 *
 * For each operation, removes the specified orphaned labels from tracking records associated with the given Plex rating key. Records are updated or deleted as needed, using optimized queries for PostgreSQL and chunked transactions for SQLite.
 *
 * @param operations - Array of operations, each containing a Plex rating key and a list of orphaned labels to remove
 * @returns An object containing the number of successfully processed operations, an array of rating keys that failed, and the total number of records updated or deleted
 */
export async function removeOrphanedTrackingBulk(
  this: DatabaseService,
  operations: Array<{ plexRatingKey: string; orphanedLabels: string[] }>,
): Promise<{
  processedCount: number
  failedIds: string[]
  totalUpdatedCount: number
}> {
  const failedIds: string[] = []
  let processedCount = 0
  let totalUpdatedCount = 0

  if (operations.length === 0) {
    return { processedCount: 0, failedIds: [], totalUpdatedCount: 0 }
  }

  this.log.debug(
    `removeOrphanedTrackingBulk: Processing ${operations.length} operations`,
    { operationsCount: operations.length },
  )

  try {
    if (this.isPostgres) {
      // PostgreSQL: Process operations in chunks with efficient queries
      const chunks = this.chunkArray(operations, BATCH_CHUNK_SIZE)

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
              totalUpdatedCount += result.updatedCount
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
      const chunks = this.chunkArray(operations, BATCH_CHUNK_SIZE)

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
              totalUpdatedCount += result.updatedCount
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
      totalUpdatedCount: 0,
    }
  }

  return { processedCount, failedIds, totalUpdatedCount }
}

/**
 * Removes specified orphaned labels from the tracking record for a given Plex rating key.
 *
 * Returns the number of records updated or deleted. If no orphaned labels are provided or the operation fails, returns 0.
 *
 * @param plexRatingKey - The Plex rating key whose tracking record will be updated
 * @param orphanedLabels - The orphaned label names to remove from the tracking record
 * @returns The number of tracking records updated or deleted
 */
export async function removeOrphanedTracking(
  this: DatabaseService,
  plexRatingKey: string,
  orphanedLabels: string[],
): Promise<number> {
  if (orphanedLabels.length === 0) {
    return 0
  }

  const result = await this.removeOrphanedTrackingBulk([
    { plexRatingKey, orphanedLabels },
  ])

  if (result.failedIds.length > 0) {
    this.log.warn(
      `Failed to remove orphaned labels for rating key ${plexRatingKey}`,
      { orphanedLabels },
    )
    return 0
  }

  // Use the count information from the bulk operation result
  if (result.totalUpdatedCount > 0) {
    this.log.debug(
      `Updated ${result.totalUpdatedCount} tracking record(s) to remove orphaned labels for rating key ${plexRatingKey}`,
      { orphanedLabels },
    )
  }

  return result.totalUpdatedCount
}
