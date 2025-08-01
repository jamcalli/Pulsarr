import type { PendingLabelSync } from '../methods/plex-label-sync.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // PLEX LABEL SYNC MANAGEMENT
    /**
     * Creates a new pending label sync record for content that needs label synchronization
     * @param guid - The content identifier (e.g., 'tmdb:123456', 'tvdb:789')
     * @param contentTitle - Human-readable title of the content for logging/debugging
     * @param expiresInMinutes - Number of minutes until this sync attempt expires (defaults to 30)
     * @returns Promise resolving to the ID of the newly created pending sync record
     */
    createPendingLabelSync(
      this: DatabaseService,
      guid: string,
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
  }
}
