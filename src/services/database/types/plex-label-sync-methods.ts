import type { PendingLabelSync } from '../methods/plex-label-sync.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // PLEX LABEL SYNC MANAGEMENT
    /**
     * Creates a new pending label sync record for content that needs label synchronization
     * @param watchlistItemId - The watchlist item ID that contains the Plex key
     * @param contentTitle - Human-readable title of the content for logging/debugging
     * @param expiresInMinutes - Number of minutes until this sync attempt expires (defaults to 30)
     * @returns Promise resolving to the ID of the newly created pending sync record
     */
    createPendingLabelSync(
      this: DatabaseService,
      watchlistItemId: number,
      contentTitle: string,
      expiresInMinutes?: number,
    ): Promise<number>

    /**
     * Retrieves all pending label sync records that haven't expired yet
     * @returns Promise resolving to an array of pending label sync records that haven't expired
     */
    getPendingLabelSyncs(this: DatabaseService): Promise<PendingLabelSync[]>

    /**
     * Updates the retry count and timestamp for a pending label sync after a failed attempt
     * @param id - The ID of the pending sync record to update
     * @returns Promise resolving to true if a record was updated, false if the record wasn't found
     */
    updatePendingLabelSyncRetry(
      this: DatabaseService,
      id: number,
    ): Promise<boolean>

    /**
     * Removes a pending label sync record after successful processing
     * @param id - The ID of the pending sync record to delete
     * @returns Promise resolving to true if a record was deleted, false if the record wasn't found
     */
    deletePendingLabelSync(this: DatabaseService, id: number): Promise<boolean>

    /**
     * Removes expired pending label sync records from the database
     * @returns Promise resolving to the number of expired records that were deleted
     */
    expirePendingLabelSyncs(this: DatabaseService): Promise<number>

    /**
     * Gets watchlist item with Plex key for direct metadata access
     * @param watchlistItemId - The watchlist item ID
     * @returns Promise resolving to the watchlist item with Plex key or null if not found
     */
    getWatchlistItemWithPlexKey(
      this: DatabaseService,
      watchlistItemId: number,
    ): Promise<{
      id: number
      user_id: number
      title: string
      plex_key: string | null
      guids: string[]
    } | null>

    /**
     * Gets all pending label syncs with their associated watchlist items and GUID parts
     * @returns Promise resolving to array of pending syncs with watchlist item data
     */
    getPendingLabelSyncsWithPlexKeys(this: DatabaseService): Promise<
      Array<{
        id: number
        watchlist_item_id: number
        content_title: string
        retry_count: number
        last_retry_at: string | null
        created_at: string
        expires_at: string
        plex_key: string | null
        user_id: number
        guids: string[]
        type: string
      }>
    >
  }
}
