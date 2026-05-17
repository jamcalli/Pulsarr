import type { WatchlistExclusion } from '@root/types/exclusion.types.js'
import type { DatabaseService } from '@services/database.service.js'

/**
 * Creates exclusion records for the given watchlist item key and user IDs.
 *
 * Inserts one exclusion per user, skipping duplicates via ON CONFLICT. This prevents
 * the sync engine from re-routing a watchlist item that was previously fulfilled and
 * cleaned up, even though the item remains on the user's Plex watchlist.
 *
 * @param key - The watchlist item key to exclude
 * @param userIds - Array of user IDs to exclude the item for
 * @returns The number of exclusion records created (excludes duplicates)
 */
export async function excludeWatchlistItem(
  this: DatabaseService,
  key: string,
  userIds: number[],
): Promise<number> {
  if (userIds.length === 0) return 0

  const rows = userIds.map((userId) => ({
    user_id: userId,
    key,
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
 * Removes exclusion records for the specified user and watchlist item keys.
 *
 * Called during watchlist item cleanup when a user removes content from their
 * Plex watchlist. Clearing the exclusion allows the item to be re-requested
 * if the user adds it back to their watchlist.
 *
 * @param userId - The user ID whose exclusions should be cleared
 * @param keys - Array of watchlist item keys to clear exclusions for
 * @returns The number of exclusion rows deleted
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
 * Retrieves all exclusions as a map for efficient lookup during sync.
 *
 * Returns a map keyed by watchlist item key, where each value is the set of
 * user IDs that have excluded that item. This structure allows O(1) exclusion
 * checks in the sync engine's hot loop.
 *
 * @returns Map of item key to set of excluded user IDs
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
 * Returns the subset of the given keys that the user currently has excluded.
 *
 * Used by the real-time watchlist path to detect "re-add" events: if a key
 * appearing in a fresh watchlist update has a matching exclusion, that key
 * is the user's signal to re-request the item.
 *
 * @param userId - The user ID to check
 * @param keys - Candidate watchlist item keys
 * @returns Keys that have an exclusion for this user (subset of input)
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
 * Retrieves all exclusions for a specific user, ordered by most recent first.
 *
 * @param userId - The user ID to retrieve exclusions for
 * @returns Array of exclusion records for the user
 */
export async function getExclusionsForUser(
  this: DatabaseService,
  userId: number,
): Promise<WatchlistExclusion[]> {
  return await this.knex('watchlist_exclusions')
    .where('user_id', userId)
    .orderBy('excluded_at', 'desc')
    .select('*')
}

/**
 * Retrieves all exclusion records, optionally joined with user information.
 *
 * @returns Array of all exclusion records with user names
 */
export async function getAllExclusions(
  this: DatabaseService,
): Promise<Array<WatchlistExclusion & { username: string }>> {
  return await this.knex('watchlist_exclusions as we')
    .join('users as u', 'we.user_id', 'u.id')
    .select(
      'we.id',
      'we.user_id',
      'we.key',
      'we.excluded_at',
      'u.name as username',
    )
    .orderBy('we.excluded_at', 'desc')
}

/**
 * Removes a single exclusion record by its ID.
 *
 * @param id - The exclusion record ID to remove
 * @returns True if the exclusion was found and removed, false otherwise
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
