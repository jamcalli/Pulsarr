declare module '../../database.service.js' {
  interface DatabaseService {
    // NOTIFICATION PROCESSING
    /**
     * Processes notifications for media availability
     * @param mediaInfo - Information about the media item
     * @param isBulkRelease - Whether this is a bulk release (e.g., full season)
     * @returns Promise resolving to array of notification results
     */
    processNotifications(mediaInfo: { type: 'movie' | 'show', guid: string, title: string, episodes?: SonarrEpisodeSchema[] }, isBulkRelease: boolean): Promise<NotificationResult[]>

    /**
     * Creates a notification record in the database
     * @param notification - Notification data to create
     * @returns Promise resolving to the ID of the created notification
     */
    createNotificationRecord(notification: { watchlist_item_id: number | null, user_id: number | null, type: 'episode' | 'season' | 'movie' | 'watchlist_add', title: string, message?: string }): Promise<number>

    /**
     * Checks for existing webhook notification
     * @param userId - ID of the user who would receive the notification
     * @param type - Type of notification to check for
     * @param title - Title of the content item
     * @returns Promise resolving to the notification if found, undefined otherwise
     */
    getExistingWebhookNotification(userId: number, type: string, title: string): Promise<{ id: number } | undefined>

    /**
     * Resets notification status for content items
     * @param options - Options for filtering which notifications to reset
     * @returns Promise resolving to the number of notifications reset
     */
    resetContentNotifications(options: { olderThan?: Date, watchlistItemId?: number, userId?: number, contentType?: string, seasonNumber?: number }): Promise<number>

    /**
     * Retrieves comprehensive notification statistics
     * @param days - Number of days to look back (default: 30)
     * @returns Promise resolving to object with notification statistics
     */
    getNotificationStats(days?: number): Promise<{ total_notifications: number, by_type: { type: string; count: number }[], by_channel: { channel: string; count: number }[], by_user: { user_name: string; count: number }[] }>

    /**
     * Creates a pending webhook notification
     * @param webhook - Pending webhook data to create
     * @returns Promise resolving to the ID of the created webhook
     */
    createPendingWebhook(webhook: PendingWebhookCreate): Promise<number>

    /**
     * Retrieves pending webhook notifications
     * @param limit - Maximum number of webhooks to retrieve
     * @returns Promise resolving to array of pending webhooks
     */
    getPendingWebhooks(limit?: number): Promise<PendingWebhook[]>

    /**
     * Deletes a pending webhook notification
     * @param id - ID of the webhook to delete
     * @returns Promise resolving to true if deleted, false otherwise
     */
    deletePendingWebhook(id: number): Promise<boolean>

    /**
     * Cleans up expired pending webhook notifications
     * @returns Promise resolving to number of webhooks cleaned up
     */
    cleanupExpiredWebhooks(): Promise<number>

    /**
     * Retrieves pending webhooks by GUID and media type
     * @param guid - GUID to search for
     * @param mediaType - Type of media ('movie' or 'show')
     * @returns Promise resolving to array of matching webhooks
     */
    getWebhooksByGuid(guid: string, mediaType: 'movie' | 'show'): Promise<PendingWebhook[]>
  }
}