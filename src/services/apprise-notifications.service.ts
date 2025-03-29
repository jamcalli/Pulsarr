/**
 * Apprise Notification Service
 *
 * Provides notification capabilities via Apprise, a universal notification service.
 * This service replaces direct apprise notifications with a more versatile approach
 * that can route to multiple notification endpoints (apprise, Discord, Telegram, etc.)
 * through a single Apprise container.
 *
 * Responsible for:
 * - Forwarding notifications to Apprise container
 * - Supporting per-user notification URLs (stored in the user's apprise field)
 * - Handling system-wide (admin) notifications using token1's URL
 * - Supporting different message formats based on notification types
 *
 * @example
 * // Sending a notification to a user
 * await fastify.apprise.sendMediaNotification(user, {
 *   title: 'New content available',
 *   type: 'movie',
 *   posterUrl: 'https://example.com/poster.jpg'
 * });
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { User } from '@root/types/config.types.js'
import type {
  MediaNotification,
  SystemNotification,
} from '@root/types/discord.types.js'
import type {
  AppriseMessageType,
  AppriseNotification,
} from '@root/types/apprise.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'

export class AppriseNotificationService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log.info('Initializing Apprise notification service')
  }

  private get config() {
    return this.fastify.config
  }

  /**
   * Gets the base URL for the Apprise container
   */
  private get appriseBaseUrl(): string {
    // Default to localhost:8000 if not specified
    return this.config.appriseUrl || 'http://localhost:8000'
  }

  /**
   * Checks if Apprise is enabled in configuration
   */
  isEnabled(): boolean {
    return Boolean(this.config.enableApprise)
  }

  /**
   * Sends a notification through the Apprise container to a specific target URL
   *
   * @param targetUrl - The destination URL to send the notification to (e.g., discord://webhook_id/token)
   * @param notification - The notification content
   * @returns Promise resolving to true if sent successfully
   */
  private async sendNotification(
    targetUrl: string,
    notification: AppriseNotification,
  ): Promise<boolean> {
    try {
      if (!targetUrl) {
        this.log.warn('Attempted to send notification without target URL')
        return false
      }

      if (!this.isEnabled()) {
        this.log.debug('Apprise notifications are disabled, skipping')
        return false
      }

      this.log.debug(
        { notification, targetUrl },
        'Sending Apprise notification',
      )

      // Construct the endpoint URL
      const url = new URL('/notify', this.appriseBaseUrl)

      // Add the target URL as a query parameter
      url.searchParams.append('urls', targetUrl)

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notification),
      })

      if (!response.ok) {
        this.log.error(
          { status: response.status, statusText: response.statusText },
          'Apprise notification request failed',
        )
        return false
      }

      this.log.info('Apprise notification sent successfully')
      return true
    } catch (error) {
      this.log.error({ error }, 'Error sending Apprise notification')
      return false
    }
  }

  /**
   * Send a media notification to a user via their configured Apprise URL
   *
   * @param user - The user to notify
   * @param notification - Media notification details
   * @returns Promise resolving to true if sent successfully
   */
  async sendMediaNotification(
    user: User,
    notification: MediaNotification,
  ): Promise<boolean> {
    if (!this.isEnabled() || !user.apprise) {
      return false
    }

    try {
      // Build different content based on notification type
      const title = notification.title
      let message: string
      const emoji = notification.type === 'movie' ? '🎬' : '📺'
      const mediaType =
        notification.type.charAt(0).toUpperCase() + notification.type.slice(1)

      if (notification.type === 'show' && notification.episodeDetails) {
        const { episodeDetails } = notification

        if (
          episodeDetails.episodeNumber !== undefined &&
          episodeDetails.seasonNumber !== undefined
        ) {
          // Single episode release
          const seasonNum = episodeDetails.seasonNumber
            .toString()
            .padStart(2, '0')
          const episodeNum = episodeDetails.episodeNumber
            .toString()
            .padStart(2, '0')

          const episodeId = `S${seasonNum}E${episodeNum}`

          // Add episode title if available
          const episodeTitle = episodeDetails.title
            ? ` - ${episodeDetails.title}`
            : ''

          message = `New episode available! ${emoji}\n\n${episodeId}${episodeTitle}`

          // Add overview if available
          if (episodeDetails.overview) {
            message += `\n\n${episodeDetails.overview}`
          }

          // Add air date if available
          if (episodeDetails.airDateUtc) {
            message += `\n\nAir Date: ${new Date(episodeDetails.airDateUtc).toLocaleDateString()}`
          }
        } else if (episodeDetails.seasonNumber !== undefined) {
          // Bulk season release
          message = `New season available! ${emoji}\n\nSeason ${episodeDetails.seasonNumber} has been added.`
        } else {
          // Fallback
          message = `New content available for ${notification.title}! ${emoji}`
        }
      } else {
        // Movie notification
        message = `Your movie is available to watch! ${emoji}`
      }

      const appriseNotification: AppriseNotification = {
        title,
        body: message,
        type: 'info',
        format: 'text',
        tag: notification.type,
      }

      // Add poster URL if available
      if (notification.posterUrl) {
        appriseNotification.image = notification.posterUrl
      }

      // Send to the user's Apprise URL (stored in apprise field)
      return await this.sendNotification(user.apprise, appriseNotification)
    } catch (error) {
      this.log.error(
        `Error sending media notification to user ${user.name}:`,
        error,
      )
      return false
    }
  }

  /**
   * Send a system notification to the admin (token1)
   *
   * @param notification - System notification details
   * @returns Promise resolving to true if sent successfully
   */
  async sendSystemNotification(
    notification: SystemNotification,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false
    }

    try {
      // Get admin user (token1)
      const adminUser = await this.fastify.db.getUser('token1')

      if (!adminUser || !adminUser.apprise) {
        this.log.warn(
          'Admin user (token1) not found or has no Apprise URL configured',
        )
        return false
      }

      // Determine notification type
      let type: AppriseMessageType = 'info'

      // Check if it's a safety-related notification
      const hasSafetyField = notification.embedFields.some(
        (field) => field.name === 'Safety Reason',
      )
      const isSafetyTriggered = notification.title.includes('Safety Triggered')
      const hasTriggeredProperty =
        'safetyTriggered' in notification &&
        notification.safetyTriggered === true

      if (hasSafetyField || isSafetyTriggered || hasTriggeredProperty) {
        type = 'failure'
      }

      // Format field data as text
      const fieldData = notification.embedFields
        .map((field) => `${field.name}: ${field.value}`)
        .join('\n\n')

      const appriseNotification: AppriseNotification = {
        title: notification.title,
        body: `System Notification\n\n${fieldData}`,
        type,
        format: 'text',
        tag: 'system',
      }

      // Send to admin's Apprise URL
      return await this.sendNotification(adminUser.apprise, appriseNotification)
    } catch (error) {
      this.log.error('Error sending system notification:', error)
      return false
    }
  }

  /**
   * Send a delete sync result notification to the admin (token1)
   *
   * @param results - Results of the delete sync operation
   * @param dryRun - Whether this was a dry run
   * @returns Promise resolving to true if sent successfully
   */
  async sendDeleteSyncNotification(
    results: DeleteSyncResult,
    dryRun: boolean,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false
    }

    try {
      // Get admin user (token1)
      const adminUser = await this.fastify.db.getUser('token1')

      if (!adminUser || !adminUser.apprise) {
        this.log.warn(
          'Admin user (token1) not found or has no Apprise URL configured',
        )
        return false
      }

      // Generate title based on operation type
      let title: string
      let type: AppriseMessageType = 'success'

      if (results.safetyTriggered) {
        title = '⚠️ Delete Sync Safety Triggered'
        type = 'failure'
      } else if (dryRun) {
        title = '🔍 Delete Sync Simulation Results'
        type = 'info'
      } else {
        title = '🗑️ Delete Sync Results'
      }

      // Create a summary
      let message = dryRun
        ? 'This was a dry run - no content was actually deleted.\n\n'
        : results.safetyTriggered
          ? `${results.safetyMessage || 'A safety check prevented the delete sync operation from running.'}\n\n`
          : "The following content was removed because it's no longer in any user's watchlist.\n\n"

      // Add summary section
      message += 'Summary:\n'
      message += `Processed: ${results.total.processed} items\n`
      message += `Deleted: ${results.total.deleted} items\n`
      message += `Skipped: ${results.total.skipped} items\n\n`

      // Add safety message if applicable
      if (results.safetyTriggered && results.safetyMessage) {
        message += `Safety Reason: ${results.safetyMessage}\n\n`
      }

      // Add movies section
      if (results.movies.deleted > 0) {
        const movieList = results.movies.items
          .slice(0, 10)
          .map((item) => `• ${item.title}`)
          .join('\n')

        message += `Movies (${results.movies.deleted} deleted):\n${movieList || 'None'}\n\n`

        if (results.movies.items.length > 10) {
          message += `... and ${results.movies.items.length - 10} more movies\n\n`
        }
      } else {
        message += 'Movies: No movies deleted\n\n'
      }

      // Add shows section
      if (results.shows.deleted > 0) {
        const showList = results.shows.items
          .slice(0, 10)
          .map((item) => `• ${item.title}`)
          .join('\n')

        message += `TV Shows (${results.shows.deleted} deleted):\n${showList || 'None'}\n\n`

        if (results.shows.items.length > 10) {
          message += `... and ${results.shows.items.length - 10} more TV shows\n\n`
        }
      } else {
        message += 'TV Shows: No TV shows deleted\n\n'
      }

      // Add timestamp
      message += `Delete sync operation completed at ${new Date().toLocaleString()}`

      const appriseNotification: AppriseNotification = {
        title,
        body: message,
        type,
        format: 'text',
        tag: 'delete-sync',
      }

      // Send to admin's Apprise URL
      return await this.sendNotification(adminUser.apprise, appriseNotification)
    } catch (error) {
      this.log.error('Error sending delete sync notification:', error)
      return false
    }
  }

  /**
   * Send a test notification to verify Apprise configuration
   *
   * @param targetUrl - The URL to send the notification to
   * @returns Promise resolving to true if sent successfully
   */
  async sendTestNotification(targetUrl: string): Promise<boolean> {
    try {
      const notification: AppriseNotification = {
        title: 'Pulsarr Test Notification',
        body: 'This is a test notification from Pulsarr to verify your Apprise configuration is working correctly.',
        type: 'info',
        format: 'text',
        tag: 'test',
      }

      return await this.sendNotification(targetUrl, notification)
    } catch (error) {
      this.log.error('Error sending test notification:', error)
      return false
    }
  }
}
