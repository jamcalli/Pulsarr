import type { PlexLabelTracking } from '../methods/plex-label-tracking.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // PLEX LABEL TRACKING MANAGEMENT
    /**
     * Creates a new tracking record linking a Plex label to a watchlist item
     * @param watchlistId - The ID of the watchlist item
     * @param plexRatingKey - The Plex rating key of the labeled content
     * @param labelApplied - The Plex label name that was applied
     * @returns Promise resolving to the ID of the tracking record (new or existing)
     */
    trackPlexLabel(
      this: DatabaseService,
      watchlistId: number,
      plexRatingKey: string,
      labelApplied: string,
    ): Promise<number>

    /**
     * Removes a tracking record for a specific Plex label and watchlist item
     * @param watchlistId - The ID of the watchlist item
     * @param plexRatingKey - The Plex rating key
     * @param labelApplied - The Plex label name to untrack
     * @returns Promise resolving to true if a record was deleted, false if the record wasn't found
     */
    untrackPlexLabel(
      this: DatabaseService,
      watchlistId: number,
      plexRatingKey: string,
      labelApplied: string,
    ): Promise<boolean>

    /**
     * Retrieves all tracked Plex labels for a specific watchlist item
     * @param watchlistId - The ID of the watchlist item
     * @returns Promise resolving to an array of Plex label tracking records for the watchlist item
     */
    getTrackedLabelsForWatchlist(
      this: DatabaseService,
      watchlistId: number,
    ): Promise<PlexLabelTracking[]>

    /**
     * Removes all tracking records for a specific watchlist item
     * @param watchlistId - The ID of the watchlist item
     * @returns Promise resolving to the number of tracking records that were deleted
     */
    cleanupWatchlistTracking(
      this: DatabaseService,
      watchlistId: number,
    ): Promise<number>

    /**
     * Retrieves all Plex label tracking records from the database
     * @returns Promise resolving to an array of all Plex label tracking records
     */
    getAllTrackedLabels(this: DatabaseService): Promise<PlexLabelTracking[]>

    /**
     * Gets all tracked labels for a specific Plex rating key
     * @param plexRatingKey - The Plex rating key
     * @returns Promise resolving to an array of Plex label tracking records for the rating key
     */
    getTrackedLabelsForRatingKey(
      this: DatabaseService,
      plexRatingKey: string,
    ): Promise<PlexLabelTracking[]>

    /**
     * Removes all tracking records for a specific Plex rating key
     * @param plexRatingKey - The Plex rating key
     * @returns Promise resolving to the number of tracking records that were deleted
     */
    cleanupRatingKeyTracking(
      this: DatabaseService,
      plexRatingKey: string,
    ): Promise<number>

    /**
     * Checks if a specific label is already tracked for a watchlist item and rating key
     * @param watchlistId - The ID of the watchlist item
     * @param plexRatingKey - The Plex rating key
     * @param labelApplied - The label to check
     * @returns Promise resolving to true if the label is already tracked, false otherwise
     */
    isLabelTracked(
      this: DatabaseService,
      watchlistId: number,
      plexRatingKey: string,
      labelApplied: string,
    ): Promise<boolean>
  }
}
