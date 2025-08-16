import type { NotificationType } from '@root/types/notification.types.js'
import type {
  NotificationResult,
  SonarrEpisodeSchema,
} from '@root/types/sonarr.types.js'
import type { Knex } from 'knex'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // NOTIFICATION PROCESSING
    /**
     * Processes notifications for media availability
     * @param mediaInfo - Information about the media item
     * @param isBulkRelease - Whether this is a bulk release (e.g., full season)
     * @param instanceId - Optional instance ID for junction table updates
     * @param instanceType - Optional instance type for junction table updates
     * @returns Promise resolving to array of notification results
     */
    processNotifications(
      mediaInfo: {
        type: 'movie' | 'show'
        guid: string
        title: string
        episodes?: SonarrEpisodeSchema[]
      },
      isBulkRelease: boolean,
      instanceId?: number,
      instanceType?: 'sonarr' | 'radarr',
    ): Promise<NotificationResult[]>

    /**
     * Creates a notification record in the database
     * @param notification - Notification data to create
     * @param trx - Optional transaction to use for the operation
     * @returns Promise resolving to the ID of the created notification, or null if duplicate was prevented
     */
    createNotificationRecord(
      notification: {
        watchlist_item_id: number | null
        user_id: number | null
        type: NotificationType
        title: string
        message?: string
        season_number?: number
        episode_number?: number
        sent_to_discord: boolean
        sent_to_apprise: boolean
        sent_to_webhook?: boolean
        sent_to_tautulli?: boolean
        notification_status?: string
      },
      trx?: Knex.Transaction,
    ): Promise<number | null>

    /**
     * Checks for existing webhook notification
     * @param userId - ID of the user who would receive the notification
     * @param type - Type of notification to check for
     * @param title - Title of the content item
     * @returns Promise resolving to the notification if found, undefined otherwise
     */
    getExistingWebhookNotification(
      userId: number,
      type: NotificationType,
      title: string,
    ): Promise<{ id: number } | undefined>

    /**
     * Resets notification status for content items
     * @param options - Options for filtering which notifications to reset
     * @returns Promise resolving to the number of notifications reset
     */
    resetContentNotifications(options: {
      olderThan?: Date
      watchlistItemId?: number
      userId?: number
      contentType?: string
      seasonNumber?: number
    }): Promise<number>

    /**
     * Retrieves comprehensive notification statistics
     * @param days - Number of days to look back (default: 30)
     * @returns Promise resolving to object with notification statistics
     */
    getNotificationStats(days?: number): Promise<{
      total_notifications: number
      by_type: { type: string; count: number }[]
      by_channel: { channel: string; count: number }[]
      by_user: { user_name: string; count: number }[]
    }>

    /**
     * Adds a status history entry for backfilling missing transitions
     * @param watchlistItemId - The ID of the watchlist item
     * @param status - The status to record
     * @param timestamp - The timestamp when this status should have been recorded
     * @returns Promise that resolves when the entry is added
     */
    addStatusHistoryEntry(
      watchlistItemId: number,
      status: 'pending' | 'requested' | 'grabbed' | 'notified',
      timestamp: string,
    ): Promise<void>
  }
}
