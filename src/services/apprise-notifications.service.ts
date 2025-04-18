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
    // Default to '' if not specified
    return this.config.appriseUrl || ''
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

      // Send the request with both the target URL and notification in the JSON body
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: targetUrl,
          ...notification,
        }),
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
   * Sends a media notification to a user via their configured Apprise URL
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

    // Skip if user has notifications disabled
    if (user.notify_apprise === false) {
      this.log.debug(
        `User ${user.name} has Apprise notifications disabled, skipping media notification`,
      )
      return false
    }

    try {
      // Get emojis and type titles - match Discord's emoji usage
      const emoji = notification.type === 'movie' ? '🎬' : '📺'
      const mediaType =
        notification.type.charAt(0).toUpperCase() + notification.type.slice(1)

      // Prepare the notification title (similar to Discord's title structure)
      const title = `${emoji} ${notification.title}`

      // Build different message content based on notification type - matching Discord structure
      let htmlBody: string
      let textBody: string

      if (notification.type === 'show' && notification.episodeDetails) {
        const { episodeDetails } = notification

        // Check if it's a single episode (has episode number) or bulk release
        if (
          episodeDetails.seasonNumber !== undefined &&
          episodeDetails.episodeNumber !== undefined
        ) {
          // Single episode release
          const seasonNum = episodeDetails.seasonNumber
            .toString()
            .padStart(2, '0')
          const episodeNum = episodeDetails.episodeNumber
            .toString()
            .padStart(2, '0')
          const episodeId = `S${seasonNum}E${episodeNum}`
          const episodeTitle = episodeDetails.title
            ? ` - "${episodeDetails.title}"`
            : ''

          // Add HTML content
          htmlBody = '<h2>New Episode Available</h2>'
          htmlBody += `<p><strong>${notification.title}</strong></p>`
          htmlBody += `<p><strong>Episode:</strong> ${episodeId}${episodeTitle}</p>`

          // Add plain text content
          textBody = `New Episode Available\n\n${notification.title}\nEpisode: ${episodeId}${episodeTitle}\n`

          // Add overview if available
          if (episodeDetails.overview) {
            htmlBody += `<p><strong>Overview:</strong> ${episodeDetails.overview}</p>`
            textBody += `\nOverview: ${episodeDetails.overview}\n`
          }

          // Add air date if available
          if (episodeDetails.airDateUtc) {
            const airDate = new Date(
              episodeDetails.airDateUtc,
            ).toLocaleDateString()
            htmlBody += `<p><strong>Air Date:</strong> ${airDate}</p>`
            textBody += `\nAir Date: ${airDate}`
          }
        } else if (episodeDetails.seasonNumber !== undefined) {
          // Bulk season release - structure matches Discord's bulk release notification
          htmlBody = '<h2>New Season Available</h2>'
          htmlBody += `<p><strong>${notification.title}</strong></p>`
          htmlBody += `<p><strong>Season Added:</strong> Season ${episodeDetails.seasonNumber}</p>`

          textBody = `New Season Available\n\n${notification.title}\nSeason Added: Season ${episodeDetails.seasonNumber}`
        } else {
          // Fallback - similar to Discord's fallback
          htmlBody = '<h2>New Content Available</h2>'
          htmlBody += `<p><strong>${notification.title}</strong></p>`
          htmlBody += '<p>New content is now available to watch!</p>'

          textBody = `New Content Available\n\n${notification.title}\nNew content is now available to watch!`
        }
      } else {
        // Movie notification - match Discord's movie notification style
        htmlBody = '<h2>Movie Available</h2>'
        htmlBody += `<p><strong>${notification.title}</strong></p>`
        htmlBody += '<p>Your movie is now available to watch!</p>'

        textBody = `Movie Available\n\n${notification.title}\nYour movie is now available to watch!`
      }

      // Add footer with app name - similar to Discord signature
      htmlBody += '<p style="color:#888; font-size:0.9em;">- Pulsarr</p>'
      textBody += '\n\n- Pulsarr'

      const appriseNotification: AppriseNotification = {
        title,
        body: textBody,
        type: 'info',
        format: 'text',
        tag: notification.type,
        body_html: htmlBody,
        // Include Pulsarr icon for notification services that support icons
        attach_url:
          'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
      }

      // Add poster URL if available - matching Discord's image embedding
      if (notification.posterUrl) {
        appriseNotification.image = notification.posterUrl
      }

      // Send to the user's Apprise URL
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
   * Send a system notification to the configured system endpoint
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
      // Check if system Apprise URL is configured
      const systemUrl = this.config.systemAppriseUrl
      if (!systemUrl) {
        this.log.warn(
          'System Apprise URL not configured, skipping system notification',
        )
        return false
      }

      // Determine notification type - match Discord's color logic
      let type: AppriseMessageType = 'info'

      // Check if it's a safety-related notification - matching Discord's detection logic
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

      // Format the notification content
      const title = notification.title

      // Create HTML and text versions of the body
      let htmlBody = '<h2>System Notification</h2>'
      let textBody = 'System Notification\n\n'

      // Add fields in a readable format - structured like Discord embeds
      htmlBody += '<div style="margin: 10px 0;">'
      for (const field of notification.embedFields) {
        htmlBody += `<div style="margin-bottom: 10px;">
        <strong>${field.name}:</strong> 
        <div>${field.value}</div>
      </div>`

        textBody += `${field.name}: ${field.value}\n\n`
      }
      htmlBody += '</div>'

      // Add footer
      htmlBody += `<p style="color:#888; font-size:0.9em;">- Pulsarr System</p>`
      textBody += '- Pulsarr System'

      const appriseNotification: AppriseNotification = {
        title,
        body: textBody,
        type,
        format: 'text',
        tag: 'system',
        body_html: htmlBody,
        // Include Pulsarr icon for notification services that support icons
        attach_url:
          'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
      }

      // Send to the system Apprise URL
      return await this.sendNotification(systemUrl, appriseNotification)
    } catch (error) {
      this.log.error('Error sending system notification:', error)
      return false
    }
  }

  /**
   * Send a delete sync result notification to the admin
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
      const systemUrl = this.config.systemAppriseUrl
      if (!systemUrl) {
        this.log.warn(
          'System Apprise URL not configured, skipping delete sync notification',
        )
        return false
      }

      // Generate title based on operation type - matching Discord's title format
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

      // Create HTML and text versions of the body - matching Discord's structure
      let htmlBody = `<h2>${title.replace(/^(⚠️|🔍|🗑️)\s*/, '')}</h2>`
      let textBody = ''

      // Create a summary
      const summaryText = dryRun
        ? 'This was a dry run - no content was actually deleted.\n\n'
        : results.safetyTriggered
          ? `${results.safetyMessage || 'A safety check prevented the delete sync operation from running.'}\n\n`
          : "The following content was removed because it's no longer in any user's watchlist.\n\n"

      textBody += summaryText
      htmlBody += `<p>${summaryText.replace(/\n/g, '<br>')}</p>`

      // Add summary section - matches Discord's summary field
      htmlBody +=
        '<div style="margin: 10px 0; padding: 10px; border: 1px solid #ccc; background: #f5f5f5;">'
      htmlBody += '<h3>Summary</h3>'
      htmlBody += `<p>Processed: <strong>${results.total.processed}</strong> items<br>`
      htmlBody += `Deleted: <strong>${results.total.deleted}</strong> items<br>`
      htmlBody += `Skipped: <strong>${results.total.skipped}</strong> items</p>`
      htmlBody += '</div>'

      textBody += 'Summary:\n'
      textBody += `Processed: ${results.total.processed} items\n`
      textBody += `Deleted: ${results.total.deleted} items\n`
      textBody += `Skipped: ${results.total.skipped} items\n\n`

      // Add safety message if applicable - matches Discord's safety reason field
      if (results.safetyTriggered && results.safetyMessage) {
        htmlBody += `<div style="margin: 10px 0; padding: 10px; border: 1px solid #f88; background: #fee;">`
        htmlBody += '<h3>Safety Reason</h3>'
        htmlBody += `<p>${results.safetyMessage}</p>`
        htmlBody += '</div>'

        textBody += `Safety Reason: ${results.safetyMessage}\n\n`
      }

      // Add movies section - matches Discord's movie listing
      htmlBody += '<div style="margin: 10px 0;">'
      if (results.movies.deleted > 0) {
        htmlBody += `<h3>Movies (${results.movies.deleted} deleted)</h3>`
        htmlBody += '<ul style="margin-top: 5px;">'

        const movieList = results.movies.items
          .slice(0, 10) // Match Discord's 10-item limit
          .map((item) => `<li>${item.title}</li>`)
          .join('')

        htmlBody += movieList || '<li>None</li>'
        htmlBody += '</ul>'

        if (results.movies.items.length > 10) {
          htmlBody += `<p>... and ${results.movies.items.length - 10} more movies</p>`
        }

        // Text version
        const textMovieList = results.movies.items
          .slice(0, 10)
          .map((item) => `• ${item.title}`)
          .join('\n')

        textBody += `Movies (${results.movies.deleted} deleted):\n${textMovieList || 'None'}\n\n`

        if (results.movies.items.length > 10) {
          textBody += `... and ${results.movies.items.length - 10} more movies\n\n`
        }
      } else {
        htmlBody += '<h3>Movies</h3><p>No movies deleted</p>'
        textBody += 'Movies: No movies deleted\n\n'
      }
      htmlBody += '</div>'

      // Add shows section - matches Discord's show listing
      htmlBody += '<div style="margin: 10px 0;">'
      if (results.shows.deleted > 0) {
        htmlBody += `<h3>TV Shows (${results.shows.deleted} deleted)</h3>`
        htmlBody += '<ul style="margin-top: 5px;">'

        const showList = results.shows.items
          .slice(0, 10) // Match Discord's 10-item limit
          .map((item) => `<li>${item.title}</li>`)
          .join('')

        htmlBody += showList || '<li>None</li>'
        htmlBody += '</ul>'

        if (results.shows.items.length > 10) {
          htmlBody += `<p>... and ${results.shows.items.length - 10} more TV shows</p>`
        }

        // Text version
        const textShowList = results.shows.items
          .slice(0, 10)
          .map((item) => `• ${item.title}`)
          .join('\n')

        textBody += `TV Shows (${results.shows.deleted} deleted):\n${textShowList || 'None'}\n\n`

        if (results.shows.items.length > 10) {
          textBody += `... and ${results.shows.items.length - 10} more TV shows\n\n`
        }
      } else {
        htmlBody += '<h3>TV Shows</h3><p>No TV shows deleted</p>'
        textBody += 'TV Shows: No TV shows deleted\n\n'
      }
      htmlBody += '</div>'

      // Add timestamp - matches Discord's footer timestamp
      const timestamp = new Date().toLocaleString()
      htmlBody += `<p style="color:#888; font-size:0.9em;">Delete sync operation completed at ${timestamp}</p>`
      textBody += `Delete sync operation completed at ${timestamp}`

      const appriseNotification: AppriseNotification = {
        title,
        body: textBody,
        type,
        format: 'text',
        tag: 'delete-sync',
        body_html: htmlBody,
        attach_url:
          'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
      }

      // Send to the system Apprise URL
      return await this.sendNotification(systemUrl, appriseNotification)
    } catch (error) {
      this.log.error('Error sending delete sync notification:', error)
      return false
    }
  }

  /**
   * Send a watchlist addition notification
   *
   * @param item - Information about the watchlist item
   * @returns Promise resolving to true if sent successfully
   */
  async sendWatchlistAdditionNotification(item: {
    title: string
    type: string
    addedBy: {
      name: string
      alias?: string | null
    }
    posterUrl?: string
  }): Promise<boolean> {
    if (!this.isEnabled()) {
      return false
    }

    try {
      // Check if system Apprise URL is configured
      const systemUrl = this.config.systemAppriseUrl
      if (!systemUrl) {
        this.log.warn(
          'System Apprise URL not configured, skipping watchlist addition notification',
        )
        return false
      }

      // User display name logic - same as Discord
      let displayName = item.addedBy.name
      if (item.addedBy.alias) {
        displayName = item.addedBy.alias
      } else {
        try {
          // Get all users and find the one matching the Plex username
          const users = await this.fastify.db.getAllUsers()
          const userWithAlias = users.find((u) => u.name === item.addedBy.name)

          // If the user has an alias set, use it instead of their username
          if (userWithAlias?.alias) {
            displayName = userWithAlias.alias
            this.log.debug(
              `Using alias "${displayName}" instead of username "${item.addedBy.name}" for Apprise notification`,
            )
          }
        } catch (error) {
          this.log.error(
            'Error looking up user alias for Apprise notification:',
            error,
          )
          // Fall back to username if there's an error
        }
      }

      // Ensure we have a valid media type string - matches Discord's emoji selection
      const mediaTypeRaw = item.type ? item.type.toLowerCase() : ''
      const isMovie = mediaTypeRaw === 'movie'
      const isShow =
        mediaTypeRaw === 'show' ||
        mediaTypeRaw === 'tv' ||
        mediaTypeRaw === 'series'

      // Get emoji and type title - match Discord's usage
      const emoji = isMovie ? '🎬' : isShow ? '📺' : '🎬' // Default to movie emoji if unknown
      const mediaType = isMovie ? 'Movie' : isShow ? 'Show' : 'Media' // Default to 'Media' if unknown

      // Prepare the notification title - match Discord's format
      const title = `${emoji} ${mediaType} Added: ${item.title}`

      // Build HTML and text versions of the message
      let htmlBody = `<h2>${mediaType} Added to Watchlist</h2>`
      htmlBody += `<p><strong>${item.title}</strong> has been added to the watchlist.</p>`
      htmlBody += `<p><strong>Type:</strong> ${mediaType}</p>`
      htmlBody += `<p><strong>Added by:</strong> ${displayName}</p>`
      htmlBody += `<p style="color:#888; font-size:0.9em;">- Pulsarr</p>`

      // Cleaner text body
      let textBody = `${mediaType} Added to Watchlist\n\n`
      textBody += `"${item.title}" has been added to the watchlist.\n`
      textBody += `Type: ${mediaType}\n`
      textBody += `Added by: ${displayName}\n\n`
      textBody += '- Pulsarr'

      // Create notification
      const appriseNotification: AppriseNotification = {
        title: title || 'New Media Added',
        body: textBody,
        type: 'info',
        format: 'text',
        tag: 'watchlist-add',
        body_html: htmlBody,
        attach_url:
          'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
      }

      // Add poster URL if available - matches Discord's image embedding
      if (item.posterUrl) {
        appriseNotification.image = item.posterUrl
      }

      // Send to the system Apprise URL
      return await this.sendNotification(systemUrl, appriseNotification)
    } catch (error) {
      this.log.error('Error sending watchlist addition notification:', error)
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
      // Create HTML and text versions of the test message - use a single emoji in title only
      const htmlBody = `
        <h2>Test Notification</h2>
        <p>This is a test notification from Pulsarr to verify your Apprise configuration is working correctly.</p>
        <ul>
          <li>HTML formatting should be visible here</li>
          <li>If you see this with formatting, your notification service supports HTML</li>
        </ul>
        <p style="color:#888; font-size:0.9em;">- Pulsarr Test</p>
      `

      const textBody =
        'Test Notification\n\n' +
        'This is a test notification from Pulsarr to verify your Apprise configuration is working correctly.\n\n' +
        '• If you see this with bullet points, your notification service supports basic formatting\n' +
        "• Otherwise, you're seeing plain text\n\n" +
        '- Pulsarr Test'

      const notification: AppriseNotification = {
        title: '🔔 Pulsarr Test Notification',
        body: textBody,
        type: 'info',
        format: 'text',
        tag: 'test',
        body_html: htmlBody,
      }

      return await this.sendNotification(targetUrl, notification)
    } catch (error) {
      this.log.error('Error sending test notification:', error)
      return false
    }
  }
}
