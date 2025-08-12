import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { User } from '@root/types/config.types.js'
import { getPublicContentUrls } from '@root/utils/notification-processor.js'
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
  /**
   * Helper function to sanitize HTML content to prevent XSS attacks
   * @param str - The string to sanitize
   * @returns Sanitized string with HTML entities escaped
   */
  private esc(str: string): string {
    if (!str) return ''
    const escapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
      '`': '&#x60;',
    }
    return str.replace(/[&<>'"`]/g, (c) => escapeMap[c] || c)
  }

  /**
   * Common HTML wrapper for notifications with Pulsarr styling
   * @param content - The content to wrap in HTML
   * @returns HTML string with the content wrapped in Pulsarr styling
   */
  private htmlWrapper(content: string): string {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #000000; border-radius: 5px; background-color: #48a9a6; color: #000000; box-shadow: 4px 4px 0px 0px #000000;">
      ${content}
      <hr style="border: none; border-top: 1px solid #000000; margin: 20px 0;">
      <p style="color:#000000; font-size:0.9em; text-align: center; font-weight: 500;">Powered by Pulsarr</p>
    </div>
    `
  }

  // Path to Pulsarr icon in repository
  private readonly ICON_URL =
    'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/assets/icons/pulsarr-lg.png'

  private async sendNotification(
    targetUrl: string,
    notification: AppriseNotification,
  ): Promise<boolean> {
    try {
      if (!targetUrl) {
        this.log.debug('Attempted to send notification without target URL')
        return false
      }

      if (!this.isEnabled()) {
        this.log.debug('Apprise notifications are disabled, skipping')
        return false
      }

      if (!this.appriseBaseUrl) {
        this.log.debug('Apprise base URL not configured; skipping notification')
        return false
      }

      // Use HTML content as the primary body when available
      const bodyContent = notification.body_html || notification.body
      const isHtml = !!notification.body_html

      // Create a clean payload without the non-standard body_html field
      const { body_html, format, ...cleanNotification } = notification

      // Prepare the payload with correct format settings for HTML
      const payload = {
        urls: targetUrl,
        ...cleanNotification,
        body: bodyContent,
        format: isHtml ? 'html' : (format ?? 'text'),
        input: isHtml ? 'html' : (format ?? 'text'), // Required by Apprise for proper content processing
      }

      const safeTargetUrl = targetUrl.includes('://')
        ? `${targetUrl.split('://')[0]}://***redacted***`
        : '***redacted***'
      this.log.debug(
        { targetUrl: safeTargetUrl, isHtml },
        'Sending Apprise notification',
      )

      // Construct the endpoint URL
      const url = new URL('/notify', this.appriseBaseUrl)

      // Send the request with the correctly formatted payload
      const controller = new AbortController()
      const timeoutMs = 10000
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      let response: Response
      try {
        response = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

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
      this.log.error(
        { err: error as Error },
        'Error sending Apprise notification',
      )
      return false
    }
  }

  /**
   * Send public content notification to shared Apprise endpoints
   */
  async sendPublicNotification(
    notification: MediaNotification,
  ): Promise<boolean> {
    const config = this.config.publicContentNotifications
    if (!config?.enabled) return false

    // Use centralized URL configuration utility
    const appriseUrls = getPublicContentUrls(
      config,
      notification.type,
      'apprise',
    )

    // NO FALLBACK - if no global URLs configured, don't send anything
    if (appriseUrls.length === 0) return false

    // Create a fake user for public notifications with shared Apprise URLs
    const publicNotificationUser = {
      id: -1,
      name: 'Public Content',
      apprise: appriseUrls.join(','),
      alias: null,
      discord_id: null,
      notify_apprise: true,
      notify_discord: false,
      notify_tautulli: false,
      tautulli_notifier_id: null,
      can_sync: false,
    }

    // Send notification using existing Apprise service
    return await this.sendMediaNotification(
      publicNotificationUser,
      notification,
    )
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

      // Build different message content based on notification type with enhanced HTML templates
      let htmlBody: string
      let textBody: string

      // Using the centralized htmlWrapper method defined at the class level

      // Poster image HTML if available - with Pulsarr styling
      const posterHtml = notification.posterUrl
        ? `<div style="text-align: center; margin-bottom: 20px;">
             <img src="${notification.posterUrl}" alt="${this.esc(notification.title)} poster" style="max-width: 200px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
           </div>`
        : ''

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

          // Enhanced HTML content for episode with Pulsarr dark theme styling
          const episodeContent = `
            ${posterHtml}
            <div style="background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
              <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">${this.esc(notification.title)}</h3>
              <p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Episode:</strong> ${this.esc(episodeId)}${this.esc(episodeTitle)}</p>
              ${
                episodeDetails.overview
                  ? `<p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Overview:</strong> ${this.esc(episodeDetails.overview)}</p>`
                  : ''
              }
              ${
                episodeDetails.airDateUtc
                  ? `<p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Air Date:</strong> ${this.esc(new Date(episodeDetails.airDateUtc).toLocaleDateString())}</p>`
                  : ''
              }
            </div>
          `

          htmlBody = this.htmlWrapper(episodeContent)

          // Plain text content for episode
          textBody = `New Episode Available\n\n${notification.title}\nEpisode: ${episodeId}${episodeTitle}\n`

          // Add overview if available
          if (episodeDetails.overview) {
            textBody += `\nOverview: ${episodeDetails.overview}\n`
          }

          // Add air date if available
          if (episodeDetails.airDateUtc) {
            const airDate = new Date(
              episodeDetails.airDateUtc,
            ).toLocaleDateString()
            textBody += `\nAir Date: ${airDate}`
          }
        } else if (episodeDetails.seasonNumber !== undefined) {
          // Bulk season release with enhanced HTML and Pulsarr dark theme styling
          const seasonContent = `
            ${posterHtml}
            <div style="background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
              <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">${this.esc(notification.title)}</h3>
              <p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Season Added:</strong> Season ${this.esc(String(episodeDetails.seasonNumber))}</p>
            </div>
          `

          htmlBody = this.htmlWrapper(seasonContent)

          textBody = `New Season Available\n\n${notification.title}\nSeason Added: Season ${episodeDetails.seasonNumber}`
        } else {
          // Fallback with enhanced HTML and Pulsarr dark theme styling
          const fallbackContent = `
            ${posterHtml}
            <div style="background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
              <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">${this.esc(notification.title)}</h3>
              <p style="font-weight: 500; color: #ffffff;">New content is now available to watch!</p>
            </div>
          `

          htmlBody = this.htmlWrapper(fallbackContent)

          textBody = `New Content Available\n\n${notification.title}\nNew content is now available to watch!`
        }
      } else {
        // Movie notification with enhanced HTML and Pulsarr dark theme styling
        const movieContent = `
          ${posterHtml}
          <div style="background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
            <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">${this.esc(notification.title)}</h3>
            <p style="font-weight: 500; color: #ffffff;">Movie available to watch!</p>
          </div>
        `

        htmlBody = this.htmlWrapper(movieContent)

        textBody = `Movie Available\n\n${notification.title}\nMovie available to watch!`
      }

      // Add signature to text content
      textBody += '\n\n- Pulsarr'

      const appriseNotification: AppriseNotification = {
        title,
        body: textBody,
        type: 'info',
        format: 'text',
        tag: notification.type,
        body_html: htmlBody,
        // Include Pulsarr icon for notification services that support icons
        attach_url: this.ICON_URL,
      }

      // Add poster URL if available - matching Discord's image embedding
      if (notification.posterUrl) {
        appriseNotification.image = notification.posterUrl
      }

      // Send to the user's Apprise URL
      const success = await this.sendNotification(
        user.apprise,
        appriseNotification,
      )

      if (success) {
        this.log.info(
          `Apprise notification sent successfully to ${user.alias || user.name} for "${notification.title}"`,
        )
      }

      return success
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
        this.log.debug(
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

      // Using the centralized htmlWrapper method defined at the class level

      // Create text version of the body
      let textBody = 'System Notification\n\n'

      // Extract field values for consolidated structure
      const fields = Object.fromEntries(
        notification.embedFields.map((field) => [field.name, field.value]),
      )

      // Build consolidated HTML structure
      // Main Content Card (with poster)
      const posterHtml = notification.posterUrl
        ? `<div style="text-align: center; margin-bottom: 15px;">
             <img src="${notification.posterUrl}" alt="${this.esc(fields.Content || title)} poster" style="max-width: 150px; border-radius: 5px; border: 2px solid #000000; box-shadow: 2px 2px 0px 0px #000000;">
           </div>`
        : ''

      const contentCard = `
        <div style="margin-bottom: 20px; padding: 20px; background-color: #212121; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          ${posterHtml}
          <h3 style="margin-top: 0; color: #ffffff; font-weight: 700; text-align: center;">${this.esc(fields.Content || 'Unknown Content')}</h3>
          <div style="display: flex; justify-content: center; gap: 20px; margin-top: 15px;">
            <div style="text-align: center;">
              <div style="color: #ffffff; font-weight: 700; font-size: 14px;">TYPE</div>
              <div style="color: #ffffff; font-weight: 500;">${this.esc(fields.Type || 'Unknown')}</div>
            </div>
          </div>
        </div>
      `

      // Request Details Card
      const requestCard = `
        <div style="margin-bottom: 20px; padding: 20px; background-color: #212121; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h4 style="margin-top: 0; color: #ffffff; font-weight: 700; border-bottom: 1px solid #343746; padding-bottom: 5px;">Request Details</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
            <div>
              <div style="color: #ffffff; font-weight: 700; font-size: 14px;">REQUESTED BY</div>
              <div style="color: #ffffff; font-weight: 500;">${this.esc(fields['Requested by'] || 'Unknown')}</div>
            </div>
            <div>
              <div style="color: #ffffff; font-weight: 700; font-size: 14px;">PENDING REQUESTS</div>
              <div style="color: #ffffff; font-weight: 500;">${this.esc(fields['Total pending'] || '0').replace(' requests', ' awaiting review')}</div>
            </div>
          </div>
          ${
            fields.Reason
              ? `
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #343746;">
            <div style="color: #ffffff; font-weight: 700; font-size: 14px;">REASON FOR APPROVAL</div>
            <div style="color: #ffffff; font-weight: 500; margin-top: 5px;">${this.esc(fields.Reason)}</div>
          </div>
          `
              : ''
          }
        </div>
      `

      // Action Card
      const actionCard = fields['Action Required']
        ? `
        <div style="margin-bottom: 20px; padding: 15px; background-color: #212121; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <div style="color: #ffffff; font-weight: 700; text-align: center;">${this.esc(fields['Action Required'])}</div>
        </div>
      `
        : ''

      // Build text body with consolidated structure
      textBody += `${fields.Content || 'Unknown Content'}\n`
      textBody += `Type: ${fields.Type || 'Unknown'}\n\n`
      textBody += `Requested by: ${fields['Requested by'] || 'Unknown'}\n`
      textBody += `Total pending: ${fields['Total pending'] || '0'}\n`
      if (fields.Reason) textBody += `Reason: ${fields.Reason}\n`
      textBody += `\n${fields['Action Required'] || ''}\n\n`

      // Create complete HTML content with Pulsarr styling
      const systemContent = `
        <h2 style="color: #000000; margin-top: 0; font-weight: 700;">Content Approval Required</h2>
        ${contentCard}
        ${requestCard}
        ${actionCard}
      `

      const htmlBody = this.htmlWrapper(systemContent)

      // Add footer to text content
      textBody += '- Pulsarr System'

      const appriseNotification: AppriseNotification = {
        title,
        body: textBody,
        type,
        format: 'text',
        tag: 'system',
        body_html: htmlBody,
        // Include Pulsarr icon for notification services that support icons
        attach_url: this.ICON_URL,
      }

      // Add poster URL if available - matching media notification pattern
      if (notification.posterUrl) {
        appriseNotification.image = notification.posterUrl
      }

      // Send to the system Apprise URL
      return await this.sendNotification(systemUrl, appriseNotification)
    } catch (error) {
      this.log.error(
        { err: error as Error },
        'Error sending system notification',
      )
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
    results: DeleteSyncResult & {
      total: { protected?: number }
      movies: { protected?: number }
      shows: { protected?: number }
    },
    dryRun: boolean,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false
    }

    try {
      const systemUrl = this.config.systemAppriseUrl
      if (!systemUrl) {
        this.log.debug(
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

      // Using the centralized htmlWrapper method defined at the class level

      // Create text version of the body
      let textBody = ''

      // Create a summary
      let summaryText = dryRun
        ? 'This was a dry run - no content was actually deleted.'
        : results.safetyTriggered
          ? results.safetyMessage ||
            'A safety check prevented the delete sync operation from running.'
          : "The following content was removed because it's no longer in any user's watchlist."

      // Add protected playlist information if there are protected items
      if (results.total.protected && results.total.protected > 0) {
        summaryText += ` ${results.total.protected} items were preserved because they are in protected playlists.`
      }

      textBody += `${summaryText}\n\n`

      // Build the title section with the summary text
      const titleSection = `
      <p style="margin-bottom: 20px; color: #000000;">${this.esc(summaryText)}</p>
      `

      // Add summary section with correct Pulsarr dark theme styling
      const summarySection = `
      <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: ${results.safetyTriggered ? '#c1666b' : '#212121'}; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
        <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">Summary</h3>
        <div style="display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-around; margin-top: 15px;">
          <div style="display: flex; align-items: center; margin-right: 20px; margin-bottom: 10px;">
            <span style="font-size: 24px; font-weight: 700; color: #ffffff; margin-right: 10px; display: inline-block; min-width: 30px; text-align: center;">${results.total.processed}</span>
            <span style="font-weight: 500; color: #ffffff; display: inline-block;">Processed</span>
          </div>
          <div style="display: flex; align-items: center; margin-right: 20px; margin-bottom: 10px;">
            <span style="font-size: 24px; font-weight: 700; color: #ffffff; margin-right: 10px; display: inline-block; min-width: 30px; text-align: center;">${results.total.deleted}</span>
            <span style="font-weight: 500; color: #ffffff; display: inline-block;">Deleted</span>
          </div>
          <div style="display: flex; align-items: center; margin-right: 20px; margin-bottom: 10px;">
            <span style="font-size: 24px; font-weight: 700; color: #ffffff; margin-right: 10px; display: inline-block; min-width: 30px; text-align: center;">${results.total.skipped}</span>
            <span style="font-weight: 500; color: #ffffff; display: inline-block;">Skipped</span>
          </div>
          ${
            results.total.protected
              ? `
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 24px; font-weight: 700; color: #ffffff; margin-right: 10px; display: inline-block; min-width: 30px; text-align: center;">${results.total.protected}</span>
            <span style="font-weight: 500; color: #ffffff; display: inline-block;">Protected</span>
          </div>`
              : ''
          }
        </div>
      </div>
      `

      textBody += 'Summary:\n'
      textBody += `Processed: ${results.total.processed} items\n`
      textBody += `Deleted: ${results.total.deleted} items\n`
      textBody += `Skipped: ${results.total.skipped} items\n`
      if (results.total.protected) {
        textBody += `Protected: ${results.total.protected} items\n`
      }
      textBody += '\n'

      // Add safety message if applicable with correct Pulsarr dark theme styling
      let safetySection = ''
      if (results.safetyTriggered && results.safetyMessage) {
        safetySection = `
        <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: #212121; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">Safety Reason</h3>
          <p style="font-weight: 500; color: #ffffff;">${this.esc(results.safetyMessage)}</p>
        </div>
        `

        textBody += `Safety Reason: ${results.safetyMessage}\n\n`
      }

      // Add content sections with better styling
      let contentSections = ''

      // Movies section
      if (results.movies.deleted > 0) {
        const movieList = results.movies.items
          .slice(0, 10)
          .map(
            (item) =>
              `<li style="margin-bottom: 5px; color: #ffffff; font-weight: 500;">${this.esc(item.title)}</li>`,
          )
          .join('')

        const moreMovies =
          results.movies.items.length > 10
            ? `<p style="font-style: italic; margin-top: 10px; color: #ffffff;">... and ${results.movies.items.length - 10} more movies</p>`
            : ''

        // Include protected count if available
        const protectedInfo =
          results.movies.protected && results.movies.protected > 0
            ? ` (${results.movies.protected} protected)`
            : ''

        contentSections += `
        <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: #212121; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">Movies (${results.movies.deleted} deleted${protectedInfo})</h3>
          <ul style="margin-bottom: 0; padding-left: 20px; color: #ffffff;">
            ${movieList || '<li style="font-weight: 500; color: #ffffff;">None</li>'}
          </ul>
          ${moreMovies}
        </div>
        `

        // Text version
        const textMovieList = results.movies.items
          .slice(0, 10)
          .map((item) => `• ${item.title}`)
          .join('\n')

        textBody += `Movies (${results.movies.deleted} deleted${protectedInfo}):\n${textMovieList || 'None'}\n`

        if (results.movies.items.length > 10) {
          textBody += `... and ${results.movies.items.length - 10} more movies\n\n`
        } else {
          textBody += '\n'
        }
      } else {
        // Include protected count if available
        const protectedInfo =
          results.movies.protected && results.movies.protected > 0
            ? ` (${results.movies.protected} protected)`
            : ''

        contentSections += `
        <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: #212121; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">Movies</h3>
          <p style="font-weight: 500; color: #ffffff;">No movies deleted${protectedInfo}</p>
        </div>
        `
        textBody += `Movies: No movies deleted${protectedInfo}\n\n`
      }

      // TV Shows section
      if (results.shows.deleted > 0) {
        const showList = results.shows.items
          .slice(0, 10)
          .map(
            (item) =>
              `<li style="margin-bottom: 5px; color: #ffffff; font-weight: 500;">${this.esc(item.title)}</li>`,
          )
          .join('')

        const moreShows =
          results.shows.items.length > 10
            ? `<p style="font-style: italic; margin-top: 10px; color: #ffffff;">... and ${results.shows.items.length - 10} more TV shows</p>`
            : ''

        // Include protected count if available
        const protectedInfo =
          results.shows.protected && results.shows.protected > 0
            ? ` (${results.shows.protected} protected)`
            : ''

        contentSections += `
        <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: #212121; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">TV Shows (${results.shows.deleted} deleted${protectedInfo})</h3>
          <ul style="margin-bottom: 0; padding-left: 20px; color: #ffffff;">
            ${showList || '<li style="font-weight: 500; color: #ffffff;">None</li>'}
          </ul>
          ${moreShows}
        </div>
        `

        // Text version
        const textShowList = results.shows.items
          .slice(0, 10)
          .map((item) => `• ${item.title}`)
          .join('\n')

        textBody += `TV Shows (${results.shows.deleted} deleted${protectedInfo}):\n${textShowList || 'None'}\n`

        if (results.shows.items.length > 10) {
          textBody += `... and ${results.shows.items.length - 10} more TV shows\n\n`
        } else {
          textBody += '\n'
        }
      } else {
        // Include protected count if available
        const protectedInfo =
          results.shows.protected && results.shows.protected > 0
            ? ` (${results.shows.protected} protected)`
            : ''

        contentSections += `
        <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: #212121; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">TV Shows</h3>
          <p style="font-weight: 500; color: #ffffff;">No TV shows deleted${protectedInfo}</p>
        </div>
        `
        textBody += `TV Shows: No TV shows deleted${protectedInfo}\n\n`
      }

      // Add timestamp with correct Pulsarr dark theme styling
      const timestamp = new Date().toLocaleString()
      const timestampSection = `
      <div style="text-align: center; margin-top: 15px; font-style: italic; font-weight: 500; color: #ffffff; background-color: #212121; padding: 10px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
        Delete sync operation completed at ${this.esc(timestamp)}
      </div>
      `

      textBody += `Delete sync operation completed at ${timestamp}`

      // Combine all sections into the final HTML body
      const completeContent = `
        ${titleSection}
        ${summarySection}
        ${safetySection}
        ${contentSections}
        ${timestampSection}
      `

      const htmlBody = this.htmlWrapper(completeContent)

      const appriseNotification: AppriseNotification = {
        title,
        body: textBody,
        type,
        format: 'text',
        tag: 'delete-sync',
        body_html: htmlBody,
        attach_url: this.ICON_URL,
      }

      // Send to the system Apprise URL
      return await this.sendNotification(systemUrl, appriseNotification)
    } catch (error) {
      this.log.error(
        { err: error as Error },
        'Error sending delete sync notification',
      )
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
        this.log.debug(
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
            { err: error as Error },
            'Error looking up user alias for Apprise notification',
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

      // Note: Using fallbackHtmlBody instead of the flex-based htmlBody for better email client compatibility

      // Alternative HTML version that works better with email clients that don't support flexbox - with Pulsarr styling
      const fallbackHtmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #000000; border-radius: 5px; background-color: #48a9a6; color: #000000; box-shadow: 4px 4px 0px 0px #000000;">
        <div style="background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          ${
            item.posterUrl
              ? `<div style="text-align: center; margin-bottom: 20px;">
               <img src="${item.posterUrl}" alt="${this.esc(item.title)} poster" style="max-width: 200px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
             </div>`
              : ''
          }

          <div>
            <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">${this.esc(item.title)}</h3>
            <p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Type:</strong> ${this.esc(mediaType)}</p>
            <p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Added by:</strong> ${this.esc(displayName)}</p>
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid #000000; margin: 20px 0;">
        <p style="color:#000000; font-size:0.9em; text-align: center; font-weight: 500;">Powered by Pulsarr</p>
      </div>
      `

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
        body_html: fallbackHtmlBody, // Using the fallback version that works better with email clients
        attach_url: this.ICON_URL,
      }

      // Add poster URL if available - this is used by some notification services directly
      if (item.posterUrl) {
        appriseNotification.image = item.posterUrl
      }

      // Send to the system Apprise URL
      return await this.sendNotification(systemUrl, appriseNotification)
    } catch (error) {
      this.log.error(
        { error },
        'Error sending watchlist addition notification:',
      )
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
      // Using the centralized htmlWrapper method defined at the class level

      // Create a rich HTML test message with various formatting examples - using Pulsarr styling
      const testContent = `
        <h2 style="color: #000000; margin-top: 0; font-weight: 700;">Pulsarr HTML Notification Test</h2>

        <div style="background-color: #212121; padding: 15px; margin: 20px 0; border: 2px solid #000000; border-radius: 5px; box-shadow: 4px 4px 0px 0px #000000;">
          <p style="font-weight: 500; color: #ffffff;">This is a test notification to verify your Apprise configuration is working correctly with <strong>HTML formatting</strong>.</p>
        </div>

        <h3 style="color: #000000; font-weight: 700;">HTML Formatting Examples:</h3>

        <div style="margin-bottom: 20px; background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h4 style="margin-top: 0; margin-bottom: 10px; color: #ffffff; font-weight: 700;">Text Styling</h4>
          <p style="font-weight: 500; color: #ffffff;"><strong>Bold text</strong>, <em>italic text</em>, <u>underlined text</u>, and <span style="color: #ffffff;">colored text</span></p>
        </div>

        <div style="margin-bottom: 20px; background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h4 style="margin-top: 0; margin-bottom: 10px; color: #ffffff; font-weight: 700;">Lists</h4>
          <ul style="padding-left: 20px; color: #ffffff;">
            <li style="margin-bottom: 5px; font-weight: 500;">Unordered list item 1</li>
            <li style="margin-bottom: 5px; font-weight: 500;">Unordered list item 2</li>
            <li style="margin-bottom: 5px; font-weight: 500;">Unordered list item 3</li>
          </ul>

          <ol style="padding-left: 20px; color: #ffffff;">
            <li style="margin-bottom: 5px; font-weight: 500;">Ordered list item 1</li>
            <li style="margin-bottom: 5px; font-weight: 500;">Ordered list item 2</li>
            <li style="margin-bottom: 5px; font-weight: 500;">Ordered list item 3</li>
          </ol>
        </div>

        <div style="margin-bottom: 20px; background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h4 style="margin-top: 0; margin-bottom: 10px; color: #ffffff; font-weight: 700;">Tables</h4>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; color: #ffffff;">
            <tr style="background-color: #343746;">
              <th style="padding: 8px; text-align: left; border: 1px solid #ffffff; font-weight: 700;">Header 1</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #ffffff; font-weight: 700;">Header 2</th>
            </tr>
            <tr style="background-color: #343746;">
              <td style="padding: 8px; border: 1px solid #ffffff; font-weight: 500;">Row 1, Cell 1</td>
              <td style="padding: 8px; border: 1px solid #ffffff; font-weight: 500;">Row 1, Cell 2</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ffffff; font-weight: 500;">Row 2, Cell 1</td>
              <td style="padding: 8px; border: 1px solid #ffffff; font-weight: 500;">Row 2, Cell 2</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 20px; background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h4 style="margin-top: 0; margin-bottom: 10px; color: #ffffff; font-weight: 700;">Styled Boxes</h4>

          <div style="padding: 10px; background-color: #343746; border-radius: 5px; margin-bottom: 10px; border: 1px solid #ffffff; color: #ffffff; font-weight: 500;">
            <p style="margin: 0;">This is an info box</p>
          </div>

          <div style="padding: 10px; background-color: #343746; border-radius: 5px; margin-bottom: 10px; border: 1px solid #ffffff; color: #ffffff; font-weight: 500;">
            <p style="margin: 0;">This is an alert box</p>
          </div>

          <div style="padding: 10px; background-color: #343746; border-radius: 5px; border: 1px solid #ffffff; color: #ffffff; font-weight: 500;">
            <p style="margin: 0;">This is a success box</p>
          </div>
        </div>

        <p style="font-weight: 500; color: #000000;">If you can see the formatting above, your notification service supports <strong>HTML</strong>! If not, you're seeing the plain text version.</p>
      `

      // Create HTML wrapped content
      const htmlBody = this.htmlWrapper(testContent)

      // Plain text version as a fallback
      const textBody =
        'Pulsarr HTML Notification Test\n\n' +
        'This is a test notification to verify your Apprise configuration is working correctly.\n\n' +
        'HTML Formatting Examples:\n\n' +
        '- Text Styling: Bold text, italic text, underlined text, and colored text\n\n' +
        '- Lists:\n' +
        '  • Unordered list item 1\n' +
        '  • Unordered list item 2\n' +
        '  • Unordered list item 3\n\n' +
        '  1. Ordered list item 1\n' +
        '  2. Ordered list item 2\n' +
        '  3. Ordered list item 3\n\n' +
        '- Tables:\n' +
        '  Header 1 | Header 2\n' +
        '  ---------|----------\n' +
        '  Row 1, Cell 1 | Row 1, Cell 2\n' +
        '  Row 2, Cell 1 | Row 2, Cell 2\n\n' +
        '- Styled Boxes:\n' +
        '  [Info] This is an info box\n' +
        '  [Alert] This is an alert box\n' +
        '  [Success] This is a success box\n\n' +
        'If you can see the formatting above, your notification service supports basic formatting. If the content appears plain, your service might only support plain text.\n\n' +
        '- Pulsarr Test'

      // Create the notification
      const notification: AppriseNotification = {
        title: '🔔 Pulsarr HTML Notification Test',
        body: textBody,
        type: 'info',
        format: 'text',
        tag: 'test',
        body_html: htmlBody,
        attach_url: this.ICON_URL,
      }

      return await this.sendNotification(targetUrl, notification)
    } catch (error) {
      this.log.error(
        { error: error as Error },
        'Error sending test notification',
      )
      return false
    }
  }
}
