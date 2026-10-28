import type { DatabaseService } from '@services/database.service.js'
import { chunkArray } from '@utils/chunk-array.js'
import { parseJsonOr } from '@utils/json.js'

const BATCH_CHUNK_SIZE = 50

interface PlexLabelTrackingRow {
  id: number
  content_guids: string // JSON string that gets parsed to string[]
  content_type: 'movie' | 'show'
  user_id: number | null
  plex_rating_key: string
  labels_applied: string // JSON string that gets parsed to string[]
  synced_at: string
}

export interface PlexLabelTracking {
  id: number
  content_guids: string[]
  content_type: 'movie' | 'show'
  user_id: number | null
  plex_rating_key: string
  labels_applied: string[]
  synced_at: string
}

export interface TrackPlexLabelsOperation {
  contentGuids: string[]
  contentType: 'movie' | 'show'
  userId: number | null
  plexRatingKey: string
  labelsApplied: string[]
}

export interface UntrackPlexLabelOperation {
  contentGuids: string[]
  userId: number | null
  plexRatingKey: string
  labelApplied: string
}

export interface BulkOperationResult {
  processedCount: number
  failedIds: string[]
}

/** Replaces the full label set per operation, and a transaction error reports every rating key as failed. */
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
    { operationsCount: operations.length },
    `trackPlexLabelsBulk: Processing ${operations.length} operations`,
  )

  try {
    if (this.isPostgres) {
      const chunks = chunkArray(operations, BATCH_CHUNK_SIZE)

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

              this.log.debug(
                {
                  guidsJson,
                  contentType,
                  userId,
                  plexRatingKey,
                  labelsJson,
                  timestamp: this.timestamp,
                },
                'Executing PostgreSQL upsert',
              )

              // Conflict target must match the plex_label_tracking_content_unique expression index exactly
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
                  ON CONFLICT (md5(content_guids::text), COALESCE(user_id, -1), content_type, plex_rating_key)
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

              this.log.debug(
                {
                  rows: result.rows,
                  rowCount: result.rowCount,
                  recordId: result.rows[0]?.record_id,
                },
                'PostgreSQL upsert result',
              )

              chunkResults.push({
                plexRatingKey,
                success: true,
                recordId: result.rows[0]?.record_id || null,
              })
            } catch (error) {
              this.log.error(
                {
                  error,
                  operation,
                },
                'Failed to track labels for operation',
              )
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
                { recordId: result.recordId },
                `Tracked labels for rating key ${result.plexRatingKey}`,
              )
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    } else {
      const chunks = chunkArray(operations, BATCH_CHUNK_SIZE)

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
              this.log.error(
                {
                  error,
                  operation,
                },
                'Failed to track labels for operation',
              )
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
                { recordId: result.recordId },
                `Tracked labels for rating key ${result.plexRatingKey}`,
              )
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    }
  } catch (error) {
    this.log.error({ error }, 'Error in bulk label tracking transaction')
    return {
      processedCount: 0,
      failedIds: operations.map((op) => op.plexRatingKey),
    }
  }

  return { processedCount, failedIds }
}

/** Replaces the labels for this content and user, returns the row id, and throws when tracking fails. */
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

/** Deletes a record once its last label is removed. */
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
    { operationsCount: operations.length },
    `untrackPlexLabelBulk: Processing ${operations.length} operations`,
  )

  try {
    if (this.isPostgres) {
      const chunks = chunkArray(operations, BATCH_CHUNK_SIZE)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = []
          for (const operation of chunk) {
            try {
              const { contentGuids, userId, plexRatingKey, labelApplied } =
                operation
              const labelLower = labelApplied.toLowerCase()

              if (contentGuids.length === 0) {
                throw new Error('Content GUIDs array cannot be empty')
              }

              const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

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
                    WHERE user_id IS NOT DISTINCT FROM ?
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
                    WHERE user_id IS NOT DISTINCT FROM ?
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
              this.log.error(
                {
                  error,
                  operation,
                },
                'Failed to untrack label for operation',
              )
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
                { updatedCount: result.updatedCount },
                `Untracked label for rating key ${result.plexRatingKey}`,
              )
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    } else {
      const chunks = chunkArray(operations, BATCH_CHUNK_SIZE)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = []
          for (const operation of chunk) {
            try {
              const { contentGuids, userId, plexRatingKey, labelApplied } =
                operation
              const labelLower = labelApplied.toLowerCase()

              if (contentGuids.length === 0) {
                throw new Error('Content GUIDs array cannot be empty')
              }

              const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

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

              const currentLabels = parseJsonOr<string[]>(
                existing.labels_applied,
                [],
                this.log,
                'plex_label_tracking.labels_applied',
              )
              const updatedLabels = currentLabels.filter(
                (label) => label.toLowerCase() !== labelLower,
              )

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
              this.log.error(
                {
                  error,
                  operation,
                },
                'Failed to untrack label for operation',
              )
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
                { updatedCount: result.updatedCount },
                `Untracked label for rating key ${result.plexRatingKey}`,
              )
            } else {
              failedIds.push(result.plexRatingKey)
            }
          }
        })
      }
    }
  } catch (error) {
    this.log.error({ error }, 'Error in bulk label untracking transaction')
    return {
      processedCount: 0,
      failedIds: operations.map((op) => op.plexRatingKey),
    }
  }

  return { processedCount, failedIds }
}

/** Spans all users, matching records that share any of the GUIDs. */
export async function getTrackedLabelsForContent(
  this: DatabaseService,
  contentGuids: string[],
  contentType: 'movie' | 'show',
): Promise<PlexLabelTracking[]> {
  if (contentGuids.length === 0) {
    this.log.warn(
      'getTrackedLabelsForContent: Empty content GUIDs array provided',
    )
    return []
  }

  const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

  this.log.debug(
    {
      contentType,
      normalizedGuids,
    },
    'getTrackedLabelsForContent: Searching for records',
  )

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
    content_guids: parseJsonOr<string[]>(
      row.content_guids,
      [],
      this.log,
      'plex_label_tracking.content_guids',
    ),
    content_type: row.content_type,
    user_id: row.user_id,
    plex_rating_key: row.plex_rating_key,
    labels_applied: parseJsonOr<string[]>(
      row.labels_applied,
      [],
      this.log,
      'plex_label_tracking.labels_applied',
    ),
    synced_at: row.synced_at,
  }))
}

/** Matches GUIDs case-insensitively, and a null userId targets rows with no user. */
export async function cleanupUserContentTracking(
  this: DatabaseService,
  contentGuids: string[],
  contentType: 'movie' | 'show',
  userId: number | null,
): Promise<number> {
  if (contentGuids.length === 0) {
    this.log.warn(
      'cleanupUserContentTracking: Empty content GUIDs array provided',
    )
    return 0
  }

  const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

  this.log.debug(
    {
      userId,
      contentType,
      normalizedGuids,
    },
    'cleanupUserContentTracking: Deleting records',
  )

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

export async function getAllTrackedLabels(
  this: DatabaseService,
): Promise<PlexLabelTracking[]> {
  const rows = (await this.knex('plex_label_tracking')
    .orderBy(['user_id', 'synced_at'])
    .select('*')) as PlexLabelTrackingRow[]

  return rows.map((row) => ({
    id: row.id,
    content_guids: parseJsonOr<string[]>(
      row.content_guids,
      [],
      this.log,
      'plex_label_tracking.content_guids',
    ),
    content_type: row.content_type,
    user_id: row.user_id,
    plex_rating_key: row.plex_rating_key,
    labels_applied: parseJsonOr<string[]>(
      row.labels_applied,
      [],
      this.log,
      'plex_label_tracking.labels_applied',
    ),
    synced_at: row.synced_at,
  }))
}

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
    content_guids: parseJsonOr<string[]>(
      row.content_guids,
      [],
      this.log,
      'plex_label_tracking.content_guids',
    ),
    content_type: row.content_type,
    user_id: row.user_id,
    plex_rating_key: row.plex_rating_key,
    labels_applied: parseJsonOr<string[]>(
      row.labels_applied,
      [],
      this.log,
      'plex_label_tracking.labels_applied',
    ),
    synced_at: row.synced_at,
  }))
}

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

/** Moves every row from oldKey to newKey, folding labels into a row newKey already holds for the same content and user, and returns the rows moved. */
export async function updateTrackingRatingKey(
  this: DatabaseService,
  oldKey: string,
  newKey: string,
): Promise<number> {
  if (oldKey === newKey) return 0

  return this.knex.transaction(async (trx) => {
    const rows = (await trx('plex_label_tracking')
      .whereIn('plex_rating_key', [oldKey, newKey])
      .select('*')) as PlexLabelTrackingRow[]

    // Mirrors the unique index, which treats a NULL user_id as -1 on Postgres
    const identity = (row: PlexLabelTrackingRow) =>
      `${row.content_guids}|${row.user_id ?? -1}|${row.content_type}`
    const parseLabels = (row: PlexLabelTrackingRow) =>
      parseJsonOr<string[]>(
        row.labels_applied,
        [],
        this.log,
        'plex_label_tracking.labels_applied',
      )
    const counterparts = new Map(
      rows
        .filter((row) => row.plex_rating_key === newKey)
        .map((row) => [identity(row), row]),
    )

    let moved = 0
    for (const row of rows) {
      if (row.plex_rating_key !== oldKey) continue

      const counterpart = counterparts.get(identity(row))
      if (counterpart) {
        const labels = new Set(
          [...parseLabels(counterpart), ...parseLabels(row)].map((label) =>
            label.toLowerCase(),
          ),
        )
        await trx('plex_label_tracking')
          .where('id', counterpart.id)
          .update({
            labels_applied: JSON.stringify([...labels].sort()),
            synced_at: this.timestamp,
          })
        await trx('plex_label_tracking').where('id', row.id).delete()
      } else {
        await trx('plex_label_tracking')
          .where('id', row.id)
          .update({ plex_rating_key: newKey, synced_at: this.timestamp })
      }
      moved++
    }

    return moved
  })
}

/** Matches GUIDs and the label case-insensitively, and a null userId targets rows with no user. */
export async function isLabelTracked(
  this: DatabaseService,
  contentGuids: string[],
  contentType: 'movie' | 'show',
  userId: number | null,
  plexRatingKey: string,
  labelApplied: string,
): Promise<boolean> {
  if (contentGuids.length === 0) {
    this.log.warn('isLabelTracked: Empty content GUIDs array provided')
    return false
  }

  const normalizedGuids = contentGuids.map((g) => g.toLowerCase())

  this.log.debug(
    {
      userId,
      contentType,
      plexRatingKey,
      labelApplied,
      normalizedGuids,
    },
    'isLabelTracked: Checking label tracking',
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

export async function clearAllLabelTracking(
  this: DatabaseService,
): Promise<number> {
  const deleted = await this.knex('plex_label_tracking').delete()

  if (deleted > 0) {
    this.log.debug(
      `Cleared all ${deleted} Plex label tracking records from database`,
    )
  }

  return deleted
}

/** Deletes a record once its last label is removed. */
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
    { operationsCount: operations.length },
    `removeTrackedLabels: Processing ${operations.length} operations`,
  )

  try {
    if (this.isPostgres) {
      const chunks = chunkArray(operations, BATCH_CHUNK_SIZE)

      for (const chunk of chunks) {
        await this.knex.transaction(async (trx) => {
          const chunkResults = []
          for (const { plexRatingKey, labelsToRemove } of chunk) {
            try {
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
      const chunks = chunkArray(operations, BATCH_CHUNK_SIZE)

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
                const labels = parseJsonOr<string[]>(
                  record.labels_applied,
                  [],
                  this.log,
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
    this.log.error({ error }, 'Error in bulk label removal transaction')
    return {
      processedCount: 0,
      failedIds: operations.map((op) => op.plexRatingKey),
      totalUpdatedCount: 0,
    }
  }

  return { processedCount, failedIds, totalUpdatedCount }
}

/** validLabels must be lowercase, and only labels under `labelPrefix:` can be orphaned. */
export async function getOrphanedLabelTracking(
  this: DatabaseService,
  validLabels: Set<string>,
  labelPrefix: string,
): Promise<Array<{ plex_rating_key: string; orphaned_labels: string[] }>> {
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

  const orphanedByRatingKey = new Map<string, string[]>()

  for (const record of filteredRecords) {
    const labels = parseJsonOr<string[]>(
      record.labels_applied,
      [],
      this.log,
      'plex_label_tracking.labels_applied',
    )
    const orphanedLabels: string[] = []

    for (const label of labels) {
      const labelLower = label.toLowerCase()

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

  return Array.from(orphanedByRatingKey.entries()).map(
    ([plex_rating_key, orphaned_labels]) => ({
      plex_rating_key,
      orphaned_labels,
    }),
  )
}

/** Deletes a record once its last label is removed. */
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
    { operationsCount: operations.length },
    `removeOrphanedTrackingBulk: Processing ${operations.length} operations`,
  )

  try {
    if (this.isPostgres) {
      const chunks = chunkArray(operations, BATCH_CHUNK_SIZE)

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
                { error, plexRatingKey, orphanedLabels },
                `Failed to remove orphaned labels for rating key ${plexRatingKey}`,
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
      const chunks = chunkArray(operations, BATCH_CHUNK_SIZE)

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
                const labels = parseJsonOr<string[]>(
                  record.labels_applied,
                  [],
                  this.log,
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
                { error, plexRatingKey, orphanedLabels },
                `Failed to remove orphaned labels for rating key ${plexRatingKey}`,
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
    this.log.error(
      {
        error,
      },
      'Error in bulk orphaned tracking removal transaction',
    )
    return {
      processedCount: 0,
      failedIds: operations.map((op) => op.plexRatingKey),
      totalUpdatedCount: 0,
    }
  }

  return { processedCount, failedIds, totalUpdatedCount }
}
