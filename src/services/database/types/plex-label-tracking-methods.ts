import type {
  PlexLabelTracking,
  TrackPlexLabelsOperation,
  UntrackPlexLabelOperation,
  BulkOperationResult,
} from '../methods/plex-label-tracking.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // PLEX LABEL TRACKING MANAGEMENT
    /**
     * Updates the tracking record with the complete set of labels for a content item
     * @param contentGuids - Array of GUIDs for the content (e.g., ['tmdb:123', 'imdb:tt456'])
     * @param contentType - Type of content ('movie' or 'show')
     * @param userId - The ID of the user who has labels applied
     * @param plexRatingKey - The Plex rating key of the labeled content
     * @param labelsApplied - Array of all label names applied to this content
     * @returns Promise resolving to the ID of the tracking record (new or existing)
     */
    trackPlexLabels(
      this: DatabaseService,
      contentGuids: string[],
      contentType: 'movie' | 'show',
      userId: number,
      plexRatingKey: string,
      labelsApplied: string[],
    ): Promise<number>

    /**
     * Processes multiple tracking operations for Plex labels in bulk
     * @param operations - Array of tracking operations
     * @returns Promise resolving to object with processedCount and failedIds
     */
    trackPlexLabelsBulk(
      this: DatabaseService,
      operations: TrackPlexLabelsOperation[],
    ): Promise<BulkOperationResult>

    /**
     * Removes a tracking record for a specific Plex label and user/content combination
     * @param contentGuids - Array of GUIDs for the content (e.g., ['tmdb:123', 'imdb:tt456'])
     * @param userId - The ID of the user
     * @param plexRatingKey - The Plex rating key
     * @param labelApplied - The Plex label name to untrack
     * @returns Promise resolving to true if a record was deleted, false if the record wasn't found
     */
    untrackPlexLabel(
      this: DatabaseService,
      contentGuids: string[],
      userId: number,
      plexRatingKey: string,
      labelApplied: string,
    ): Promise<boolean>

    /**
     * Processes multiple untracking operations for Plex labels in bulk
     * @param operations - Array of untracking operations
     * @returns Promise resolving to object with processedCount and failedIds
     */
    untrackPlexLabelBulk(
      this: DatabaseService,
      operations: UntrackPlexLabelOperation[],
    ): Promise<BulkOperationResult>

    /**
     * Retrieves all tracked Plex labels for a specific user
     * @param userId - The ID of the user
     * @returns Promise resolving to an array of Plex label tracking records for the user
     */
    getTrackedLabelsForUser(
      this: DatabaseService,
      userId: number,
    ): Promise<PlexLabelTracking[]>

    /**
     * Retrieves all tracked Plex labels for content matching the given GUID array
     * @param contentGuids - Array of GUIDs for the content (e.g., ['tmdb:123', 'imdb:tt456'])
     * @param contentType - Type of content ('movie' or 'show') for disambiguation
     * @returns Promise resolving to an array of Plex label tracking records for the content
     */
    getTrackedLabelsForContent(
      this: DatabaseService,
      contentGuids: string[],
      contentType: 'movie' | 'show',
    ): Promise<PlexLabelTracking[]>

    /**
     * Removes all tracking records for a specific user and content combination
     * @param contentGuids - Array of GUIDs for the content (e.g., ['tmdb:123', 'imdb:tt456'])
     * @param contentType - Type of content ('movie' or 'show') for disambiguation
     * @param userId - The ID of the user
     * @returns Promise resolving to the number of tracking records that were deleted
     */
    cleanupUserContentTracking(
      this: DatabaseService,
      contentGuids: string[],
      contentType: 'movie' | 'show',
      userId: number,
    ): Promise<number>

    /**
     * Removes all tracking records for a specific user
     * @param userId - The ID of the user
     * @returns Promise resolving to the number of tracking records that were deleted
     */
    cleanupUserTracking(this: DatabaseService, userId: number): Promise<number>

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
     * Checks if a specific label is already tracked for a user/content/rating key combination
     * @param contentGuids - Array of GUIDs for the content (e.g., ['tmdb:123', 'imdb:tt456'])
     * @param contentType - Type of content ('movie' or 'show') for disambiguation
     * @param userId - The ID of the user
     * @param plexRatingKey - The Plex rating key
     * @param labelApplied - The label to check
     * @returns Promise resolving to true if the label is already tracked, false otherwise
     */
    isLabelTracked(
      this: DatabaseService,
      contentGuids: string[],
      contentType: 'movie' | 'show',
      userId: number,
      plexRatingKey: string,
      labelApplied: string,
    ): Promise<boolean>

    /**
     * Removes all Plex label tracking records from the database
     * @returns Promise resolving to the number of tracking records that were deleted
     */
    clearAllLabelTracking(this: DatabaseService): Promise<number>

    /**
     * Removes tracking records for specific labels on multiple Plex rating keys in bulk
     * @param operations - Array of operations, each containing plexRatingKey and labelsToRemove
     * @returns Promise resolving to object with processedCount, failedIds, and totalUpdatedCount
     */
    removeTrackedLabels(
      this: DatabaseService,
      operations: Array<{ plexRatingKey: string; labelsToRemove: string[] }>,
    ): Promise<{
      processedCount: number
      failedIds: string[]
      totalUpdatedCount: number
    }>

    /**
     * Removes tracking records for a specific label on a specific Plex rating key
     * @param plexRatingKey - The Plex rating key
     * @param labelApplied - The label to remove tracking for
     * @returns Promise resolving to the number of tracking records that were deleted
     */
    removeTrackedLabel(
      this: DatabaseService,
      plexRatingKey: string,
      labelApplied: string,
    ): Promise<number>

    /**
     * Find orphaned tracking records where the applied label doesn't match any current valid user labels
     * @param validLabels - Set of currently valid user labels (lowercase)
     * @param labelPrefix - The prefix from the label configuration (e.g., "pulsarr")
     * @returns Promise resolving to array of tracking records with orphaned labels grouped by rating key
     */
    getOrphanedLabelTracking(
      this: DatabaseService,
      validLabels: Set<string>,
      labelPrefix: string,
    ): Promise<Array<{ plex_rating_key: string; orphaned_labels: string[] }>>

    /**
     * Remove multiple tracking records in bulk operations for orphaned labels
     * @param operations - Array of operations, each containing plexRatingKey and orphanedLabels
     * @returns Promise resolving to object with processedCount, failedIds, and totalUpdatedCount
     */
    removeOrphanedTrackingBulk(
      this: DatabaseService,
      operations: Array<{ plexRatingKey: string; orphanedLabels: string[] }>,
    ): Promise<{
      processedCount: number
      failedIds: string[]
      totalUpdatedCount: number
    }>

    /**
     * Remove multiple tracking records in a batch operation
     * @param plexRatingKey - The Plex rating key
     * @param orphanedLabels - Array of label names to remove tracking for
     * @returns Promise resolving to the number of tracking records that were deleted
     */
    removeOrphanedTracking(
      this: DatabaseService,
      plexRatingKey: string,
      orphanedLabels: string[],
    ): Promise<number>
  }
}
