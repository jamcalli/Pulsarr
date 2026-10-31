import type {
  ItemRatings,
  TokenWatchlistItem,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import type {
  WatchlistItemUpdate,
  WatchlistStatus,
} from '@root/types/watchlist-status.types.js'
import { whereGuidsContainAny } from '@services/database/guid-filter.js'
import type { DatabaseService } from '@services/database.service.js'
import { chunkArray } from '@utils/chunk-array.js'
import { parseJsonOr } from '@utils/json.js'
import {
  allowedStatusesUpTo,
  STATUS_RANK,
} from '@utils/watchlist-status-rank.js'
import type { Knex } from 'knex'

interface RatingColumns {
  imdb_rating?: number | null
  imdb_votes?: number | null
  rt_critic_rating?: number | null
  rt_audience_rating?: number | null
  tmdb_rating?: number | null
}

/** Returns undefined when the row has no ratings */
function parseRatingsFromRow(row: RatingColumns): ItemRatings | undefined {
  const hasAnyRating =
    row.imdb_rating != null ||
    row.rt_critic_rating != null ||
    row.rt_audience_rating != null ||
    row.tmdb_rating != null

  if (!hasAnyRating) {
    return undefined
  }

  const ratings: ItemRatings = {}

  if (row.imdb_rating != null) {
    ratings.imdb = {
      rating: Number(row.imdb_rating),
      votes: row.imdb_votes ?? null,
    }
  }

  if (row.rt_critic_rating != null) {
    ratings.rtCritic = Number(row.rt_critic_rating)
  }

  if (row.rt_audience_rating != null) {
    ratings.rtAudience = Number(row.rt_audience_rating)
  }

  if (row.tmdb_rating != null) {
    ratings.tmdb = Number(row.tmdb_rating)
  }

  return ratings
}

function ratingsToColumns(ratings: ItemRatings | undefined): RatingColumns {
  if (!ratings) {
    return {}
  }

  return {
    imdb_rating: ratings.imdb?.rating ?? null,
    imdb_votes: ratings.imdb?.votes ?? null,
    rt_critic_rating: ratings.rtCritic ?? null,
    rt_audience_rating: ratings.rtAudience ?? null,
    tmdb_rating: ratings.tmdb ?? null,
  }
}

/** Treats a missing or identical newStatus as a no-op and never moves to a lower-ranked status */
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
    return {
      effectiveStatus: currentStatus,
      shouldUpdateStatus: false,
      shouldWriteHistory: false,
    }
  }

  const currentRank = STATUS_RANK[currentStatus] || 0
  const newRank = STATUS_RANK[newStatus] || 0

  if (newRank < currentRank) {
    log.debug(
      `Preventing status regression for ${context}: ${currentStatus} → ${newStatus}`,
    )
    return {
      effectiveStatus: currentStatus,
      shouldUpdateStatus: false,
      shouldWriteHistory: false,
    }
  } else {
    return {
      effectiveStatus: newStatus,
      shouldUpdateStatus: true,
      shouldWriteHistory: true,
    }
  }
}

/** Ignores duplicate (item, status) rows and logs instead of throwing, so it never aborts the surrounding transaction */
async function recordStatusHistory(
  trx: Knex.Transaction,
  itemId: number,
  status: WatchlistStatus,
  context: string,
  timestamp: string,
  log: DatabaseService['log'],
): Promise<void> {
  try {
    await trx('watchlist_status_history')
      .insert({
        watchlist_item_id: itemId,
        status: status,
        timestamp: timestamp,
      })
      .onConflict(['watchlist_item_id', 'status'])
      .ignore()

    log.debug(
      `Attempted to record status history for ${context} (ignored if duplicate)`,
    )
  } catch (error) {
    log.error(
      { error, itemId, status },
      `Failed to record status history for ${context}`,
    )
  }
}

/** When status is changing, only updates rows whose current status ranks at or below the target */
async function performMonotonicUpdate(
  whereClause: Knex.QueryBuilder,
  updates: Partial<WatchlistItemUpdate> & { updated_at?: string },
  statusResult: {
    shouldUpdateStatus: boolean
    effectiveStatus: WatchlistStatus
  },
  timestamp: string,
): Promise<number> {
  if (statusResult.shouldUpdateStatus) {
    whereClause.whereIn(
      'status',
      allowedStatusesUpTo(statusResult.effectiveStatus),
    )
  }

  const updated = await whereClause.update({
    ...updates,
    updated_at: timestamp,
  })

  return Number(updated) || 0
}

/** Only updates rows whose current status ranks at or below targetStatus */
async function performJunctionMonotonicUpdate(
  trx: Knex.Transaction,
  tableName: string,
  whereClause: Record<string, string | number>,
  targetStatus: WatchlistStatus,
  timestamp: string,
): Promise<number> {
  const query = trx(tableName).where(whereClause)

  query.whereIn('status', allowedStatusesUpTo(targetStatus))

  const updated = await query.update({
    status: targetStatus,
    updated_at: timestamp,
  })

  return Number(updated) || 0
}

/** Status only progresses. Returns true only when the watchlist_items row itself was written. */
export async function updateWatchlistItem(
  this: DatabaseService,
  userId: number,
  key: string,
  updates: WatchlistItemUpdate,
  externalTrx?: Knex.Transaction,
): Promise<boolean> {
  const executeUpdate = async (trx: Knex.Transaction): Promise<boolean> => {
    const item = await trx('watchlist_items')
      .where({ user_id: userId, key })
      .first()

    if (!item) {
      this.log.warn(
        `Tried to update non-existent watchlist item with key: ${key} for user: ${userId}`,
      )
      return false
    }

    const {
      radarr_instance_id,
      sonarr_instance_id,
      sonarr_series_id,
      syncing,
      ...otherUpdates
    } = updates

    const statusResult = processStatusUpdate(
      item.status,
      otherUpdates.status,
      `item ${key}`,
      this.log,
    )

    const effectiveStatus = statusResult.effectiveStatus
    let finalStatusUpdate = { ...otherUpdates }

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

    let updatedRows = 0
    if (Object.keys(finalStatusUpdate).length > 0) {
      updatedRows = await performMonotonicUpdate(
        trx('watchlist_items').where({ user_id: userId, key }),
        finalStatusUpdate,
        statusResult,
        this.timestamp,
      )
    }

    if (statusResult.shouldWriteHistory && updatedRows > 0) {
      await recordStatusHistory(
        trx,
        item.id,
        effectiveStatus,
        `${item.status} → ${effectiveStatus} for item ${key}`,
        this.timestamp,
        this.log,
      )
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
            syncing ?? false,
            trx,
          )
        } else {
          await this.setPrimaryRadarrInstance(item.id, radarr_instance_id, trx)

          // Keep junction status in sync on progressions
          if (statusResult.shouldUpdateStatus) {
            await performJunctionMonotonicUpdate(
              trx,
              'watchlist_radarr_instances',
              {
                watchlist_id: item.id,
                radarr_instance_id,
              },
              effectiveStatus,
              this.timestamp,
            )
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
            syncing ?? false,
            trx,
            sonarr_series_id,
          )
        } else {
          await this.setPrimarySonarrInstance(item.id, sonarr_instance_id, trx)

          // Keep junction status in sync on progressions
          if (statusResult.shouldUpdateStatus) {
            await performJunctionMonotonicUpdate(
              trx,
              'watchlist_sonarr_instances',
              {
                watchlist_id: item.id,
                sonarr_instance_id,
              },
              effectiveStatus,
              this.timestamp,
            )
          }

          if (syncing !== undefined) {
            await this.updateSonarrSyncingStatus(
              item.id,
              sonarr_instance_id,
              syncing ?? false,
              trx,
            )
          }

          if (sonarr_series_id !== undefined) {
            await trx('watchlist_sonarr_instances')
              .where({
                watchlist_id: item.id,
                sonarr_instance_id,
              })
              .update({
                sonarr_series_id,
                updated_at: this.timestamp,
              })
          }
        }
      }
    }
    return updatedRows > 0
  }

  if (externalTrx) {
    return await executeUpdate(externalTrx)
  }
  return await this.knex.transaction(executeUpdate)
}

export async function getWatchlistItemById(
  this: DatabaseService,
  id: number,
): Promise<WatchlistItem | undefined> {
  const result = await this.knex('watchlist_items').where('id', id).first()

  if (!result) return undefined

  return {
    ...result,
    guids: parseJsonOr(result.guids, [], this.log, 'watchlist_item.guids'),
    genres: parseJsonOr(result.genres, [], this.log, 'watchlist_item.genres'),
    ratings: parseRatingsFromRow(result),
  }
}

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
    logContext,
    `Query returned ${results.length} total matches from database`,
  )

  return results.map((row) => ({
    ...row,
    guids: parseJsonOr(row.guids, [], this.log, 'watchlist_item.guids'),
    genres: parseJsonOr(row.genres, [], this.log, 'watchlist_item.genres'),
    ratings: parseRatingsFromRow(row),
  }))
}

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

  this.log.debug(
    {
      keyCount: keys.length,
      resultCount: items.length,
    },
    `Retrieved ${items.length} items by keys`,
  )

  return items.map((item) => ({
    ...item,
    thumb: item.thumb || undefined,
    added: item.added || undefined,
    guids: parseJsonOr(item.guids, [], this.log, 'watchlist_item.guids'),
    genres: parseJsonOr(item.genres, [], this.log, 'watchlist_item.genres'),
    ratings: parseRatingsFromRow(item),
  }))
}

/** Status only progresses, and the return counts rows actually written. Junction rows are not touched. */
export async function bulkUpdateWatchlistItems(
  this: DatabaseService,
  updates: Array<{
    userId: number
    key: string
    added?: string
    status?: 'pending' | 'requested' | 'grabbed' | 'notified'
    series_status?: 'continuing' | 'ended'
    movie_status?: 'available' | 'unavailable'
  }>,
): Promise<number> {
  let updatedCount = 0

  await this.knex.transaction(async (trx) => {
    const chunks = chunkArray(updates, 100)

    for (const chunk of chunks) {
      for (const update of chunk) {
        const currentItem = await trx('watchlist_items')
          .where({
            user_id: update.userId,
            key: update.key,
          })
          .select('id', 'status')
          .first()

        if (!currentItem) continue

        const statusResult = processStatusUpdate(
          currentItem.status,
          update.status,
          `bulk update item ${update.key}`,
          this.log,
        )

        const effectiveStatus = statusResult.effectiveStatus

        const mainTableFields: Partial<
          Record<'added' | 'series_status' | 'movie_status' | 'status', string>
        > = {}
        if (update.added !== undefined) mainTableFields.added = update.added
        if (update.series_status !== undefined)
          mainTableFields.series_status = update.series_status
        if (update.movie_status !== undefined)
          mainTableFields.movie_status = update.movie_status
        if (statusResult.shouldUpdateStatus)
          mainTableFields.status = effectiveStatus

        let wroteMain = false
        if (Object.keys(mainTableFields).length > 0) {
          const builder = trx('watchlist_items').where({
            user_id: update.userId,
            key: update.key,
          })
          if (statusResult.shouldUpdateStatus) {
            builder.whereIn('status', allowedStatusesUpTo(effectiveStatus))
          }
          const updated = await builder.update({
            ...mainTableFields,
            updated_at: this.timestamp,
          })

          const numericUpdated = Number(updated)
          if (!Number.isNaN(numericUpdated) && numericUpdated > 0) {
            updatedCount += 1
            wroteMain = true
          }
        }

        if (statusResult.shouldWriteHistory && wroteMain) {
          await recordStatusHistory(
            trx,
            currentItem.id,
            effectiveStatus,
            `${currentItem.status} → ${effectiveStatus} for bulk update item ${update.key}`,
            this.timestamp,
            this.log,
          )
        }
      }
    }
  })

  return updatedCount
}

/** Maps each title to whether a watchlist_add notification was already sent to the user */
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

export async function syncGenresFromWatchlist(
  this: DatabaseService,
): Promise<void> {
  const items = await this.knex('watchlist_items')
    .whereNotNull('genres')
    .where('genres', '!=', '[]')
    .select('genres')

  const uniqueGenres = new Set<string>()

  for (const row of items) {
    const parsedGenres = parseJsonOr<string[]>(
      row.genres,
      [],
      this.log,
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

export async function getAllGenres(
  this: DatabaseService,
): Promise<Array<{ id: number; name: string; is_custom: boolean }>> {
  return await this.knex('genres')
    .select('id', 'name', 'is_custom')
    .orderBy('name', 'asc')
}

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
        ? parseJsonOr(item.guids, [], this.log, 'watchlist_item.guids')
        : item.guids || [],
    genres:
      typeof item.genres === 'string'
        ? parseJsonOr(item.genres, [], this.log, 'watchlist_item.genres')
        : item.genres || [],
    ratings: parseRatingsFromRow(item),
  }))
}

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
        ? parseJsonOr(item.guids, [], this.log, 'watchlist_item.guids')
        : item.guids || [],
    genres:
      typeof item.genres === 'string'
        ? parseJsonOr(item.genres, [], this.log, 'watchlist_item.genres')
        : item.genres || [],
    ratings: parseRatingsFromRow(item),
  }))
}

/** Merge mode refreshes metadata only and never overwrites status */
export async function createWatchlistItems(
  this: DatabaseService,
  items: Omit<WatchlistItem, 'created_at' | 'updated_at'>[],
  options: { onConflict?: 'ignore' | 'merge' } = { onConflict: 'ignore' },
): Promise<{ id: number; user_id: number; key: string }[]> {
  const insertedIds: { id: number; user_id: number; key: string }[] = []

  await this.knex.transaction(async (trx) => {
    const chunks = chunkArray(items, 250)

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
        ...ratingsToColumns(item.ratings),
        status: item.status || 'pending',
        created_at: this.timestamp,
        updated_at: this.timestamp,
      }))

      const query = trx('watchlist_items').insert(itemsToInsert)

      if (options.onConflict === 'merge') {
        // Metadata refresh must never overwrite status, since that would regress it
        const results = await query
          .onConflict(['user_id', 'key'])
          .merge([
            'title',
            'type',
            'thumb',
            'guids',
            'genres',
            'imdb_rating',
            'imdb_votes',
            'rt_critic_rating',
            'rt_audience_rating',
            'tmdb_rating',
            'updated_at',
          ])
          .returning(['id', 'user_id', 'key'])
        insertedIds.push(...results)
      } else {
        const results = await query
          .onConflict(['user_id', 'key'])
          .ignore()
          .returning(['id', 'user_id', 'key'])
        insertedIds.push(...results)
      }
    }
  })

  return insertedIds
}

/** Also deletes the items' watchlist_add notifications, and public notifications once no other user has the title, so re-adds notify again */
export async function deleteWatchlistItems(
  this: DatabaseService,
  userId: number,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return

  const numericUserId =
    typeof userId === 'object' ? (userId as { id: number }).id : userId

  await this.knex.transaction(async (trx) => {
    const itemsToDelete = await trx('watchlist_items')
      .where('user_id', numericUserId)
      .whereIn('key', keys)
      .select('title', 'type')

    // watchlist_add notifications usually have a NULL watchlist_item_id, so the CASCADE below misses them
    if (itemsToDelete.length > 0) {
      let totalDeleted = 0

      for (const item of itemsToDelete) {
        const messagePattern =
          item.type === 'movie'
            ? '%movie%'
            : item.type === 'show'
              ? '%show%'
              : '%'

        const query = trx('notifications').where({
          user_id: numericUserId,
          type: 'watchlist_add',
          notification_status: 'active',
          title: item.title,
        })

        if (this.isPostgres) {
          query.andWhere('message', 'ilike', messagePattern)
        } else {
          // SQLite's LIKE is case-insensitive by default
          query.andWhere('message', 'like', messagePattern)
        }

        const deleteCount = await query.del()

        totalDeleted += deleteCount

        const remaining = await trx('watchlist_items')
          .where('title', item.title)
          .where('type', item.type)
          .whereNot('user_id', numericUserId)
          .first()

        if (!remaining) {
          const notificationTypes =
            item.type === 'movie' ? ['movie'] : ['episode', 'season']

          const publicDeleted = await trx('notifications')
            .where({
              user_id: null,
              watchlist_item_id: null,
              title: item.title,
              notification_status: 'active',
            })
            .whereIn('type', notificationTypes)
            .del()

          if (publicDeleted > 0) {
            this.log.debug(
              `Deleted ${publicDeleted} orphaned public notification(s) for "${item.title}" (no users have this content watchlisted)`,
            )
          }
        }
      }

      if (totalDeleted > 0) {
        this.log.debug(
          `Deleted ${totalDeleted} watchlist_add notification(s) for user ${numericUserId} during watchlist item deletion`,
        )
      }
    }

    // Delete watchlist items (CASCADE will handle notifications with non-NULL watchlist_item_id)
    await trx('watchlist_items')
      .where('user_id', numericUserId)
      .whereIn('key', keys)
      .delete()
  })
}

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
    guids: parseJsonOr(item.guids, [], this.log, 'watchlist_item.guids'),
    genres: parseJsonOr(item.genres, [], this.log, 'watchlist_item.genres'),
    ratings: parseRatingsFromRow(item),
  }))
}

/** Matches the guid case-insensitively and only within `type`, since tmdb ids are namespaced per media kind. */
export async function getWatchlistItemsByGuid(
  this: DatabaseService,
  guid: string,
  type: 'movie' | 'show',
): Promise<TokenWatchlistItem[]> {
  const items = await whereGuidsContainAny(
    this.knex('watchlist_items').where('type', type),
    'guids',
    [guid],
    this.isPostgres,
  ).select('*')

  return items.map((item) => ({
    ...item,
    id: String(item.id),
    guids: parseJsonOr<string[]>(
      item.guids,
      [],
      this.log,
      'watchlist_item.guids',
    ),
    genres: parseJsonOr<string[]>(
      item.genres,
      [],
      this.log,
      'watchlist_item.genres',
    ),
    ratings: parseRatingsFromRow(item),
  }))
}

export async function getWatchlistItemsWithUsersByGuids(
  this: DatabaseService,
  guids: string[],
): Promise<
  Array<{
    id: number
    user_id: number
    key: string
    title: string
    type: string
    thumb: string | null
    guids: string[]
    genres: string[]
    status: string
    username: string
  }>
> {
  if (guids.length === 0) {
    return []
  }

  const items = await whereGuidsContainAny(
    this.knex('watchlist_items as wi').join('users as u', 'wi.user_id', 'u.id'),
    'wi.guids',
    guids,
    this.isPostgres,
  ).select(
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
  )

  return items.map((item) => ({
    ...item,
    guids: parseJsonOr<string[]>(
      item.guids,
      [],
      this.log,
      'watchlist_item.guids',
    ),
    genres: parseJsonOr<string[]>(
      item.genres,
      [],
      this.log,
      'watchlist_item.genres',
    ),
  }))
}
