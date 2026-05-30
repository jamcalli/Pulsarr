import type { WatchlistExclusion } from '@root/types/watchlist-exclusion.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseGuids } from '@utils/guid-handler.js'

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
  if (userIds.length === 0) return 0

  const guidsJson = JSON.stringify(guids)

  const rows = userIds.map((userId) => ({
    user_id: userId,
    key,
    title,
    type,
    guids: guidsJson,
    excluded_at: this.timestamp,
  }))

  const insertedRows = await this.knex('watchlist_exclusions')
    .insert(rows)
    .onConflict(['user_id', 'key'])
    .ignore()
    .returning('id')

  return insertedRows.length
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
