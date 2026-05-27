import type { WatchlistExclusion } from '@root/types/watchlist-exclusion.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    /**
     * Inserts an exclusion row for each user, skipping duplicates.
     *
     * @returns Number of rows inserted
     */
    excludeWatchlistItem(
      key: string,
      userIds: number[],
      title: string,
      type: string,
      guids: string[],
    ): Promise<number>

    /**
     * Removes exclusion rows for the user across the given keys.
     *
     * @returns Number of rows deleted
     */
    clearExclusions(userId: number, keys: string[]): Promise<number>

    /**
     * Returns a map of key → set of user ids that have excluded that key.
     */
    getExclusionMap(): Promise<Map<string, Set<number>>>

    /**
     * Returns the subset of given keys that the user currently has excluded.
     */
    findExcludedKeys(userId: number, keys: string[]): Promise<string[]>

    /**
     * Returns all exclusions for a user, most recent first.
     */
    getExclusionsForUser(userId: number): Promise<WatchlistExclusion[]>

    /**
     * Returns all exclusions joined with the owning user's name.
     */
    getAllExclusions(): Promise<
      Array<WatchlistExclusion & { username: string }>
    >

    /**
     * Removes a single exclusion by id.
     *
     * @returns True if a row was deleted
     */
    removeExclusion(id: number): Promise<boolean>

    /**
     * Deletes routed watchlist_items rows whose key is excluded for the same
     * user or globally. Exclusion rows themselves are preserved.
     *
     * @returns Number of watchlist_items rows deleted
     */
    cleanupExcludedWatchlistItems(): Promise<number>
  }
}
