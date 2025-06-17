import type { DatabaseService } from '@services/database.service.js'
import type {
  TokenWatchlistItem,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import type { WatchlistItemUpdate } from '@root/types/watchlist-status.types.js'
import { parseGuids } from '@utils/guid-handler.js'

/**
 * Updates a watchlist item by key with given changes
 *
 * @param key - Unique key of the watchlist item
 * @param updates - Fields to update on the watchlist item
 * @returns Promise resolving to void when complete
 */
export async function updateWatchlistItem(
  this: DatabaseService,
  key: string,
  updates: WatchlistItemUpdate,
): Promise<void> {
  if (key.startsWith('selfRSS_') || key.startsWith('friendsRSS_')) {
    this.log.debug(`Skipping temporary RSS key: ${key}`)
    return
  }

  await this.knex.transaction(async (trx) => {
    const item = await trx('watchlist_items').where({ key }).first()

    if (!item) {
      this.log.warn(
        `Tried to update non-existent watchlist item with key: ${key}`,
      )
      return
    }

    const { radarr_instance_id, sonarr_instance_id, syncing, ...otherUpdates } =
      updates

    if (Object.keys(otherUpdates).length > 0) {
      await trx('watchlist_items')
        .where({ key })
        .update({
          ...otherUpdates,
          updated_at: this.timestamp,
        })
    }

    if (radarr_instance_id !== undefined) {
      if (radarr_instance_id === null) {
        await trx('watchlist_radarr_instances')
          .where({ watchlist_id: item.id })
          .delete()
      } else {
        const existingInstanceIds = await this.getWatchlistRadarrInstanceIds(
          item.id,
        )

        if (!existingInstanceIds.includes(radarr_instance_id)) {
          await this.addWatchlistToRadarrInstance(
            item.id,
            radarr_instance_id,
            updates.status || item.status || 'pending',
            true,
            syncing || false,
          )
        } else {
          await this.setPrimaryRadarrInstance(item.id, radarr_instance_id)

          if (syncing !== undefined) {
            await this.updateRadarrSyncingStatus(
              item.id,
              radarr_instance_id,
              syncing ?? false,
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
        )

        if (!existingInstanceIds.includes(sonarr_instance_id)) {
          await this.addWatchlistToSonarrInstance(
            item.id,
            sonarr_instance_id,
            updates.status || item.status || 'pending',
            true,
            syncing || false,
          )
        } else {
          await this.setPrimarySonarrInstance(item.id, sonarr_instance_id)

          if (syncing !== undefined) {
            await this.updateSonarrSyncingStatus(
              item.id,
              sonarr_instance_id,
              syncing ?? false,
            )
          }
        }
      }
    }
  })
}

/**
 * Updates watchlist items by GUID
 *
 * @param guid - GUID to match against watchlist item GUIDs array
 * @param updates - Fields to update on matching watchlist items
 * @returns Promise resolving to the number of items updated
 */
export async function updateWatchlistItemByGuid(
  this: DatabaseService,
  guid: string,
  updates: {
    sonarr_instance_id?: number | null
    radarr_instance_id?: number | null
  },
): Promise<number> {
  // Use database-specific JSON functions to filter efficiently
  const matchingIds = this.isPostgreSQL()
    ? await this.knex('watchlist_items')
        .whereRaw(
          'EXISTS (SELECT 1 FROM jsonb_array_elements_text(guids) elem WHERE lower(elem) = lower(?))',
          [guid],
        )
        .pluck('id')
    : await this.knex('watchlist_items')
        .whereRaw(
          "EXISTS (SELECT 1 FROM json_each(guids) WHERE json_each.type = 'text' AND lower(json_each.value) = lower(?))",
          [guid],
        )
        .pluck('id')

  if (matchingIds.length === 0) {
    this.log.warn(`No items found with GUID: ${guid}`)
    return 0
  }

  const updateCount = await this.knex('watchlist_items')
    .whereIn('id', matchingIds)
    .update({
      ...updates,
      updated_at: this.timestamp,
    })

  this.log.debug(`Updated ${updateCount} items by GUID ${guid}`)
  return updateCount
}

/**
 * Retrieves a watchlist item for a specific user
 *
 * @param userId - ID of the user
 * @param key - Unique key of the watchlist item
 * @returns Promise resolving to the watchlist item if found, undefined otherwise
 */
export async function getWatchlistItem(
  this: DatabaseService,
  userId: number,
  key: string,
): Promise<WatchlistItem | undefined> {
  const numericUserId =
    typeof userId === 'object' ? (userId as { id: number }).id : userId

  return await this.knex('watchlist_items')
    .where({
      user_id: numericUserId,
      key,
    })
    .first()
}

/**
 * Retrieves multiple watchlist items for multiple users
 *
 * @param userIds - Array of user IDs
 * @param keys - Optional array of watchlist item keys to filter by
 * @returns Promise resolving to an array of matching watchlist items
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
 * Retrieves watchlist items by their keys
 *
 * @param keys - Array of watchlist item keys to retrieve
 * @returns Promise resolving to an array of matching watchlist items
 */
export async function getWatchlistItemsByKeys(
  this: DatabaseService,
  keys: string[],
): Promise<WatchlistItem[]> {
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

  return items
}

/**
 * Bulk updates multiple watchlist items
 *
 * @param updates - Array of watchlist item updates with user ID and key
 * @returns Promise resolving to the number of items updated
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
          updatedCount +=
            !Number.isNaN(numericUpdated) && numericUpdated > 0 ? 1 : 0
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
                status: update.status || currentItem.status,
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
                  status: update.status || existingAssoc.status,
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
                status: update.status || currentItem.status,
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
                  status: update.status || existingAssoc.status,
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

        if (update.status && update.status !== currentItem.status) {
          await trx('watchlist_status_history').insert({
            watchlist_item_id: currentItem.id,
            status: update.status,
            timestamp: this.timestamp,
          })

          this.log.debug(
            `Status change for item ${currentItem.id}: ${currentItem.status} -> ${update.status}`,
          )
        }
      }
    }
  })

  return updatedCount
}

/**
 * Retrieves all GUIDs from watchlist items in an optimized way
 *
 * @returns Promise resolving to array of lowercase GUIDs
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
 * Gets all notifications of a specific type for a user
 *
 * @param userId - ID of the user
 * @param type - Type of notification to fetch
 * @returns Promise resolving to array of notifications
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
 * Gets all watchlist items with their GUIDs for type-based filtering
 *
 * @param types - Optional array of types to filter by (e.g., ['movie', 'show'])
 * @returns Promise resolving to array of items with their guids
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
 * Batch check if items have had webhooks sent
 *
 * @param userId - The user ID to check
 * @param titles - Array of titles to check for existing notifications
 * @returns Promise resolving to a map of title to boolean (true if notification exists)
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
 * Cross-database compatible GUID extraction
 *
 * @returns Promise resolving to array of lowercase GUIDs
 */
export async function getUniqueGuidsRaw(
  this: DatabaseService,
): Promise<string[]> {
  if (this.isPostgreSQL()) {
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
 * Synchronizes genres from watchlist items to the genres table
 *
 * @returns Promise resolving to void when complete
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
 * Adds a custom genre to the genres table
 *
 * @param name - Name of the genre to add
 * @returns Promise resolving to the ID of the created genre
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
 * Retrieves all genres from the genres table
 *
 * @returns Promise resolving to array of all genres
 */
export async function getAllGenres(
  this: DatabaseService,
): Promise<Array<{ id: number; name: string; is_custom: boolean }>> {
  return await this.knex('genres')
    .select('id', 'name', 'is_custom')
    .orderBy('name', 'asc')
}

/**
 * Deletes a custom genre from the genres table
 *
 * @param id - ID of the genre to delete
 * @returns Promise resolving to true if deleted, false otherwise
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
 * Bulk updates the status of show watchlist items
 *
 * @param updates - Array of show status updates
 * @returns Promise resolving to the number of items updated
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
 * Retrieves all show watchlist items
 *
 * @returns Promise resolving to array of all show watchlist items
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
 * Retrieves all movie watchlist items
 *
 * @returns Promise resolving to array of all movie watchlist items
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
 * Creates multiple watchlist items in the database
 *
 * @param items - Array of watchlist items to create
 * @param options - Configuration options for how to handle conflicts
 * @returns Promise resolving to void when complete
 */
export async function createWatchlistItems(
  this: DatabaseService,
  items: Omit<WatchlistItem, 'created_at' | 'updated_at'>[],
  options: { onConflict?: 'ignore' | 'merge' } = { onConflict: 'ignore' },
): Promise<void> {
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
        query.onConflict(['user_id', 'key']).merge()
      } else {
        query.onConflict(['user_id', 'key']).ignore()
      }

      await query
    }
  })
}

/**
 * Creates temporary RSS items for tracking changes between syncs
 *
 * @param items - Array of temporary RSS items to create
 * @returns Promise resolving to void when complete
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
 * Retrieves temporary RSS items
 *
 * @param source - Optional source filter ('self' or 'friends')
 * @returns Promise resolving to array of temporary RSS items
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
 * Deletes specific temporary RSS items by ID
 *
 * @param ids - Array of item IDs to delete
 * @returns Promise resolving to void when complete
 */
export async function deleteTempRssItems(
  this: DatabaseService,
  ids: number[],
): Promise<void> {
  await this.knex('temp_rss_items').whereIn('id', ids).delete()
}

/**
 * Deletes all temporary RSS items
 *
 * @param source - Optional source filter ('self' or 'friends')
 * @returns Promise resolving to void when complete
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
 * Deletes watchlist items for a specific user
 *
 * @param userId - ID of the user
 * @param keys - Array of watchlist item keys to delete
 * @returns Promise resolving to void when complete
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
 * Retrieves all watchlist items for a specific user
 *
 * @param userId - ID of the user
 * @returns Promise resolving to array of all watchlist items for the user
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
 * Retrieves watchlist items that match a specific GUID
 *
 * @param guid - GUID to match against watchlist items
 * @returns Promise resolving to array of matching watchlist items
 */
export async function getWatchlistItemsByGuid(
  this: DatabaseService,
  guid: string,
): Promise<TokenWatchlistItem[]> {
  // Use database-specific JSON functions to filter efficiently at database level
  const items = this.isPostgreSQL()
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
