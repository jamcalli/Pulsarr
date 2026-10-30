import type { WatchlistStatus } from '@root/schemas/common/watchlist-status.schema.js'
import type {
  CreateWatchlistExclusion,
  WatchlistExclusionItem,
  WatchlistExclusionItemsFilter,
  WatchlistExclusionItemsQuery,
  WatchlistExclusionScope,
  WatchlistExclusionUser,
} from '@root/schemas/watchlist-exclusions/watchlist-exclusions.schema.js'
import type {
  ExclusionDrivenGuids,
  WatchlistExclusion,
} from '@root/types/watchlist-exclusion.types.js'
import { applySearchFilter } from '@services/database/search-filter.js'
import type { DatabaseService } from '@services/database.service.js'
import { toContentType } from '@utils/content-type.js'
import { errorMessage } from '@utils/error-message.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { Knex } from 'knex'

/** User id of a global exclusion, which vetoes routing of the key for every user. */
export const SYSTEM_USER_ID = 0

/** Returns the rows inserted, skipping duplicates. */
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

/** Most recent first. */
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

interface GroupedExclusionRow {
  key: string
  title: string
  type: string
  guids: string | null
  thumb: string | null
  global_id: number | null
  global_excluded_at: string | null
  watchlister_count: number | string
  excluded_count: number | string
}

interface ExclusionUserRow {
  key: string
  user_id: number
  user_name: string
  status: WatchlistStatus | null
  added: string | null
  own_id: number | null
  own_excluded_at: string | null
}

const EXCLUSION_ITEM_SORT_COLUMNS: Record<
  WatchlistExclusionItemsQuery['sortBy'],
  string
> = {
  title: 'grouped.title',
  watchlisters: 'grouped.watchlister_count',
  excluded: 'grouped.excluded_count',
  excludedAt: 'grouped.excluded_at',
}

const exclusionRef = (id: number | null, excludedAt: string | null) =>
  id === null || excludedAt === null ? null : { id, excludedAt }

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
    )

  return knex.from(watchlisted.unionAll([orphanOwn, orphanGlobal]).as('items'))
}

function groupedExclusionItems(
  db: DatabaseService,
  filter: WatchlistExclusionItemsFilter,
): Knex.QueryBuilder {
  const { knex } = db
  const preferWatchlisted = (column: string, alias: string) =>
    knex.raw(
      'COALESCE(MAX(CASE WHEN items.status IS NOT NULL THEN ?? END), MAX(??)) AS ??',
      [column, column, alias],
    )

  let grouped = exclusionItemsUnion(db)
    .select(
      'items.key as key',
      preferWatchlisted('items.title', 'title'),
      preferWatchlisted('items.type', 'type'),
      preferWatchlisted('items.guids', 'guids'),
      knex.raw('MAX(items.thumb) AS thumb'),
      knex.raw('MAX(items.global_id) AS global_id'),
      knex.raw('MAX(items.global_excluded_at) AS global_excluded_at'),
      knex.raw('COUNT(items.status) AS watchlister_count'),
      knex.raw('COUNT(items.own_id) AS excluded_count'),
      // Text timestamps share one format per driver, so MAX and < order them on both
      knex.raw(`CASE
        WHEN MAX(items.global_excluded_at) IS NULL THEN MAX(items.own_excluded_at)
        WHEN MAX(items.own_excluded_at) IS NULL
          OR MAX(items.own_excluded_at) < MAX(items.global_excluded_at)
          THEN MAX(items.global_excluded_at)
        ELSE MAX(items.own_excluded_at)
      END AS excluded_at`),
    )
    .groupBy('items.key')

  if (filter.userId !== undefined) {
    grouped = grouped.havingRaw(
      'COUNT(CASE WHEN items.user_id = ? THEN 1 END) > 0',
      [filter.userId],
    )
  }
  if (filter.status) {
    grouped = grouped.havingRaw(
      'COUNT(CASE WHEN items.status = ? THEN 1 END) > 0',
      [filter.status],
    )
  }

  let query = knex.from(grouped.as('grouped'))

  if (filter.search) {
    query = applySearchFilter(
      query,
      filter.search,
      'grouped.title',
      db.isPostgres,
    )
  }
  if (filter.type) {
    query = query.where('grouped.type', filter.type)
  }
  if (filter.exclusion === 'excluded') {
    query = query.where((q) =>
      q
        .whereNotNull('grouped.global_id')
        .orWhere('grouped.excluded_count', '>', 0),
    )
  } else if (filter.exclusion === 'not-excluded') {
    query = query
      .whereNull('grouped.global_id')
      .where('grouped.excluded_count', 0)
  } else if (filter.exclusion === 'orphan') {
    query = query.where('grouped.watchlister_count', 0)
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

/** One row per title with its users attached, plus exclusions whose watchlist item is gone. */
export async function getWatchlistExclusionItems(
  this: DatabaseService,
  query: WatchlistExclusionItemsQuery,
): Promise<WatchlistExclusionItem[]> {
  let builder = groupedExclusionItems(this, query).select<
    GroupedExclusionRow[]
  >('grouped.*')
  builder = orderNullsLast(
    builder,
    EXCLUSION_ITEM_SORT_COLUMNS[query.sortBy],
    query.sortOrder,
  ).orderBy('grouped.key')

  const rows: GroupedExclusionRow[] = await builder
    .limit(query.limit)
    .offset(query.offset)
  if (rows.length === 0) return []

  const userRows: ExclusionUserRow[] = await exclusionItemsUnion(this)
    .whereIn(
      'items.key',
      rows.map((row) => row.key),
    )
    .whereNotNull('items.user_id')
    .orderBy('items.user_name')
    .orderBy('items.user_id')
    .select<ExclusionUserRow[]>(
      'items.key',
      'items.user_id',
      'items.user_name',
      'items.status',
      'items.added',
      'items.own_id',
      'items.own_excluded_at',
    )

  const usersByKey = new Map<string, WatchlistExclusionUser[]>()
  for (const user of userRows) {
    const users = usersByKey.get(user.key) ?? []
    users.push({
      userId: user.user_id,
      userName: user.user_name,
      status: user.status,
      added: user.added,
      ownExclusion: exclusionRef(user.own_id, user.own_excluded_at),
    })
    usersByKey.set(user.key, users)
  }

  return rows.map((row) => ({
    key: row.key,
    title: row.title,
    type: toContentType(row.type),
    guids: parseGuids(row.guids ?? undefined),
    thumb: row.thumb,
    globalExclusion: exclusionRef(row.global_id, row.global_excluded_at),
    watchlisterCount: Number(row.watchlister_count),
    excludedCount: Number(row.excluded_count),
    users: usersByKey.get(row.key) ?? [],
  }))
}

/** Total titles getWatchlistExclusionItems matches across all pages. */
export async function getWatchlistExclusionItemsCount(
  this: DatabaseService,
  filter: WatchlistExclusionItemsFilter,
): Promise<number> {
  const result = await groupedExclusionItems(this, filter)
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

export async function removeExclusion(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deleted = await this.knex('watchlist_exclusions')
    .where('id', id)
    .delete()
  return deleted > 0
}

/** GUIDs of keys where every non-pending watchlister has a per-user or global exclusion, read without mutating watchlist_items. */
export async function getExclusionDrivenDeletionGuids(
  this: DatabaseService,
): Promise<ExclusionDrivenGuids> {
  // Raw SQL because the doubly nested correlated subquery does not fit knex's nested `this` typing
  const result = await this.knex.raw<Array<{ type: string; guids: string }>>(
    `SELECT DISTINCT we.key AS key, we.type AS type, we.guids AS guids
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

  const rows = this.extractRawQueryRows<{ type: string; guids: string }>(result)

  const guids: ExclusionDrivenGuids = { movie: new Set(), show: new Set() }
  for (const row of rows) {
    const bucket = guids[toContentType(row.type)]
    for (const guid of parseGuids(row.guids)) {
      bucket.add(guid)
    }
  }
  return guids
}
