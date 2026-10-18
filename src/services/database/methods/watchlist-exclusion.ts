import type { WatchlistStatus } from '@root/schemas/common/watchlist-status.schema.js'
import type {
  CreateWatchlistExclusion,
  WatchlistExclusionItem,
  WatchlistExclusionItemsFilter,
  WatchlistExclusionItemsQuery,
  WatchlistExclusionScope,
} from '@root/schemas/watchlist-exclusions/watchlist-exclusions.schema.js'
import type { WatchlistExclusion } from '@root/types/watchlist-exclusion.types.js'
import { applySearchFilter } from '@services/database/search-filter.js'
import type { DatabaseService } from '@services/database.service.js'
import { toContentType } from '@utils/content-type.js'
import { errorMessage } from '@utils/error-message.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { Knex } from 'knex'

/**
 * Sentinel user id representing a global exclusion that vetoes routing for the
 * matching key for all users.
 */
export const SYSTEM_USER_ID = 0

/**
 * Inserts an exclusion row for each user, skipping duplicates.
 *
 * @returns Number of rows inserted (excludes duplicates)
 */
export async function excludeWatchlistItem(
  this: DatabaseService,
  key: string,
  userIds: number[],
  title: string,
  type: string,
  guids: string[],
): Promise<number> {
  return insertExclusionRows(this.knex, this.timestamp, {
    key,
    userIds,
    title,
    type,
    guids,
  })
}

interface ExclusionRowsInput {
  key: string
  userIds: number[]
  title: string
  type: string
  guids: string[]
}

async function insertExclusionRows(
  executor: Knex | Knex.Transaction,
  excludedAt: string,
  item: ExclusionRowsInput,
): Promise<number> {
  if (item.userIds.length === 0) return 0

  const guidsJson = JSON.stringify(item.guids)

  const rows = item.userIds.map((userId) => ({
    user_id: userId,
    key: item.key,
    title: item.title,
    type: item.type,
    guids: guidsJson,
    excluded_at: excludedAt,
  }))

  const insertedRows = await executor('watchlist_exclusions')
    .insert(rows)
    .onConflict(['user_id', 'key'])
    .ignore()
    .returning('id')

  return insertedRows.length
}

/** Global scope writes one SYSTEM_USER_ID row per item, and a failing item rolls back alone. */
export async function bulkExcludeWatchlistItems(
  this: DatabaseService,
  items: CreateWatchlistExclusion[],
  scope: WatchlistExclusionScope,
): Promise<{
  created: number
  skipped: number
  failed: string[]
  errors: string[]
}> {
  const result = {
    created: 0,
    skipped: 0,
    failed: [] as string[],
    errors: [] as string[],
  }
  const excludedAt = this.timestamp

  await this.knex.transaction(async (trx) => {
    for (const item of items) {
      const userIds = scope === 'global' ? [SYSTEM_USER_ID] : item.userIds
      try {
        const created = await trx.transaction((savepoint) =>
          insertExclusionRows(savepoint, excludedAt, { ...item, userIds }),
        )
        result.created += created
        result.skipped += userIds.length - created
      } catch (error) {
        result.failed.push(item.key)
        result.errors.push(`${item.key}: ${errorMessage(error)}`)
      }
    }
  })

  return result
}

/**
 * Removes exclusion rows for the user across the given keys.
 *
 * @returns Number of rows deleted
 */
export async function clearExclusions(
  this: DatabaseService,
  userId: number,
  keys: string[],
): Promise<number> {
  if (keys.length === 0) return 0

  return await this.knex('watchlist_exclusions')
    .where('user_id', userId)
    .whereIn('key', keys)
    .delete()
}

/**
 * Returns a map of key → set of user ids that have excluded that key.
 */
export async function getExclusionMap(
  this: DatabaseService,
): Promise<Map<string, Set<number>>> {
  const rows = await this.knex('watchlist_exclusions').select('key', 'user_id')

  const map = new Map<string, Set<number>>()

  for (const row of rows) {
    let userSet = map.get(row.key)
    if (!userSet) {
      userSet = new Set<number>()
      map.set(row.key, userSet)
    }
    userSet.add(row.user_id)
  }

  return map
}

/**
 * Returns the subset of given keys that the user currently has excluded.
 */
export async function findExcludedKeys(
  this: DatabaseService,
  userId: number,
  keys: string[],
): Promise<string[]> {
  if (keys.length === 0) return []

  const rows = await this.knex('watchlist_exclusions')
    .where('user_id', userId)
    .whereIn('key', keys)
    .select('key')

  return rows.map((r) => r.key)
}

/**
 * Returns all exclusions for a user, most recent first.
 */
export async function getExclusionsForUser(
  this: DatabaseService,
  userId: number,
): Promise<WatchlistExclusion[]> {
  const rows = await this.knex('watchlist_exclusions')
    .where('user_id', userId)
    .orderBy('excluded_at', 'desc')
    .select('*')

  return rows.map((row) => ({ ...row, guids: parseGuids(row.guids) }))
}

/**
 * Returns all exclusions joined with the owning user's name.
 */
export async function getAllExclusions(
  this: DatabaseService,
): Promise<Array<WatchlistExclusion & { username: string }>> {
  const rows = await this.knex('watchlist_exclusions as we')
    .join('users as u', 'we.user_id', 'u.id')
    .select(
      'we.id',
      'we.user_id',
      'we.key',
      'we.title',
      'we.type',
      'we.guids',
      'we.excluded_at',
      'u.name as username',
    )
    .orderBy('we.excluded_at', 'desc')

  return rows.map((row) => ({ ...row, guids: parseGuids(row.guids) }))
}

interface ExclusionItemRow {
  key: string
  title: string
  type: string
  guids: string | null
  thumb: string | null
  user_id: number | null
  user_name: string | null
  status: WatchlistStatus | null
  added: string | null
  own_id: number | null
  own_excluded_at: string | null
  global_id: number | null
  global_excluded_at: string | null
}

const EXCLUSION_ITEM_SORT_COLUMNS: Record<
  WatchlistExclusionItemsQuery['sortBy'],
  string
> = {
  title: 'items.title',
  userName: 'items.user_name',
  status: 'items.status',
  added: 'items.added',
  excludedAt: 'items.excluded_at',
}

function exclusionItemsUnion(db: DatabaseService): Knex.QueryBuilder {
  const { knex } = db
  // Postgres rejects UNION branches whose types differ (json vs jsonb, enum, bare NULL), so every column is cast
  const cast = (
    column: string | null,
    type: 'TEXT' | 'INTEGER',
    alias: string,
  ) =>
    column === null
      ? knex.raw(`CAST(NULL AS ${type}) AS ??`, [alias])
      : knex.raw(`CAST(?? AS ${type}) AS ??`, [column, alias])
  const excludedAt = (own: string | null, global: string) =>
    own === null
      ? cast(global, 'TEXT', 'excluded_at')
      : knex.raw('CAST(COALESCE(??, ??) AS TEXT) AS ??', [
          own,
          global,
          'excluded_at',
        ])
  const joinGlobal = (keyColumn: string) =>
    function (this: Knex.JoinClause) {
      this.on('glob.key', '=', keyColumn).andOnVal(
        'glob.user_id',
        '=',
        SYSTEM_USER_ID,
      )
    }

  const watchlisted = knex('watchlist_items as wi')
    .join('users as u', 'u.id', 'wi.user_id')
    .leftJoin('watchlist_exclusions as own', function () {
      this.on('own.user_id', '=', 'wi.user_id').andOn('own.key', '=', 'wi.key')
    })
    .leftJoin('watchlist_exclusions as glob', joinGlobal('wi.key'))
    .whereNot('wi.user_id', SYSTEM_USER_ID)
    .select(
      cast('wi.key', 'TEXT', 'key'),
      cast('wi.title', 'TEXT', 'title'),
      cast('wi.type', 'TEXT', 'type'),
      cast('wi.guids', 'TEXT', 'guids'),
      cast('wi.thumb', 'TEXT', 'thumb'),
      cast('wi.user_id', 'INTEGER', 'user_id'),
      cast('u.name', 'TEXT', 'user_name'),
      cast('wi.status', 'TEXT', 'status'),
      cast('wi.added', 'TEXT', 'added'),
      cast('own.id', 'INTEGER', 'own_id'),
      cast('own.excluded_at', 'TEXT', 'own_excluded_at'),
      cast('glob.id', 'INTEGER', 'global_id'),
      cast('glob.excluded_at', 'TEXT', 'global_excluded_at'),
      excludedAt('own.excluded_at', 'glob.excluded_at'),
    )

  const orphanOwn = knex('watchlist_exclusions as own')
    .join('users as u', 'u.id', 'own.user_id')
    .leftJoin('watchlist_exclusions as glob', joinGlobal('own.key'))
    .whereNot('own.user_id', SYSTEM_USER_ID)
    .whereNotExists((sub) =>
      sub
        .select(1)
        .from('watchlist_items as wi')
        .where('wi.user_id', knex.ref('own.user_id'))
        .andWhere('wi.key', knex.ref('own.key')),
    )
    .select(
      cast('own.key', 'TEXT', 'key'),
      cast('own.title', 'TEXT', 'title'),
      cast('own.type', 'TEXT', 'type'),
      cast('own.guids', 'TEXT', 'guids'),
      cast(null, 'TEXT', 'thumb'),
      cast('own.user_id', 'INTEGER', 'user_id'),
      cast('u.name', 'TEXT', 'user_name'),
      cast(null, 'TEXT', 'status'),
      cast(null, 'TEXT', 'added'),
      cast('own.id', 'INTEGER', 'own_id'),
      cast('own.excluded_at', 'TEXT', 'own_excluded_at'),
      cast('glob.id', 'INTEGER', 'global_id'),
      cast('glob.excluded_at', 'TEXT', 'global_excluded_at'),
      excludedAt('own.excluded_at', 'glob.excluded_at'),
    )

  const orphanGlobal = knex('watchlist_exclusions as glob')
    .where('glob.user_id', SYSTEM_USER_ID)
    .whereNotExists((sub) =>
      sub
        .select(1)
        .from('watchlist_items as wi')
        .where('wi.key', knex.ref('glob.key')),
    )
    .whereNotExists((sub) =>
      sub
        .select(1)
        .from('watchlist_exclusions as own')
        .where('own.key', knex.ref('glob.key'))
        .whereNot('own.user_id', SYSTEM_USER_ID),
    )
    .select(
      cast('glob.key', 'TEXT', 'key'),
      cast('glob.title', 'TEXT', 'title'),
      cast('glob.type', 'TEXT', 'type'),
      cast('glob.guids', 'TEXT', 'guids'),
      cast(null, 'TEXT', 'thumb'),
      cast(null, 'INTEGER', 'user_id'),
      cast(null, 'TEXT', 'user_name'),
      cast(null, 'TEXT', 'status'),
      cast(null, 'TEXT', 'added'),
      cast(null, 'INTEGER', 'own_id'),
      cast(null, 'TEXT', 'own_excluded_at'),
      cast('glob.id', 'INTEGER', 'global_id'),
      cast('glob.excluded_at', 'TEXT', 'global_excluded_at'),
      excludedAt(null, 'glob.excluded_at'),
    )

  return knex.from(watchlisted.unionAll([orphanOwn, orphanGlobal]).as('items'))
}

function filterExclusionItems(
  db: DatabaseService,
  filter: WatchlistExclusionItemsFilter,
): Knex.QueryBuilder {
  let query = exclusionItemsUnion(db)

  if (filter.search) {
    query = applySearchFilter(
      query,
      filter.search,
      'items.title',
      db.isPostgres,
    )
  }
  if (filter.userId !== undefined) {
    query = query.where('items.user_id', filter.userId)
  }
  if (filter.type) {
    query = query.where('items.type', filter.type)
  }
  if (filter.status) {
    query = query.where('items.status', filter.status)
  }
  if (filter.exclusion === 'excluded') {
    query = query.where((q) =>
      q.whereNotNull('items.own_id').orWhereNotNull('items.global_id'),
    )
  } else if (filter.exclusion === 'not-excluded') {
    query = query.whereNull('items.own_id').whereNull('items.global_id')
  } else if (filter.exclusion === 'orphan') {
    query = query.whereNull('items.status')
  }

  return query
}

// SQLite sorts NULL first ascending and Postgres sorts it last, so null placement is explicit
function orderNullsLast(
  query: Knex.QueryBuilder,
  column: string,
  direction: 'asc' | 'desc',
): Knex.QueryBuilder {
  return query
    .orderByRaw('CASE WHEN ?? IS NULL THEN 1 ELSE 0 END', [column])
    .orderBy(column, direction)
}

/** Watchlist items with their own and global exclusions, plus exclusion rows whose item is gone. */
export async function getWatchlistExclusionItems(
  this: DatabaseService,
  query: WatchlistExclusionItemsQuery,
): Promise<WatchlistExclusionItem[]> {
  let builder = filterExclusionItems(this, query).select<ExclusionItemRow[]>(
    'items.*',
  )
  builder = orderNullsLast(
    builder,
    EXCLUSION_ITEM_SORT_COLUMNS[query.sortBy],
    query.sortOrder,
  )
  builder = orderNullsLast(builder.orderBy('items.key'), 'items.user_id', 'asc')

  const rows: ExclusionItemRow[] = await builder
    .limit(query.limit)
    .offset(query.offset)

  return rows.map((row) => ({
    key: row.key,
    title: row.title,
    type: toContentType(row.type),
    guids: parseGuids(row.guids ?? undefined),
    thumb: row.thumb,
    userId: row.user_id,
    userName: row.user_name,
    status: row.status,
    added: row.added,
    ownExclusion:
      row.own_id === null || row.own_excluded_at === null
        ? null
        : { id: row.own_id, excludedAt: row.own_excluded_at },
    globalExclusion:
      row.global_id === null || row.global_excluded_at === null
        ? null
        : { id: row.global_id, excludedAt: row.global_excluded_at },
  }))
}

/** Total rows getWatchlistExclusionItems matches across all pages. */
export async function getWatchlistExclusionItemsCount(
  this: DatabaseService,
  filter: WatchlistExclusionItemsFilter,
): Promise<number> {
  const result = await filterExclusionItems(this, filter)
    .count('* as count')
    .first()
  return Number.parseInt(String(result?.count), 10) || 0
}

/** Ids are deduped, so `total` counts distinct ids and ids that matched no row come back in `failed`. */
export async function bulkRemoveExclusions(
  this: DatabaseService,
  ids: number[],
): Promise<{
  removed: number
  failed: number[]
  errors: string[]
  total: number
}> {
  const uniqueIds = [...new Set(ids)]
  return this.knex.transaction(async (trx) => {
    const existing = await trx('watchlist_exclusions')
      .whereIn('id', uniqueIds)
      .pluck<number[]>('id')
    const found = new Set(existing)
    const failed = uniqueIds.filter((id) => !found.has(id))
    const removed = await trx('watchlist_exclusions')
      .whereIn('id', existing)
      .delete()

    return {
      removed,
      failed,
      errors: failed.map((id) => `Exclusion ${id} not found`),
      total: uniqueIds.length,
    }
  })
}

/**
 * Removes a single exclusion by id.
 *
 * @returns True if a row was deleted
 */
export async function removeExclusion(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deleted = await this.knex('watchlist_exclusions')
    .where('id', id)
    .delete()
  return deleted > 0
}

/**
 * Returns the union of GUIDs across keys that exclusions say should be deleted
 * right now. A key qualifies when, after subtracting per-user excluders from
 * the set of users currently watchlisting it (status != 'pending'), no
 * non-excluded user remains — i.e., every watchlister is also an excluder for
 * that key. A global exclusion (user_id = SYSTEM_USER_ID) covers every user
 * and short-circuits the check, so any item with a global exclusion qualifies.
 *
 * This mirrors how watchlist-mode handles exclusions
 * (cleanupExcludedWatchlistItems removes per-user rows and the standard prune
 * deletes items with zero remaining wanters), but expressed as a single read
 * so tag-based delete sync can consult it without mutating watchlist_items.
 *
 * @returns Set of GUIDs covered by exclusion-driven deletion candidates
 */
export async function getExclusionDrivenDeletionGuids(
  this: DatabaseService,
): Promise<Set<string>> {
  // Per-exclusion-row: keep the row iff no watchlister exists for this key
  // who isn't covered by either a per-user exclusion (matching user_id) or a
  // global exclusion. Expressed as raw SQL because the doubly-nested
  // correlated subquery doesn't fit knex's nested-`this` typing cleanly.
  const result = await this.knex.raw<Array<{ guids: string }>>(
    `SELECT DISTINCT we.key AS key, we.guids AS guids
     FROM watchlist_exclusions we
     WHERE NOT EXISTS (
       SELECT 1 FROM watchlist_items wi
       WHERE wi.key = we.key
         AND wi.status != 'pending'
         AND NOT EXISTS (
           SELECT 1 FROM watchlist_exclusions we2
           WHERE we2.key = we.key
             AND (we2.user_id = wi.user_id OR we2.user_id = ?)
         )
     )`,
    [SYSTEM_USER_ID],
  )

  const rows = this.extractRawQueryRows<{ guids: string }>(result)

  const guids = new Set<string>()
  for (const row of rows) {
    for (const guid of parseGuids(row.guids)) {
      guids.add(guid)
    }
  }
  return guids
}

/**
 * Deletes routed (status != 'pending') watchlist_items rows whose key is
 * excluded for the same user or globally. Pending rows are already vetoed at
 * the routing gate and left in place to avoid RSS-recreate churn. Exclusion
 * rows themselves are preserved.
 *
 * @returns Number of watchlist_items rows deleted
 */
export async function cleanupExcludedWatchlistItems(
  this: DatabaseService,
): Promise<number> {
  return await this.knex('watchlist_items')
    .whereExists(function () {
      this.select(1)
        .from('watchlist_exclusions')
        .whereRaw(
          '(watchlist_exclusions.user_id = watchlist_items.user_id OR watchlist_exclusions.user_id = ?)',
          [SYSTEM_USER_ID],
        )
        .whereRaw('watchlist_exclusions.key = watchlist_items.key')
    })
    .whereNot('status', 'pending')
    .delete()
}
