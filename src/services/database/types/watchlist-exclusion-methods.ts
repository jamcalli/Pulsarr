import type {
  CreateWatchlistExclusion,
  WatchlistExclusionItem,
  WatchlistExclusionItemsFilter,
  WatchlistExclusionItemsQuery,
  WatchlistExclusionScope,
} from '@root/schemas/watchlist-exclusions/watchlist-exclusions.schema.js'
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

    /** Global scope writes one SYSTEM_USER_ID row per item, and a failing item rolls back alone. */
    bulkExcludeWatchlistItems(
      items: CreateWatchlistExclusion[],
      scope: WatchlistExclusionScope,
    ): Promise<{
      created: number
      skipped: number
      failed: string[]
      errors: string[]
    }>

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

    /** Watchlist items with their own and global exclusions, plus exclusion rows whose item is gone. */
    getWatchlistExclusionItems(
      query: WatchlistExclusionItemsQuery,
    ): Promise<WatchlistExclusionItem[]>

    /** Total rows getWatchlistExclusionItems matches across all pages. */
    getWatchlistExclusionItemsCount(
      filter: WatchlistExclusionItemsFilter,
    ): Promise<number>

    /** Ids are deduped, so `total` counts distinct ids and ids that matched no row come back in `failed`. */
    bulkRemoveExclusions(ids: number[]): Promise<{
      removed: number
      failed: number[]
      errors: string[]
      total: number
    }>

    /**
     * Removes a single exclusion by id.
     *
     * @returns True if a row was deleted
     */
    removeExclusion(id: number): Promise<boolean>

    /**
     * Returns the union of GUIDs across keys that exclusions say should be
     * deleted right now. A key qualifies when every watchlister for it is
     * also covered by either a per-user or global exclusion; a global
     * exclusion alone is sufficient. Used by tag-based delete sync to honor
     * exclusions without mutating watchlist_items.
     */
    getExclusionDrivenDeletionGuids(): Promise<Set<string>>

    /**
     * Deletes routed watchlist_items rows whose key is excluded for the same
     * user or globally. Exclusion rows themselves are preserved.
     *
     * @returns Number of watchlist_items rows deleted
     */
    cleanupExcludedWatchlistItems(): Promise<number>
  }
}
