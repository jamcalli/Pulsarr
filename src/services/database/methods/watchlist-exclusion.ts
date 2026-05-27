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
