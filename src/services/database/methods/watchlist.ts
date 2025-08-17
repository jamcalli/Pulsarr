import type {
  TokenWatchlistItem,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import type {
  WatchlistItemUpdate,
  WatchlistStatus,
} from '@root/types/watchlist-status.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseGuids } from '@utils/guid-handler.js'

/**
 * Status progression ranks to prevent regression
 */
const STATUS_RANK = Object.freeze({
  pending: 1,
  requested: 2,
  grabbed: 3,
  notified: 4,
} as const) satisfies Record<WatchlistStatus, number>

/**
 * Helper function to handle status updates with regression prevention
 * Returns the effective status that should be used for all operations
 */
function processStatusUpdate(
  currentStatus: WatchlistStatus,
  newStatus: WatchlistStatus | undefined,
  context: string,
  log: DatabaseService['log'],
): {
  effectiveStatus: WatchlistStatus
  shouldUpdateStatus: boolean
  shouldWriteHistory: boolean
} {
  if (!newStatus) {
    return {
      effectiveStatus: currentStatus,
      shouldUpdateStatus: false,
      shouldWriteHistory: false,
    }
  }

  if (newStatus === currentStatus) {
    // No-op status change
    return {
      effectiveStatus: currentStatus,
      shouldUpdateStatus: false,
      shouldWriteHistory: false,
    }
  }

  const currentRank = STATUS_RANK[currentStatus] || 0
  const newRank = STATUS_RANK[newStatus] || 0

  if (newRank < currentRank) {
    // Prevent status regression
    log.warn(
      `Preventing status regression for ${context}: ${currentStatus} → ${newStatus}`,
    )
    return {
      effectiveStatus: currentStatus,
      shouldUpdateStatus: false,
      shouldWriteHistory: false,
    }
  } else {
    // Allow status progression
    return {
      effectiveStatus: newStatus,
      shouldUpdateStatus: true,
      shouldWriteHistory: true,
    }
  }
}

/**
 * Updates a watchlist item for a specific user by key with the provided changes.
 *
 * Skips updates for temporary RSS items. Updates main watchlist item fields and manages associations with Radarr and Sonarr instances, including syncing status and primary instance designation.
 *
 * @param userId - ID of the user who owns the watchlist item
 * @param key - Unique key identifying the watchlist item
 * @param updates - Fields and associations to update on the watchlist item
 */
export async function updateWatchlistItem(
  this: DatabaseService,
  userId: number,
  key: string,
  updates: WatchlistItemUpdate,
): Promise<void> {
  if (key.startsWith('selfRSS_') || key.startsWith('friendsRSS_')) {
    this.log.debug(`Skipping temporary RSS key: ${key}`)
    return
  }

  await this.knex.transaction(async (trx) => {
    const item = await trx('watchlist_items')
      .where({ user_id: userId, key })
      .first()

    if (!item) {
      this.log.warn(
        `Tried to update non-existent watchlist item with key: ${key} for user: ${userId}`,
      )
      return
    }

    const { radarr_instance_id, sonarr_instance_id, syncing, ...otherUpdates } =
      updates

    // Handle status updates with regression prevention and history tracking
    const statusResult = processStatusUpdate(
      item.status,
      otherUpdates.status,
      `item ${key}`,
      this.log,
    )

    const effectiveStatus = statusResult.effectiveStatus
    let finalStatusUpdate = { ...otherUpdates }

    // Remove status from update if it shouldn't be updated (no-op or regression)
    if (!statusResult.shouldUpdateStatus && 'status' in finalStatusUpdate) {
      const { status: _, ...updatesWithoutStatus } = finalStatusUpdate
      finalStatusUpdate = updatesWithoutStatus
    }
    if (statusResult.shouldUpdateStatus) {
      finalStatusUpdate = {
        ...finalStatusUpdate,
        status: statusResult.effectiveStatus,
      }
    }

    if (Object.keys(finalStatusUpdate).length > 0) {
      await trx('watchlist_items')
        .where({ user_id: userId, key })
        .update({
          ...finalStatusUpdate,
          updated_at: this.timestamp,
        })
    }

    // Record status history if status actually changed
    if (statusResult.shouldWriteHistory) {
      try {
        // Check if this status entry already exists to avoid duplicates
        const existing = await trx('watchlist_status_history')
          .where({
            watchlist_item_id: item.id,
            status: effectiveStatus,
          })
          .first()

        if (!existing) {
          await trx('watchlist_status_history').insert({
            watchlist_item_id: item.id,
            status: effectiveStatus,
            timestamp: this.timestamp,
          })

          this.log.debug(
            `Recorded status history: ${item.status} → ${effectiveStatus} for item ${key}`,
          )
        }
      } catch (error) {
        this.log.error(
          { error, itemId: item.id, status: effectiveStatus },
          'Failed to record status history',
        )
        // Don't fail the whole transaction for history recording errors
      }
    }

    if (radarr_instance_id !== undefined) {
      if (radarr_instance_id === null) {
        await trx('watchlist_radarr_instances')
          .where({ watchlist_id: item.id })
          .delete()
      } else {
        const existingInstanceIds = await this.getWatchlistRadarrInstanceIds(
          item.id,
          trx,
        )

        if (!existingInstanceIds.includes(radarr_instance_id)) {
          await this.addWatchlistToRadarrInstance(
            item.id,
            radarr_instance_id,
            effectiveStatus,
            true,
            syncing || false,
            trx,
          )
        } else {
          await this.setPrimaryRadarrInstance(item.id, radarr_instance_id, trx)

          // Keep junction status in sync on progressions
          if (statusResult.shouldUpdateStatus) {
            await trx('watchlist_radarr_instances')
              .where({
                watchlist_id: item.id,
                radarr_instance_id,
              })
              .update({
                status: effectiveStatus,
                updated_at: this.timestamp,
              })
          }

          if (syncing !== undefined) {
            await this.updateRadarrSyncingStatus(
              item.id,
              radarr_instance_id,
              syncing ?? false,
              trx,
            )
          }
        }
      }
    }

    if (sonarr_instance_id !== undefined) {
      if (sonarr_instance_id === null) {
        await trx('watchlist_sonarr_instances')
          .where({ watchlist_id: item.id })
          .delete()
      } else {
        const existingInstanceIds = await this.getWatchlistSonarrInstanceIds(
          item.id,
          trx,
        )

        if (!existingInstanceIds.includes(sonarr_instance_id)) {
          await this.addWatchlistToSonarrInstance(
            item.id,
            sonarr_instance_id,
            effectiveStatus,
            true,
            syncing || false,
            trx,
          )
        } else {
          await this.setPrimarySonarrInstance(item.id, sonarr_instance_id, trx)

          // Keep junction status in sync on progressions
          if (statusResult.shouldUpdateStatus) {
            await trx('watchlist_sonarr_instances')
              .where({
                watchlist_id: item.id,
                sonarr_instance_id,
              })
              .update({
                status: effectiveStatus,
                updated_at: this.timestamp,
              })
          }

          if (syncing !== undefined) {
            await this.updateSonarrSyncingStatus(
              item.id,
              sonarr_instance_id,
              syncing ?? false,
              trx,
            )
          }
        }
      }
    }
  })
}

/**
 * Updates all watchlist items whose GUIDs array contains the specified GUID.
 *
 * @param guid - The GUID to search for within each item's GUIDs array
 * @param updates - The fields to apply to each matching watchlist item
 * @returns The number of watchlist items that were updated
 */
export async function updateWatchlistItemByGuid(
  this: DatabaseService,
  guid: string,
  updates: WatchlistItemUpdate,
): Promise<number> {
  return await this.knex.transaction(async (trx) => {
    // Use database-specific JSON functions to get matching items with their current status
    const matchingItems = this.isPostgres
      ? await trx('watchlist_items')
          .select('id', 'status', 'key')
          .whereRaw(
            'EXISTS (SELECT 1 FROM jsonb_array_elements_text(guids) elem WHERE lower(elem) = lower(?))',
            [guid],
          )
      : await trx('watchlist_items')
          .select('id', 'status', 'key')
          .whereRaw(
            "EXISTS (SELECT 1 FROM json_each(guids) WHERE json_each.type = 'text' AND lower(json_each.value) = lower(?))",
            [guid],
          )

    if (matchingItems.length === 0) {
      this.log.warn(`No items found with GUID: ${guid}`)
      return 0
    }

    let totalUpdated = 0

    for (const item of matchingItems) {
      // Strip junction-only fields; GUID-based updates only touch main table + history
      const {
        syncing: _,
        radarr_instance_id: _ri,
        sonarr_instance_id: _si,
        ...validUpdates
      } = updates

      // Process status update with regression prevention
      const statusResult = processStatusUpdate(
        item.status,
        validUpdates.status,
        `GUID ${guid} item ${item.key}`,
        this.log,
      )

      let finalUpdates = { ...validUpdates }

      // Remove status from update if it shouldn't be updated (no-op or regression)
      if (!statusResult.shouldUpdateStatus && 'status' in finalUpdates) {
        const { status: __, ...updatesWithoutStatus } = finalUpdates
        finalUpdates = updatesWithoutStatus
      }
      if (statusResult.shouldUpdateStatus) {
        finalUpdates = { ...finalUpdates, status: statusResult.effectiveStatus }
      }

      // Apply updates if there are any
      if (Object.keys(finalUpdates).length > 0) {
        await trx('watchlist_items')
          .where('id', item.id)
          .update({
            ...finalUpdates,
            updated_at: this.timestamp,
          })

        totalUpdated += 1
      }

      // Record status history if status actually changed
      if (statusResult.shouldWriteHistory) {
        try {
          // Check if this status entry already exists to avoid duplicates
          const existing = await trx('watchlist_status_history')
            .where({
              watchlist_item_id: item.id,
              status: statusResult.effectiveStatus,
            })
            .first()

          if (!existing) {
            await trx('watchlist_status_history').insert({
              watchlist_item_id: item.id,
              status: statusResult.effectiveStatus,
              timestamp: this.timestamp,
            })

            this.log.debug(
              `Recorded status history: ${item.status} → ${statusResult.effectiveStatus} for GUID ${guid} item ${item.key}`,
            )
          }
        } catch (error) {
          this.log.error(
            { error, itemId: item.id, status: statusResult.effectiveStatus },
            'Failed to record status history',
          )
          // Don't fail the whole transaction for history recording errors
        }
      }
    }

    this.log.debug(`Updated ${totalUpdated} items by GUID ${guid}`)
    return totalUpdated
  })
}

/**
 * Retrieves a single watchlist item for a user by its unique key.
 *
 * Parses the item's GUIDs and genres fields from JSON before returning. Returns undefined if no matching item is found.
 *
 * @param userId - The numeric ID of the user
 * @param key - The unique key identifying the watchlist item
 * @returns The watchlist item if found, or undefined otherwise
 */
export async function getWatchlistItem(
  this: DatabaseService,
  userId: number,
  key: string,
): Promise<WatchlistItem | undefined> {
  const numericUserId =
    typeof userId === 'object' ? (userId as { id: number }).id : userId

  const result = await this.knex('watchlist_items')
    .where({
      user_id: numericUserId,
      key,
    })
    .first()

  if (!result) return undefined

  return {
    ...result,
    guids: this.safeJsonParse(result.guids, [], 'watchlist_item.guids'),
    genres: this.safeJsonParse(result.genres, [], 'watchlist_item.genres'),
  }
}

/**
 * Retrieves a watchlist item by its numeric ID, returning the item with parsed `guids` and `genres` fields.
 *
 * @param id - The numeric ID of the watchlist item
 * @returns The watchlist item with parsed fields if found; otherwise, undefined
 */
export async function getWatchlistItemById(
  this: DatabaseService,
  id: number,
): Promise<WatchlistItem | undefined> {
  const result = await this.knex('watchlist_items').where('id', id).first()

  if (!result) return undefined

  return {
    ...result,
    guids: this.safeJsonParse(result.guids, [], 'watchlist_item.guids'),
    genres: this.safeJsonParse(result.genres, [], 'watchlist_item.genres'),
  }
}

/**
 * Retrieves watchlist items for the specified users, optionally filtered by item keys.
 *
 * Parses the `guids` and `genres` fields for each item to ensure consistent data structure.
 *
 * @param userIds - Array of user IDs to retrieve watchlist items for
 * @param keys - Optional array of watchlist item keys to filter the results
 * @returns An array of matching watchlist items with parsed `guids` and `genres` fields
 */
export async function getBulkWatchlistItems(
  this: DatabaseService,
  userIds: number[],
  keys: string[],
): Promise<WatchlistItem[]> {
  const logMessage =
    keys.length > 0
      ? `Checking for existing items with ${userIds.length} users and ${keys.length} keys`
      : `Checking for existing items with ${userIds.length} users (no specific keys)`

  this.log.debug(logMessage)

  const numericUserIds = userIds.map((id) =>
    typeof id === 'object' ? (id as { id: number }).id : id,
  )

  const query = this.knex('watchlist_items').whereIn('user_id', numericUserIds)

  if (keys.length > 0) {
    query.whereIn('key', keys)
  }

  const results = await query

  const logContext = {
    query: query.toString(),
    userIds: numericUserIds,
    ...(keys.length > 0 ? { keysCount: keys.length } : {}),
  }

  this.log.debug(
    `Query returned ${results.length} total matches from database`,
    logContext,
  )

  return results.map((row) => ({
    ...row,
    guids: this.safeJsonParse(row.guids, [], 'watchlist_item.guids'),
    genres: this.safeJsonParse(row.genres, [], 'watchlist_item.genres'),
  }))
}

/**
 * Retrieves all watchlist items matching the given keys, returning each with its numeric ID and parsed `guids` and `genres` fields.
 *
 * Returns an empty array if no keys are provided. The `thumb` and `added` fields are set to `undefined` if falsy.
 *
 * @returns Array of watchlist items with numeric IDs and safely parsed JSON fields
 */
export async function getWatchlistItemsByKeys(
  this: DatabaseService,
  keys: string[],
): Promise<(WatchlistItem & { id: number })[]> {
  if (keys.length === 0) {
    return []
  }

  const items = await this.knex('watchlist_items')
    .whereIn('key', keys)
    .select('*')

  this.log.debug(`Retrieved ${items.length} items by keys`, {
    keyCount: keys.length,
    resultCount: items.length,
  })

  return items.map((item) => ({
    ...item,
    thumb: item.thumb || undefined,
    added: item.added || undefined,
    guids: this.safeJsonParse(item.guids, [], 'watchlist_item.guids'),
    genres: this.safeJsonParse(item.genres, [], 'watchlist_item.genres'),
  }))
}

/**
 * Performs a bulk update of multiple watchlist items, including main item fields and associated Radarr/Sonarr instance relationships.
 *
 * Updates are processed in batches within a transaction. Instance associations are created, updated, or deleted as needed, and status changes are recorded in the status history.
 *
 * @param updates - List of updates specifying user ID, key, and fields to modify for each watchlist item
 * @returns The number of watchlist items updated
 */
export async function bulkUpdateWatchlistItems(
  this: DatabaseService,
  updates: Array<{
    userId: number
    key: string
    added?: string
    status?: 'pending' | 'requested' | 'grabbed' | 'notified'
    series_status?: 'continuing' | 'ended'
    movie_status?: 'available' | 'unavailable'
    last_notified_at?: string
    sonarr_instance_id?: number
    radarr_instance_id?: number
  }>,
): Promise<number> {
  let updatedCount = 0

  await this.knex.transaction(async (trx) => {
    const chunks = this.chunkArray(updates, 100)

    for (const chunk of chunks) {
      for (const update of chunk) {
        const { userId, key, ...updateFields } = update

        const currentItem = await trx('watchlist_items')
          .where({
            user_id: userId,
            key: key,
          })
          .select('id', 'status')
          .first()

        if (!currentItem) continue

        // Process status update with regression prevention
        const statusResult = processStatusUpdate(
          currentItem.status,
          updateFields.status,
          `bulk update item ${key}`,
          this.log,
        )

        const effectiveStatus = statusResult.effectiveStatus

        const mainTableFields: Record<string, unknown> = {}
        const junctionFields: Record<string, unknown> = {}

        for (const [field, value] of Object.entries(updateFields)) {
          if (
            field === 'radarr_instance_id' ||
            field === 'sonarr_instance_id'
          ) {
            if (
              value === null ||
              typeof value === 'number' ||
              value === undefined
            ) {
              junctionFields[field] = value
            } else {
              const numericValue =
                typeof value === 'string' ? Number(value) : null
              junctionFields[field] = Number.isNaN(numericValue)
                ? null
                : numericValue
            }
          } else if (field === 'status') {
            // Only include status in main table update if it should be updated
            if (statusResult.shouldUpdateStatus) {
              mainTableFields[field] = effectiveStatus
            }
          } else {
            mainTableFields[field] = value
          }
        }

        if (Object.keys(mainTableFields).length > 0) {
          const updated = await trx('watchlist_items')
            .where({
              user_id: userId,
              key: key,
            })
            .update({
              ...mainTableFields,
              updated_at: this.timestamp,
            })

          const numericUpdated = Number(updated)
          if (!Number.isNaN(numericUpdated) && numericUpdated > 0) {
            updatedCount += 1
          }

          // count pure-junction updates as well
        } else if (Object.keys(junctionFields).length > 0) {
          updatedCount += 1
        }

        // Handle Radarr instance junction updates
        if ('radarr_instance_id' in junctionFields) {
          const radarrInstanceId = junctionFields.radarr_instance_id as
            | number
            | null
            | undefined

          if (radarrInstanceId === null) {
            await trx('watchlist_radarr_instances')
              .where({ watchlist_id: currentItem.id })
              .delete()
          } else if (radarrInstanceId !== undefined) {
            const existingAssoc = await trx('watchlist_radarr_instances')
              .where({
                watchlist_id: currentItem.id,
                radarr_instance_id: radarrInstanceId,
              })
              .first()

            if (!existingAssoc) {
              await trx('watchlist_radarr_instances').insert({
                watchlist_id: currentItem.id,
                radarr_instance_id: radarrInstanceId,
                status: effectiveStatus,
                is_primary: true,
                last_notified_at: update.last_notified_at,
                created_at: this.timestamp,
                updated_at: this.timestamp,
              })

              await trx('watchlist_radarr_instances')
                .where({ watchlist_id: currentItem.id })
                .whereNot({ radarr_instance_id: radarrInstanceId })
                .update({
                  is_primary: false,
                  updated_at: this.timestamp,
                })
            } else {
              await trx('watchlist_radarr_instances')
                .where({
                  watchlist_id: currentItem.id,
                  radarr_instance_id: radarrInstanceId,
                })
                .update({
                  status: effectiveStatus,
                  is_primary: true,
                  last_notified_at:
                    update.last_notified_at !== undefined
                      ? update.last_notified_at
                      : existingAssoc.last_notified_at,
                  updated_at: this.timestamp,
                })

              await trx('watchlist_radarr_instances')
                .where({ watchlist_id: currentItem.id })
                .whereNot({ radarr_instance_id: radarrInstanceId })
                .update({
                  is_primary: false,
                  updated_at: this.timestamp,
                })
            }
          }
        }

        // Handle Sonarr instance junction updates
        if ('sonarr_instance_id' in junctionFields) {
          const sonarrInstanceId = junctionFields.sonarr_instance_id as
            | number
            | null
            | undefined

          if (sonarrInstanceId === null) {
            await trx('watchlist_sonarr_instances')
              .where({ watchlist_id: currentItem.id })
              .delete()
          } else if (sonarrInstanceId !== undefined) {
            const existingAssoc = await trx('watchlist_sonarr_instances')
              .where({
                watchlist_id: currentItem.id,
                sonarr_instance_id: sonarrInstanceId,
              })
              .first()

            if (!existingAssoc) {
              await trx('watchlist_sonarr_instances').insert({
                watchlist_id: currentItem.id,
                sonarr_instance_id: sonarrInstanceId,
                status: effectiveStatus,
                is_primary: true,
                last_notified_at: update.last_notified_at,
                created_at: this.timestamp,
                updated_at: this.timestamp,
              })

              await trx('watchlist_sonarr_instances')
                .where({ watchlist_id: currentItem.id })
                .whereNot({ sonarr_instance_id: sonarrInstanceId })
                .update({
                  is_primary: false,
                  updated_at: this.timestamp,
                })
            } else {
              await trx('watchlist_sonarr_instances')
                .where({
                  watchlist_id: currentItem.id,
                  sonarr_instance_id: sonarrInstanceId,
                })
                .update({
                  status: effectiveStatus,
                  is_primary: true,
                  last_notified_at:
                    update.last_notified_at !== undefined
                      ? update.last_notified_at
                      : existingAssoc.last_notified_at,
                  updated_at: this.timestamp,
                })

              await trx('watchlist_sonarr_instances')
                .where({ watchlist_id: currentItem.id })
                .whereNot({ sonarr_instance_id: sonarrInstanceId })
                .update({
                  is_primary: false,
                  updated_at: this.timestamp,
                })
            }
          }
        }

        // Record status history if status actually changed
        if (statusResult.shouldWriteHistory) {
          try {
            // Check if this status entry already exists to avoid duplicates
            const existing = await trx('watchlist_status_history')
              .where({
                watchlist_item_id: currentItem.id,
                status: effectiveStatus,
              })
              .first()

            if (!existing) {
              await trx('watchlist_status_history').insert({
                watchlist_item_id: currentItem.id,
                status: effectiveStatus,
                timestamp: this.timestamp,
              })

              this.log.debug(
                `Recorded status history: ${currentItem.status} → ${effectiveStatus} for bulk update item ${key}`,
              )
            }
          } catch (error) {
            this.log.error(
              { error, itemId: currentItem.id, status: effectiveStatus },
              'Failed to record status history',
            )
            // Don't fail the whole transaction for history recording errors
          }
        }
      }
    }
  })

  return updatedCount
}

/**
 * Retrieves all unique GUIDs from watchlist items, returning them as lowercase strings.
 *
 * @returns An array of unique, lowercased GUIDs extracted from all watchlist items.
 */
export async function getAllGuidsMapped(
  this: DatabaseService,
): Promise<string[]> {
  const rows = await this.knex('watchlist_items')
    .whereNotNull('guids')
    .where('guids', '!=', '[]')
    .select('guids')

  const guids = new Set<string>()

  for (const row of rows) {
    const parsedGuids = parseGuids(row.guids)

    for (const guid of parsedGuids) {
      guids.add(guid.toLowerCase())
    }
  }

  return Array.from(guids)
}

/**
 * Retrieves distinct active notifications of a specified type that have been sent to a webhook for a given user.
 *
 * @param userId - The ID of the user.
 * @param type - The notification type to filter by.
 * @returns An array of objects containing notification titles.
 */
export async function getNotificationsForUser(
  this: DatabaseService,
  userId: number,
  type: string,
): Promise<Array<{ title: string }>> {
  return await this.knex('notifications')
    .where({
      user_id: userId,
      type: type,
      sent_to_webhook: true,
      notification_status: 'active',
    })
    .select('title')
    .distinct()
}

/**
 * Retrieves watchlist items with their GUIDs, optionally filtered by type.
 *
 * @param types - Optional array of types to filter items (e.g., ['movie', 'show'])
 * @returns Promise resolving to an array of objects containing item IDs and their parsed GUID arrays
 */
export async function getAllGuidsFromWatchlist(
  this: DatabaseService,
  types?: string[],
): Promise<Array<{ id: number; guids: string[] }>> {
  let query = this.knex('watchlist_items')
    .whereNotNull('guids')
    .where('guids', '!=', '[]')
    .select('id', 'guids')

  if (types && types.length > 0) {
    query = query.whereIn('type', types)
  }

  const items = await query

  return items.map((item) => ({
    id: item.id,
    guids: parseGuids(item.guids),
  }))
}

/**
 * Checks which of the specified titles have had 'watchlist_add' webhook notifications sent for a user.
 *
 * @param userId - The user ID to check notifications for
 * @param titles - Array of titles to check for existing webhook notifications
 * @returns A map where each title is mapped to true if a webhook notification exists, or false otherwise
 */
export async function checkExistingWebhooks(
  this: DatabaseService,
  userId: number,
  titles: string[],
): Promise<Map<string, boolean>> {
  if (titles.length === 0) {
    return new Map()
  }

  const rows = await this.knex('notifications')
    .where({
      user_id: userId,
      type: 'watchlist_add',
      sent_to_webhook: true,
    })
    .whereIn('title', titles)
    .select('title')
    .distinct()

  const result = new Map<string, boolean>()

  for (const title of titles) {
    result.set(title, false)
  }

  for (const row of rows) {
    result.set(row.title, true)
  }

  return result
}

/**
 * Retrieves all unique GUIDs from watchlist items in lowercase, using raw SQL compatible with both Postgres and other SQL databases.
 *
 * Falls back to a mapped extraction method if the raw query fails.
 *
 * @returns An array of unique, lowercased GUID strings.
 */
export async function getUniqueGuidsRaw(
  this: DatabaseService,
): Promise<string[]> {
  if (this.isPostgres) {
    const result = await this.knex.raw(`
      SELECT DISTINCT lower(guid_element::text) as guid
      FROM watchlist_items,
           jsonb_array_elements_text(
             CASE 
               WHEN jsonb_typeof(guids) = 'array' THEN guids
               ELSE jsonb_build_array(guids)
             END
           ) as guid_element
      WHERE guids IS NOT NULL 
        AND jsonb_typeof(guids) != 'null'
        AND jsonb_array_length(
          CASE 
            WHEN jsonb_typeof(guids) = 'array' THEN guids
            ELSE jsonb_build_array(guids)
          END
        ) > 0
        AND guid_element::text != ''
    `)

    return (
      result.rows?.map((row: { guid: string }) => row.guid).filter(Boolean) ||
      []
    )
  }

  const result = await this.knex.raw(`
      WITH extracted_guids AS (
        SELECT DISTINCT json_extract(value, '$') as guid
        FROM watchlist_items
        JOIN json_each(
          CASE 
            WHEN json_valid(guids) THEN guids
            ELSE json_array(guids)
          END
        )
        WHERE guids IS NOT NULL AND guids != '[]'
      )
      SELECT DISTINCT lower(guid) as guid 
      FROM extracted_guids 
      WHERE guid IS NOT NULL AND guid != '';
    `)

  if (Array.isArray(result)) {
    return result.map((row) => row.guid || row[0]).filter(Boolean)
  }

  this.log.warn('Could not extract GUIDs from raw query result')
  return this.getAllGuidsMapped()
}

/**
 * Synchronizes all unique genres found in watchlist items into the genres table, inserting new genres as needed and updating timestamps for existing ones.
 */
export async function syncGenresFromWatchlist(
  this: DatabaseService,
): Promise<void> {
  const items = await this.knex('watchlist_items')
    .whereNotNull('genres')
    .where('genres', '!=', '[]')
    .select('genres')

  const uniqueGenres = new Set<string>()

  for (const row of items) {
    const parsedGenres = this.safeJsonParse<string[]>(
      row.genres,
      [],
      'watchlist_item.genres',
    )
    if (Array.isArray(parsedGenres)) {
      for (const genre of parsedGenres) {
        if (typeof genre === 'string' && genre.trim().length > 1) {
          uniqueGenres.add(genre.trim())
        }
      }
    }
  }

  const genresToInsert = Array.from(uniqueGenres).map((genre) => ({
    name: genre,
    is_custom: false,
    created_at: this.timestamp,
    updated_at: this.timestamp,
  }))

  if (genresToInsert.length > 0) {
    await this.knex('genres')
      .insert(genresToInsert)
      .onConflict('name')
      .merge(['updated_at'])
  }
}

/**
 * Adds a new custom genre by name to the genres table.
 *
 * Trims the provided name, inserts it as a custom genre, and returns the new genre's ID. Throws an error if the genre already exists.
 *
 * @param name - The name of the custom genre to add
 * @returns The ID of the newly created genre
 */
export async function addCustomGenre(
  this: DatabaseService,
  name: string,
): Promise<number> {
  const result = await this.knex('genres')
    .insert({
      name: name.trim(),
      is_custom: true,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .onConflict('name')
    .ignore()
    .returning('id')

  if (!result || result.length === 0) {
    throw new Error('Genre already exists')
  }

  return this.extractId(result)
}

/**
 * Retrieves all genres from the database, ordered alphabetically by name.
 *
 * @returns An array of genre objects, each containing the genre's ID, name, and whether it is custom.
 */
export async function getAllGenres(
  this: DatabaseService,
): Promise<Array<{ id: number; name: string; is_custom: boolean }>> {
  return await this.knex('genres')
    .select('id', 'name', 'is_custom')
    .orderBy('name', 'asc')
}

/**
 * Deletes a custom genre by its ID.
 *
 * @param id - The ID of the custom genre to delete.
 * @returns True if the genre was deleted, false if no matching custom genre was found.
 */
export async function deleteCustomGenre(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deleted = await this.knex('genres')
    .where({ id, is_custom: true })
    .delete()
  return deleted > 0
}

/**
 * Performs a bulk update of show watchlist item statuses.
 *
 * Calls the underlying bulk update function to modify statuses and series statuses for multiple show watchlist items.
 *
 * @param updates - List of updates specifying user, key, and new status values for each show item
 * @returns The number of watchlist items successfully updated
 */
export async function bulkUpdateShowStatuses(
  this: DatabaseService,
  updates: Array<{
    key: string
    userId: number
    added?: string
    status?: 'pending' | 'requested' | 'grabbed' | 'notified'
    series_status?: 'continuing' | 'ended'
  }>,
): Promise<number> {
  const updatedCount = await this.bulkUpdateWatchlistItems(updates)
  return updatedCount
}

/**
 * Retrieves all watchlist items of type 'show', parsing GUIDs and genres for each item.
 *
 * @returns An array of show watchlist items with normalized IDs, GUIDs, and genres.
 */
export async function getAllShowWatchlistItems(
  this: DatabaseService,
): Promise<TokenWatchlistItem[]> {
  const items = await this.knex('watchlist_items')
    .where('type', 'show')
    .select('*')

  return items.map((item) => ({
    ...item,
    id: String(item.id),
    guids:
      typeof item.guids === 'string'
        ? this.safeJsonParse(item.guids, [], 'watchlist_item.guids')
        : item.guids || [],
    genres:
      typeof item.genres === 'string'
        ? this.safeJsonParse(item.genres, [], 'watchlist_item.genres')
        : item.genres || [],
  }))
}

/**
 * Retrieves all watchlist items of type 'movie', returning each with normalized string IDs, parsed GUIDs, and genres.
 *
 * @returns An array of movie watchlist items with IDs as strings and parsed GUID and genre arrays.
 */
export async function getAllMovieWatchlistItems(
  this: DatabaseService,
): Promise<TokenWatchlistItem[]> {
  const items = await this.knex('watchlist_items')
    .where('type', 'movie')
    .select('*')

  return items.map((item) => ({
    ...item,
    id: String(item.id),
    guids:
      typeof item.guids === 'string'
        ? this.safeJsonParse(item.guids, [], 'watchlist_item.guids')
        : item.guids || [],
    genres:
      typeof item.genres === 'string'
        ? this.safeJsonParse(item.genres, [], 'watchlist_item.genres')
        : item.genres || [],
  }))
}

/**
 * Inserts multiple watchlist items in bulk and returns their database IDs and keys.
 *
 * Supports conflict resolution: use 'ignore' (default) to skip duplicates or 'merge' to update existing entries. The returned array contains only the successfully inserted or merged items.
 *
 * @param items - The watchlist items to insert, excluding creation and update timestamps
 * @param options - Optional conflict resolution mode: 'ignore' (default) or 'merge'
 * @returns Array of objects with the IDs and keys of inserted or merged items
 */
export async function createWatchlistItems(
  this: DatabaseService,
  items: Omit<WatchlistItem, 'created_at' | 'updated_at'>[],
  options: { onConflict?: 'ignore' | 'merge' } = { onConflict: 'ignore' },
): Promise<{ id: number; key: string }[]> {
  const insertedIds: { id: number; key: string }[] = []

  await this.knex.transaction(async (trx) => {
    const chunks = this.chunkArray(items, 250)

    for (const chunk of chunks) {
      const itemsToInsert = chunk.map((item) => ({
        user_id:
          typeof item.user_id === 'object'
            ? (item.user_id as { id: number }).id
            : item.user_id,
        key: item.key,
        title: item.title,
        type:
          typeof item.type === 'string' ? item.type.toLowerCase() : item.type,
        thumb: item.thumb,
        guids: JSON.stringify(item.guids || []),
        genres: JSON.stringify(item.genres || []),
        status: item.status || 'pending',
        created_at: this.timestamp,
        updated_at: this.timestamp,
      }))

      const query = trx('watchlist_items').insert(itemsToInsert)

      if (options.onConflict === 'merge') {
        const results = await query
          .onConflict(['user_id', 'key'])
          .merge()
          .returning(['id', 'key'])
        insertedIds.push(...results)
      } else {
        const results = await query
          .onConflict(['user_id', 'key'])
          .ignore()
          .returning(['id', 'key'])
        insertedIds.push(...results)
      }
    }
  })

  return insertedIds
}

/**
 * Creates multiple temporary RSS items in bulk for tracking sync changes.
 *
 * Each item includes title, type, GUIDs, optional genres and thumbnail, and a source indicator. Items are inserted in batches within a transaction.
 *
 * @param items - The temporary RSS items to create
 */
export async function createTempRssItems(
  this: DatabaseService,
  items: Array<{
    title: string
    type: string
    thumb?: string
    guids: string[]
    genres?: string[]
    source: 'self' | 'friends'
  }>,
): Promise<void> {
  await this.knex.transaction(async (trx) => {
    const chunks = this.chunkArray(items, 250)

    for (const chunk of chunks) {
      await trx('temp_rss_items').insert(
        chunk.map((item) => ({
          ...item,
          guids: JSON.stringify(item.guids),
          genres: item.genres ? JSON.stringify(item.genres) : null,
          created_at: this.timestamp,
        })),
      )
    }
  })
}

/**
 * Retrieves temporary RSS items, optionally filtered by source.
 *
 * @param source - If provided, filters items by the specified source ('self' or 'friends')
 * @returns An array of temporary RSS items with parsed GUIDs and genres
 */
export async function getTempRssItems(
  this: DatabaseService,
  source?: 'self' | 'friends',
): Promise<
  Array<{
    id: number
    title: string
    type: string
    thumb: string | null
    guids: string[]
    genres: string[]
    source: 'self' | 'friends'
    created_at: string
  }>
> {
  const query = this.knex('temp_rss_items')
  if (source) {
    query.where({ source })
  }

  const results = await query
  return results.map((row) => ({
    ...row,
    guids: this.safeJsonParse(row.guids, [], 'watchlist_item.guids'),
    genres: row.genres
      ? this.safeJsonParse(row.genres, [], 'watchlist_item.genres')
      : [],
  }))
}

/**
 * Deletes temporary RSS items with the specified IDs.
 *
 * @param ids - The IDs of the temporary RSS items to delete.
 */
export async function deleteTempRssItems(
  this: DatabaseService,
  ids: number[],
): Promise<void> {
  await this.knex('temp_rss_items').whereIn('id', ids).delete()
}

/**
 * Deletes all temporary RSS items, optionally filtered by source.
 *
 * @param source - If provided, only items with this source ('self' or 'friends') are deleted.
 */
export async function deleteAllTempRssItems(
  this: DatabaseService,
  source?: 'self' | 'friends',
): Promise<void> {
  const query = this.knex('temp_rss_items')
  if (source) {
    query.where({ source })
  }
  await query.delete()
}

/**
 * Deletes specified watchlist items for a user.
 *
 * Removes watchlist items matching the given keys for the provided user ID. If the keys array is empty, no action is taken.
 */
export async function deleteWatchlistItems(
  this: DatabaseService,
  userId: number,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return

  const numericUserId =
    typeof userId === 'object' ? (userId as { id: number }).id : userId

  await this.knex('watchlist_items')
    .where('user_id', numericUserId)
    .whereIn('key', keys)
    .delete()
}

/**
 * Retrieves all watchlist items belonging to the specified user.
 *
 * Parses the `guids` and `genres` fields from JSON for each item.
 *
 * @param userId - The user ID whose watchlist items are to be retrieved
 * @returns An array of all watchlist items for the user
 */
export async function getAllWatchlistItemsForUser(
  this: DatabaseService,
  userId: number,
): Promise<WatchlistItem[]> {
  const numericUserId =
    typeof userId === 'object' ? (userId as { id: number }).id : userId

  const items = await this.knex('watchlist_items')
    .where('user_id', numericUserId)
    .select('*')

  return items.map((item) => ({
    ...item,
    guids: this.safeJsonParse(item.guids, [], 'watchlist_item.guids'),
    genres: this.safeJsonParse(item.genres, [], 'watchlist_item.genres'),
  }))
}

/**
 * Retrieves all watchlist items containing the specified GUID in their GUIDs array, using case-insensitive matching.
 *
 * Each returned item has its `id` converted to a string, and its `guids` and `genres` fields parsed as arrays.
 *
 * @param guid - The GUID to search for within each item's GUIDs array
 * @returns An array of matching watchlist items with normalized and parsed fields
 */
export async function getWatchlistItemsByGuid(
  this: DatabaseService,
  guid: string,
): Promise<TokenWatchlistItem[]> {
  // Use database-specific JSON functions to filter efficiently at database level
  const items = this.isPostgres
    ? await this.knex('watchlist_items')
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(guids) elem WHERE lower(elem) = lower(?))',
          [guid],
        )
        .select('*')
    : await this.knex('watchlist_items')
        .whereRaw(
          "EXISTS (SELECT 1 FROM json_each(guids) WHERE json_each.type = 'text' AND lower(json_each.value) = lower(?))",
          [guid],
        )
        .select('*')

  return items.map((item) => ({
    ...item,
    id: String(item.id),
    guids: this.safeJsonParse<string[]>(item.guids, [], 'watchlist_item.guids'),
    genres: this.safeJsonParse<string[]>(
      item.genres,
      [],
      'watchlist_item.genres',
    ),
  }))
}

/**
 * Retrieves all unique GUIDs from watchlist items that include a TVDB GUID matching the specified TVDB ID.
 *
 * Searches for watchlist items whose `guids` array contains a GUID in the format `tvdb:{tvdbId}` (case-insensitive), then aggregates and returns all unique GUIDs from those items.
 *
 * @param tvdbId - The TVDB ID to search for within GUIDs
 * @returns An array of unique GUID strings from matching watchlist items
 */
export async function getAllGuidsByTvdbId(
  this: DatabaseService,
  tvdbId: number,
): Promise<string[]> {
  const tvdbGuid = `tvdb:${tvdbId}`

  // Get all watchlist items that contain this TVDB ID
  const items = this.isPostgres
    ? await this.knex('watchlist_items')
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(guids) elem WHERE lower(elem) = lower(?))',
          [tvdbGuid],
        )
        .select('guids')
    : await this.knex('watchlist_items')
        .whereRaw(
          "EXISTS (SELECT 1 FROM json_each(guids) WHERE json_each.type = 'text' AND lower(json_each.value) = lower(?))",
          [tvdbGuid],
        )
        .select('guids')

  // Collect all unique GUIDs from the found items
  const allGuids = new Set<string>()

  for (const item of items) {
    const guids = this.safeJsonParse<string[]>(
      item.guids,
      [],
      'watchlist_item.guids',
    )
    for (const guid of guids) {
      if (guid && guid.trim() !== '') {
        allGuids.add(guid.trim())
      }
    }
  }

  return Array.from(allGuids)
}

/**
 * Retrieves all users who have a watchlist item containing the specified GUID.
 *
 * Performs a case-insensitive search for the GUID within all watchlist items and returns a distinct list of users, including their IDs, usernames, and watchlist IDs.
 *
 * @param guid - The GUID to search for in users' watchlist items
 * @returns An array of objects, each containing the user's `id`, `username`, and `watchlist_id`
 */
export async function getWatchlistUsersByGuid(
  this: DatabaseService,
  guid: string,
): Promise<
  Array<{
    id: number
    username: string
    watchlist_id: string
  }>
> {
  // Use database-specific JSON functions to efficiently find items containing the GUID
  const users = this.isPostgres
    ? await this.knex('watchlist_items as wi')
        .join('users as u', 'wi.user_id', 'u.id')
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(wi.guids) elem WHERE lower(elem) = lower(?))',
          [guid],
        )
        .select('u.id', 'u.name as username', 'u.watchlist_id')
        .distinct()
    : await this.knex('watchlist_items as wi')
        .join('users as u', 'wi.user_id', 'u.id')
        .whereRaw(
          "EXISTS (SELECT 1 FROM json_each(wi.guids) WHERE json_each.type = 'text' AND lower(json_each.value) = lower(?))",
          [guid],
        )
        .select('u.id', 'u.name as username', 'u.watchlist_id')
        .distinct()

  return users
}

/**
 * Retrieves all watchlist items that contain any of the specified GUIDs, including associated user information.
 *
 * GUID matching is case-insensitive. Each result includes watchlist item fields and the corresponding user's username and watchlist ID for items whose GUIDs array contains at least one of the provided GUIDs.
 *
 * @param guids - List of GUIDs to search for in watchlist items
 * @returns Array of objects containing watchlist item data and associated user information
 */
export async function getWatchlistItemsWithUsersByGuids(
  this: DatabaseService,
  guids: string[],
): Promise<
  Array<{
    // Watchlist item fields
    id: number
    user_id: number
    key: string
    title: string
    type: string
    thumb: string | null
    guids: string[]
    genres: string[]
    status: string
    // User fields
    username: string
    watchlist_id: string
  }>
> {
  if (guids.length === 0) {
    return []
  }

  // Normalize GUIDs to lowercase for consistent matching
  const normalizedGuids = guids.map((guid) => guid.toLowerCase())

  // Use database-specific JSON functions to efficiently find items containing any of the GUIDs
  const items = this.isPostgres
    ? await this.knex('watchlist_items as wi')
        .join('users as u', 'wi.user_id', 'u.id')
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(wi.guids) elem WHERE lower(elem) = ANY(?))',
          [normalizedGuids],
        )
        .select(
          'wi.id',
          'wi.user_id',
          'wi.key',
          'wi.title',
          'wi.type',
          'wi.thumb',
          'wi.guids',
          'wi.genres',
          'wi.status',
          'u.name as username',
          'u.watchlist_id',
        )
    : await this.knex('watchlist_items as wi')
        .join('users as u', 'wi.user_id', 'u.id')
        .where((builder) => {
          // For SQLite, we need to check each GUID individually
          for (const guid of normalizedGuids) {
            builder.orWhereRaw(
              "EXISTS (SELECT 1 FROM json_each(wi.guids) WHERE json_each.type = 'text' AND lower(json_each.value) = ?)",
              [guid],
            )
          }
        })
        .select(
          'wi.id',
          'wi.user_id',
          'wi.key',
          'wi.title',
          'wi.type',
          'wi.thumb',
          'wi.guids',
          'wi.genres',
          'wi.status',
          'u.name as username',
          'u.watchlist_id',
        )

  return items.map((item) => ({
    ...item,
    guids: this.safeJsonParse<string[]>(item.guids, [], 'watchlist_item.guids'),
    genres: this.safeJsonParse<string[]>(
      item.genres,
      [],
      'watchlist_item.genres',
    ),
  }))
}
