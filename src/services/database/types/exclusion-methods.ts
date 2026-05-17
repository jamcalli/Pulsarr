import type { WatchlistExclusion } from '@root/types/exclusion.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    /**
     * Creates exclusion records for the given watchlist item key and user IDs.
     *
     * Prevents the sync engine from re-routing a watchlist item that was
     * previously fulfilled and cleaned up.
     *
     * @param key - The watchlist item key to exclude
     * @param userIds - Array of user IDs to exclude the item for
     * @returns The number of exclusion records created (excludes duplicates)
     */
    excludeWatchlistItem(key: string, userIds: number[]): Promise<number>

    /**
     * Returns the subset of the given keys that the user currently has excluded.
     *
     * @param userId - The user ID to check
     * @param keys - Candidate watchlist item keys
     * @returns Keys that have an exclusion for this user (subset of input)
     */
    findExcludedKeys(userId: number, keys: string[]): Promise<string[]>

    /**
     * Removes exclusion records for the specified user and watchlist item keys.
     *
     * Called during watchlist item cleanup when a user removes content from
     * their Plex watchlist, allowing re-request on re-add.
     *
     * @param userId - The user ID whose exclusions should be cleared
     * @param keys - Array of watchlist item keys to clear exclusions for
     * @returns The number of exclusion rows deleted
     */
    clearExclusions(userId: number, keys: string[]): Promise<number>

    /**
     * Retrieves all exclusions as a map for efficient lookup during sync.
     *
     * @returns Map of item key to set of excluded user IDs
     */
    getExclusionMap(): Promise<Map<string, Set<number>>>

    /**
     * Retrieves all exclusions for a specific user.
     *
     * @param userId - The user ID to retrieve exclusions for
     * @returns Array of exclusion records for the user
     */
    getExclusionsForUser(userId: number): Promise<WatchlistExclusion[]>

    /**
     * Retrieves all exclusion records with associated user names.
     *
     * @returns Array of all exclusion records with user information
     */
    getAllExclusions(): Promise<
      Array<WatchlistExclusion & { username: string }>
    >

    /**
     * Removes a single exclusion record by its ID.
     *
     * @param id - The exclusion record ID to remove
     * @returns True if the exclusion was found and removed, false otherwise
     */
    removeExclusion(id: number): Promise<boolean>
  }
}
