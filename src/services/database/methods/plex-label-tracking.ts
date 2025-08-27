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
  user_id: number | null
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
  user_id: number | null
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
  userId: number | null
  plexRatingKey: string
  labelsApplied: string[]
}

/**
 * Bulk operation for untracking Plex labels
 */
export interface UntrackPlexLabelOperation {
  contentGuids: string[]
  userId: number | null
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
 * Processes an array of label tracking operations, ensuring each operation either inserts a new record or updates an existing one with the provided labels and content GUIDs. Supports both PostgreSQL and SQLite backends with optimized, chunked transactions. Returns the number of successfully processed operations and a list of Plex rating keys that failed to process.
 *
 * @param operations - The label tracking operations to process in bulk
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
          const chunkResults = []
          for (const operation of chunk) {
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

              const normalizedGuids = Array.from(
                new Set(contentGuids.map((g) => g.toLowerCase())),
              )
              const guidsJson = JSON.stringify(normalizedGuids)
              const labelsJson = JSON.stringify(
                Array.from(
                  new Set(labelsApplied.map((l) => l.toLowerCase())),
                ).sort(),
              )

              // Use PostgreSQL-specific atomic upsert with unique constraint
              this.log.debug('Executing PostgreSQL upsert', {
                guidsJson,
                contentType,
                userId,
                plexRatingKey,
                labelsJson,
                timestamp: this.timestamp,
              })

              const result = await trx.raw(
                `
                  INSERT INTO plex_label_tracking (
                    content_guids,
                    content_type,
                    user_id,
                    plex_rating_key,
                    labels_applied,
                    synced_at
                  )
                  VALUES (?::jsonb, ?, ?, ?, ?::jsonb, ?)
                  ON CONFLICT (md5(content_guids::text), user_id, content_type)
                  DO UPDATE SET
                    content_guids = excluded.content_guids,
                    plex_rating_key = excluded.plex_rating_key,
                    labels_applied = excluded.labels_applied,
                    synced_at = excluded.synced_at
                  RETURNING id AS record_id
                `,
                [
                  guidsJson,
                  contentType,
                  userId,
                  plexRatingKey,
                  labelsJson,
                  this.timestamp,
                ],
              )

              this.log.debug('PostgreSQL upsert result', {
                rows: result.rows,
                rowCount: result.rowCount,
                recordId: result.rows[0]?.record_id,
              })

              chunkResults.push({
                plexRatingKey,
                success: true,
                recordId: result.rows[0]?.record_id || null,
              })
            } catch (error) {
              this.log.error('Failed to track labels for operation', {
                error,
                operation,
              })
              chunkResults.push({
                plexRatingKey: operation.plexRatingKey,
                success: false,
                recordId: null,
              })
            }
          }

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
          const chunkResults = []
          for (const operation of chunk) {
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

              const normalizedGuids = Array.from(
                new Set(contentGuids.map((g) => g.toLowerCase())),
              )
              const guidsJson = JSON.stringify(normalizedGuids)
              const normalizedLabels = Array.from(
                new Set(labelsApplied.map((l) => l.toLowerCase())),
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

              chunkResults.push({
                plexRatingKey,
                success: true,
                recordId,
              })
            } catch (error) {
              this.log.error('Failed to track labels for operation', {
                error,
                operation,
              })
              chunkResults.push({
                plexRatingKey: operation.plexRatingKey,
                success: false,
                recordId: null,
              })
            }
          }

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
 * After updating the tracking record, returns its unique database ID. Throws an error if the operation fails or the record cannot be retrieved.
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
  userId: number | null,
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
  const normalizedGuids = Array.from(
    new Set(contentGuids.map((g) => g.toLowerCase())),
  )

  const record = this.isPostgres
    ? await this.knex('plex_label_tracking')
        .where('user_id', userId)
        .where('content_type', contentType)
        .where('plex_rating_key', plexRatingKey)
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(content_guids) elem WHERE lower(elem) = ANY(?))',
          [normalizedGuids],
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
        .first()

  if (!record) {
    throw new Error('Failed to retrieve tracking record after creation')
  }

  return record.id
}

/**
 * Removes a specified label from multiple Plex label tracking records in bulk.
 *
 * For each operation, removes the given label from matching records identified by user, rating key, and overlapping content GUIDs. If a record has no labels remaining after removal, it is deleted. Supports both PostgreSQL and SQLite backends with chunked transactions for efficiency.
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
          const chunkResults = []
          for (const operation of chunk) {
            try {
              const { contentGuids, userId, plexRatingKey, labelApplied } =
                operation
              const labelLower = labelApplied.toLowerCase()

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
                      labels_applied = COALESCE(
                        (SELECT jsonb_agg(elem ORDER BY elem)
                         FROM jsonb_array_elements_text(labels_applied) elem
                         WHERE lower(elem) != ?),
                        '[]'::jsonb
                      ),
                      synced_at = ?
                    WHERE user_id = ?
                      AND plex_rating_key = ?
                      AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(content_guids) elem 
                        WHERE lower(elem) = ANY(?)
                      )
                      AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(labels_applied) label WHERE lower(label) = ?)
                      AND jsonb_array_length(
                        COALESCE(
                          (SELECT jsonb_agg(elem ORDER BY elem)
                           FROM jsonb_array_elements_text(labels_applied) elem
                           WHERE lower(elem) != ?),
                          '[]'::jsonb
                        )
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
                      AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(labels_applied) label WHERE lower(label) = ?)
                      AND jsonb_array_length(
                        COALESCE(
                          (SELECT jsonb_agg(elem ORDER BY elem)
                           FROM jsonb_array_elements_text(labels_applied) elem
                           WHERE lower(elem) != ?),
                          '[]'::jsonb
                        )
                      ) = 0
                    RETURNING id
                  )
                  SELECT 
                    (SELECT COUNT(*) FROM updated_records) as updated_count,
                    (SELECT COUNT(*) FROM deleted_records) as deleted_count
                  `,
                [
                  labelLower,
                  this.timestamp,
                  userId,
                  plexRatingKey,
                  normalizedGuids,
                  labelLower,
                  labelLower,
                  userId,
                  plexRatingKey,
                  normalizedGuids,
                  labelLower,
                  labelLower,
                ],
              )

              const updatedCount = Number(result.rows[0]?.updated_count ?? 0)
              const deletedCount = Number(result.rows[0]?.deleted_count ?? 0)
              const totalUpdated = updatedCount + deletedCount

              chunkResults.push({
                plexRatingKey,
                success: true,
                updatedCount: totalUpdated,
              })
            } catch (error) {
              this.log.error('Failed to untrack label for operation', {
                error,
                operation,
              })
              chunkResults.push({
                plexRatingKey: operation.plexRatingKey,
                success: false,
                updatedCount: 0,
              })
            }
          }

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
          const chunkResults = []
          for (const operation of chunk) {
            try {
              const { contentGuids, userId, plexRatingKey, labelApplied } =
                operation
              const labelLower = labelApplied.toLowerCase()

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
                chunkResults.push({
                  plexRatingKey,
                  success: false,
                  updatedCount: 0,
                })
                continue
              }

              // Parse existing labels and remove the specified one
              const currentLabels = this.safeJsonParse<string[]>(
                existing.labels_applied,
                [],
                'plex_label_tracking.labels_applied',
              )
              const updatedLabels = currentLabels.filter(
                (label) => label.toLowerCase() !== labelLower,
              )

              // If no labels remain, delete the record
              if (updatedLabels.length === 0) {
                const deleted = await trx('plex_label_tracking')
                  .where('id', existing.id)
                  .delete()
                chunkResults.push({
                  plexRatingKey,
                  success: true,
                  updatedCount: deleted,
                })
                continue
              }

              // Otherwise, update with remaining labels
              await trx('plex_label_tracking')
                .where('id', existing.id)
                .update({
                  labels_applied: JSON.stringify(updatedLabels.sort()),
                  synced_at: this.timestamp,
                })

              chunkResults.push({
                plexRatingKey,
                success: true,
                updatedCount: 1,
              })
            } catch (error) {
              this.log.error('Failed to untrack label for operation', {
                error,
                operation,
              })
              chunkResults.push({
                plexRatingKey: operation.plexRatingKey,
                success: false,
                updatedCount: 0,
              })
            }
          }

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
 * Removes a specific label from a user's tracking record for the given content GUIDs and Plex rating key.
 *
 * Deletes the tracking record if no labels remain after removal.
 *
 * @param contentGuids - The content GUIDs to remove the label from
 * @param userId - The user whose label tracking is being modified
 * @param plexRatingKey - The Plex rating key associated with the content
 * @param labelApplied - The label to remove
 * @returns True if a tracking record was updated or deleted; false if no matching record was found
 */
export async function untrackPlexLabel(
  this: DatabaseService,
  contentGuids: string[],
  userId: number | null,
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
 * Retrieves all label tracking records for a given user, ordered by synchronization time.
 *
 * @param userId - The ID of the user whose label tracking records are to be fetched
 * @returns An array of PlexLabelTracking objects representing the user's tracked labels
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
 * Typically used when a user removes content from their watchlist. If the `contentGuids` array is empty, no records are deleted.
 *
 * @param contentGuids - Array of content GUIDs to match for deletion
 * @param contentType - The content type ('movie' or 'show') to filter records
 * @param userId - The user ID whose tracking records should be deleted
 * @returns The number of tracking records deleted
 */
export async function cleanupUserContentTracking(
  this: DatabaseService,
  contentGuids: string[],
  contentType: 'movie' | 'show',
  userId: number | null,
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
 * Removes all Plex label tracking records associated with a given user.
 *
 * @param userId - The ID of the user whose label tracking records should be deleted
 * @returns The count of records removed from the database
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
 * Retrieves all Plex label tracking records from the database, ordered by user ID and synchronization time.
 *
 * Parses JSON fields into arrays for each record.
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
 * Retrieves all Plex label tracking records associated with the specified rating key.
 *
 * @param plexRatingKey - The Plex rating key to filter tracking records by
 * @returns An array of parsed Plex label tracking records for the given rating key
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
 * Deletes all label tracking records associated with a specific Plex rating key.
 *
 * Typically used to remove tracking data when content is deleted or during maintenance operations.
 *
 * @param plexRatingKey - The Plex rating key whose tracking records should be deleted
 * @returns The number of tracking records removed
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
 * Checks if a specific label is tracked for a user, content GUIDs, content type, and Plex rating key.
 *
 * Returns `true` if a tracking record exists that matches the user, content type, rating key, and contains both any of the provided content GUIDs and the specified label; otherwise, returns `false`.
 *
 * @param contentGuids - List of content GUIDs to check for label tracking
 * @param contentType - The type of content ('movie' or 'show')
 * @param userId - The user ID to check tracking for
 * @param plexRatingKey - The Plex rating key associated with the content
 * @param labelApplied - The label to check for tracking
 * @returns True if the label is tracked for the specified user, content GUIDs, content type, and rating key; false otherwise
 */
export async function isLabelTracked(
  this: DatabaseService,
  contentGuids: string[],
  contentType: 'movie' | 'show',
  userId: number | null,
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
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(labels_applied) label WHERE lower(label) = ?)',
          [labelApplied.toLowerCase()],
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
          "EXISTS (SELECT 1 FROM json_each(labels_applied) WHERE json_each.type = 'text' AND lower(json_each.value) = ?)",
          [labelApplied.toLowerCase()],
        )
        .first()

  return !!record
}

/**
 * Removes all Plex label tracking records from the database.
 *
 * This operation erases all label tracking information for every user and all content.
 *
 * @returns The total number of records deleted
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
          const chunkResults = []
          for (const { plexRatingKey, labelsToRemove } of chunk) {
            try {
              // Convert labels to remove to JSON for bulk processing
              const labelsJson = JSON.stringify(
                labelsToRemove.map((l) => l.toLowerCase()),
              )

              const result = await trx.raw(
                `
                  WITH updated_records AS (
                    UPDATE plex_label_tracking
                    SET
                      labels_applied = COALESCE(
                        (SELECT jsonb_agg(elem ORDER BY elem)
                         FROM jsonb_array_elements_text(labels_applied) elem
                         WHERE NOT (lower(elem) = ANY(SELECT jsonb_array_elements_text(?::jsonb)))),
                        '[]'::jsonb
                      ),
                      synced_at = ?
                    WHERE plex_rating_key = ?
                      AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(labels_applied) label
                        WHERE lower(label) = ANY(SELECT lower(elem) FROM jsonb_array_elements_text(?::jsonb) elem)
                      )
                      AND jsonb_array_length(
                        COALESCE(
                          (SELECT jsonb_agg(elem ORDER BY elem)
                           FROM jsonb_array_elements_text(labels_applied) elem
                           WHERE NOT (lower(elem) = ANY(SELECT jsonb_array_elements_text(?::jsonb)))),
                          '[]'::jsonb
                        )
                      ) > 0
                    RETURNING id
                  ),
                  deleted_records AS (
                    DELETE FROM plex_label_tracking
                    WHERE plex_rating_key = ?
                      AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(labels_applied) label
                        WHERE lower(label) = ANY(SELECT lower(elem) FROM jsonb_array_elements_text(?::jsonb) elem)
                      )
                      AND jsonb_array_length(
                        COALESCE(
                          (SELECT jsonb_agg(elem ORDER BY elem)
                           FROM jsonb_array_elements_text(labels_applied) elem
                           WHERE NOT (lower(elem) = ANY(SELECT jsonb_array_elements_text(?::jsonb)))),
                          '[]'::jsonb
                        )
                      ) = 0
                    RETURNING id
                  )
                  SELECT 
                    (SELECT COUNT(*) FROM updated_records) as updated_count,
                    (SELECT COUNT(*) FROM deleted_records) as deleted_count
                  `,
                [
                  labelsJson,
                  this.timestamp,
                  plexRatingKey,
                  labelsJson,
                  labelsJson,
                  plexRatingKey,
                  labelsJson,
                  labelsJson,
                ],
              )

              const updatedCount = Number(result.rows[0]?.updated_count ?? 0)
              const deletedCount = Number(result.rows[0]?.deleted_count ?? 0)
              const totalUpdated = updatedCount + deletedCount

              chunkResults.push({
                plexRatingKey,
                success: true,
                updatedCount: totalUpdated,
              })
            } catch (error) {
              this.log.error(
                { error, plexRatingKey, labelsToRemove },
                `Failed to remove labels for rating key ${plexRatingKey}`,
              )
              chunkResults.push({
                plexRatingKey,
                success: false,
                updatedCount: 0,
              })
            }
          }

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
      // SQLite: Use chunked operations with serial processing for transaction consistency
      const chunks = this.chunkArray(operations, BATCH_CHUNK_SIZE)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = []
          for (const { plexRatingKey, labelsToRemove } of chunk) {
            try {
              const records = await trx('plex_label_tracking')
                .where('plex_rating_key', plexRatingKey)
                .select('*')
              const toRemove = new Set(
                labelsToRemove.map((l) => l.toLowerCase()),
              )

              const toUpdate: Array<{ id: number; labels: string[] }> = []
              const toDelete: number[] = []

              for (const record of records) {
                const labels = this.safeJsonParse<string[]>(
                  record.labels_applied,
                  [],
                  'plex_label_tracking.labels_applied',
                )
                const updatedLabels = labels.filter(
                  (label) => !toRemove.has(label.toLowerCase()),
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

              // Process updates serially
              if (toUpdate.length > 0) {
                for (const item of toUpdate) {
                  await trx('plex_label_tracking')
                    .where('id', item.id)
                    .update({
                      labels_applied: JSON.stringify(item.labels.sort()),
                      synced_at: this.timestamp,
                    })
                }
                totalUpdated += toUpdate.length
              }

              if (toDelete.length > 0) {
                await trx('plex_label_tracking')
                  .whereIn('id', toDelete)
                  .delete()
                totalUpdated += toDelete.length
              }

              chunkResults.push({
                plexRatingKey,
                success: true,
                updatedCount: totalUpdated,
              })
            } catch (error) {
              this.log.error(
                { error, plexRatingKey, labelsToRemove },
                `Failed to remove labels for rating key ${plexRatingKey}`,
              )
              chunkResults.push({
                plexRatingKey,
                success: false,
                updatedCount: 0,
              })
            }
          }

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
 * Invokes the bulk label removal operation for the specified label and rating key, and returns the number of records that were updated or deleted as a result.
 *
 * @param plexRatingKey - The Plex rating key from which to remove the label
 * @param labelApplied - The label to remove from tracking records
 * @returns The number of tracking records updated or deleted
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
 * Finds Plex label tracking records that contain labels with a specified prefix which are not present in the current set of valid labels.
 *
 * For each record, identifies labels starting with the given prefix that are considered "orphaned" (i.e., not in the provided set of valid labels), and groups them by Plex rating key.
 *
 * @param validLabels - Set of valid labels (lowercase) to compare against
 * @param labelPrefix - Prefix identifying app-managed labels (e.g., "pulsarr")
 * @returns An array of objects, each containing a Plex rating key and its orphaned labels
 */
export async function getOrphanedLabelTracking(
  this: DatabaseService,
  validLabels: Set<string>,
  labelPrefix: string,
): Promise<Array<{ plex_rating_key: string; orphaned_labels: string[] }>> {
  // Pre-filter records to only those that have labels with our prefix
  const prefix = `${labelPrefix.toLowerCase()}:%`

  const filteredRecords = this.isPostgres
    ? await this.knex('plex_label_tracking')
        .select('plex_rating_key', 'labels_applied')
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(labels_applied) l WHERE l ILIKE ?)',
          [prefix],
        )
        .orderBy('plex_rating_key')
    : await this.knex('plex_label_tracking')
        .select('plex_rating_key', 'labels_applied')
        .whereRaw(
          "EXISTS (SELECT 1 FROM json_each(labels_applied) WHERE json_each.type='text' AND lower(json_each.value) LIKE ?)",
          [prefix],
        )
        .orderBy('plex_rating_key')

  if (filteredRecords.length === 0) {
    return []
  }

  // Group by rating key and filter for orphaned labels
  const orphanedByRatingKey = new Map<string, string[]>()

  for (const record of filteredRecords) {
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
 * For each operation, removes the specified orphaned labels from all tracking records associated with the given Plex rating key. If a record has no labels remaining after removal, it is deleted. Supports both PostgreSQL and SQLite backends with optimized, chunked processing.
 *
 * @param operations - Array of operations, each containing a Plex rating key and a list of orphaned labels to remove
 * @returns An object containing the number of successfully processed operations, an array of rating keys for which removal failed, and the total number of records updated or deleted
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
          const chunkResults = []
          for (const { plexRatingKey, orphanedLabels } of chunk) {
            try {
              if (orphanedLabels.length === 0) {
                chunkResults.push({
                  plexRatingKey,
                  success: true,
                  updatedCount: 0,
                })
                continue
              }

              const orphanedArray = JSON.stringify(
                orphanedLabels.map((l) => l.toLowerCase()),
              )

              const result = await trx.raw(
                `
                  WITH updated_records AS (
                    UPDATE plex_label_tracking 
                    SET 
                      labels_applied = COALESCE(
                        (SELECT jsonb_agg(elem ORDER BY elem)
                         FROM jsonb_array_elements_text(labels_applied) elem
                         WHERE NOT (lower(elem) = ANY(SELECT jsonb_array_elements_text(?::jsonb)))),
                        '[]'::jsonb
                      ),
                      synced_at = ?
                    WHERE plex_rating_key = ?
                      AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(labels_applied) label
                        WHERE lower(label) = ANY(SELECT lower(elem) FROM jsonb_array_elements_text(?::jsonb) elem)
                      )
                      AND jsonb_array_length(
                        COALESCE(
                          (SELECT jsonb_agg(elem ORDER BY elem)
                           FROM jsonb_array_elements_text(labels_applied) elem
                           WHERE NOT (lower(elem) = ANY(SELECT jsonb_array_elements_text(?::jsonb)))),
                          '[]'::jsonb
                        )
                      ) > 0
                    RETURNING id
                  ),
                  deleted_records AS (
                    DELETE FROM plex_label_tracking
                    WHERE plex_rating_key = ?
                      AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(labels_applied) label
                        WHERE lower(label) = ANY(SELECT lower(elem) FROM jsonb_array_elements_text(?::jsonb) elem)
                      )
                      AND jsonb_array_length(
                        COALESCE(
                          (SELECT jsonb_agg(elem ORDER BY elem)
                           FROM jsonb_array_elements_text(labels_applied) elem
                           WHERE NOT (lower(elem) = ANY(SELECT jsonb_array_elements_text(?::jsonb)))),
                          '[]'::jsonb
                        )
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

              const updatedCount = Number(result.rows[0]?.updated_count ?? 0)
              const deletedCount = Number(result.rows[0]?.deleted_count ?? 0)
              const totalUpdated = updatedCount + deletedCount

              chunkResults.push({
                plexRatingKey,
                success: true,
                updatedCount: totalUpdated,
              })
            } catch (error) {
              this.log.error(
                `Failed to remove orphaned labels for rating key ${plexRatingKey}`,
                { error, plexRatingKey, orphanedLabels },
              )
              chunkResults.push({
                plexRatingKey,
                success: false,
                updatedCount: 0,
              })
            }
          }

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
      // SQLite: Use chunked operations with serial processing for transaction consistency
      const chunks = this.chunkArray(operations, BATCH_CHUNK_SIZE)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = []
          for (const { plexRatingKey, orphanedLabels } of chunk) {
            try {
              if (orphanedLabels.length === 0) {
                chunkResults.push({
                  plexRatingKey,
                  success: true,
                  updatedCount: 0,
                })
                continue
              }

              const records = await trx('plex_label_tracking')
                .where('plex_rating_key', plexRatingKey)
                .select('*')
              const toRemove = new Set(
                orphanedLabels.map((l) => l.toLowerCase()),
              )

              const toUpdate: Array<{ id: number; labels: string[] }> = []
              const toDelete: number[] = []

              for (const record of records) {
                const labels = this.safeJsonParse<string[]>(
                  record.labels_applied,
                  [],
                  'plex_label_tracking.labels_applied',
                )
                const updatedLabels = labels.filter(
                  (label) => !toRemove.has(label.toLowerCase()),
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

              // Process updates serially
              if (toUpdate.length > 0) {
                for (const item of toUpdate) {
                  await trx('plex_label_tracking')
                    .where('id', item.id)
                    .update({
                      labels_applied: JSON.stringify(item.labels.sort()),
                      synced_at: this.timestamp,
                    })
                }
                totalUpdated += toUpdate.length
              }

              if (toDelete.length > 0) {
                await trx('plex_label_tracking')
                  .whereIn('id', toDelete)
                  .delete()
                totalUpdated += toDelete.length
              }

              chunkResults.push({
                plexRatingKey,
                success: true,
                updatedCount: totalUpdated,
              })
            } catch (error) {
              this.log.error(
                `Failed to remove orphaned labels for rating key ${plexRatingKey}`,
                { error, plexRatingKey, orphanedLabels },
              )
              chunkResults.push({
                plexRatingKey,
                success: false,
                updatedCount: 0,
              })
            }
          }

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
 * Removes specified orphaned labels from a tracking record for a given Plex rating key.
 *
 * Returns the number of tracking records updated or deleted. If no orphaned labels are provided or the operation fails, returns 0.
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
