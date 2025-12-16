/**
 * Apprise Channel
 *
 * Pure functions for sending Apprise notifications.
 * No state, no class dependencies - just HTTP POST to Apprise container.
 */

import type {
  AppriseMessageType,
  AppriseNotification,
} from '@root/types/apprise.types.js'
import type { User } from '@root/types/config.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  MediaNotification,
  SystemNotification,
} from '@root/types/discord.types.js'
import { getPublicContentUrls } from '@root/utils/notifications/index.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  createDeleteSyncNotificationHtml,
  createMediaNotificationHtml,
  createSystemNotificationHtml,
  createTestNotificationHtml,
  createWatchlistAdditionHtml,
  PULSARR_ICON_URL,
} from '../templates/apprise-html.js'

export interface AppriseDeps {
  log: FastifyBaseLogger
  config: {
    appriseUrl?: string
    enableApprise?: boolean
    systemAppriseUrl?: string
    publicContentNotifications?: {
      enabled: boolean
      appriseUrls?: string
      appriseUrlsMovies?: string
      appriseUrlsShows?: string
    }
  }
  lookupUserAlias?: (username: string) => Promise<string | undefined>
}

/**
 * Checks if Apprise is enabled in configuration.
 */
export function isAppriseEnabled(deps: AppriseDeps): boolean {
  return Boolean(deps.config.enableApprise)
}

/**
 * Sends a notification through the Apprise container to a specific target URL.
 */
export async function sendAppriseNotification(
  targetUrl: string,
  notification: AppriseNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  const { log, config } = deps

  try {
    if (!targetUrl) {
      log.debug('Attempted to send notification without target URL')
      return false
    }

    if (!isAppriseEnabled(deps)) {
      log.debug('Apprise notifications are disabled, skipping')
      return false
    }

    const appriseBaseUrl = config.appriseUrl || ''
    if (!appriseBaseUrl) {
      log.debug('Apprise base URL not configured; skipping notification')
      return false
    }

    // Use HTML content as the primary body when available
    const bodyContent = notification.body_html || notification.body
    const isHtml = !!notification.body_html

    // Create a clean payload without the non-standard body_html field
    const { body_html: _, format, ...cleanNotification } = notification

    // Prepare the payload with correct format settings for HTML
    const payload = {
      urls: targetUrl,
      ...cleanNotification,
      body: bodyContent,
      format: isHtml ? 'html' : (format ?? 'text'),
      input: isHtml ? 'html' : (format ?? 'text'),
    }

    log.debug({ isHtml }, 'Sending Apprise notification')

    const url = new URL('/notify', appriseBaseUrl)

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
      log.error(
        { status: response.status, statusText: response.statusText },
        'Apprise notification request failed',
      )
      return false
    }

    log.info('Apprise notification sent successfully')
    return true
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      'Error sending Apprise notification',
    )
    return false
  }
}

/**
 * Send public content notification to shared Apprise endpoints.
 */
export async function sendPublicNotification(
  notification: MediaNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  const publicConfig = deps.config.publicContentNotifications
  if (!publicConfig?.enabled) return false

  const appriseUrls = getPublicContentUrls(
    publicConfig,
    notification.type,
    'apprise',
  )

  if (appriseUrls.length === 0) return false

  // Create a fake user for public notifications
  const publicNotificationUser: User = {
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

  return await sendMediaNotification(publicNotificationUser, notification, deps)
}

/**
 * Sends a media notification to a user via their configured Apprise URL.
 */
export async function sendMediaNotification(
  user: User,
  notification: MediaNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  const { log } = deps

  if (!isAppriseEnabled(deps) || !user.apprise) {
    return false
  }

  if (user.notify_apprise === false) {
    log.debug(
      `User ${user.name} has Apprise notifications disabled, skipping media notification`,
    )
    return false
  }

  try {
    const { htmlBody, textBody, title } =
      createMediaNotificationHtml(notification)

    const appriseNotification: AppriseNotification = {
      title,
      body: textBody,
      type: 'info',
      format: 'text',
      tag: notification.type,
      body_html: htmlBody,
      attach_url: PULSARR_ICON_URL,
    }

    if (notification.posterUrl) {
      appriseNotification.image = notification.posterUrl
    }

    const success = await sendAppriseNotification(
      user.apprise,
      appriseNotification,
      deps,
    )

    if (success) {
      log.info(
        `Apprise notification sent successfully to ${user.alias || user.name} for "${notification.title}"`,
      )
    }

    return success
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      `Error sending media notification to user ${user.name}`,
    )
    return false
  }
}

/**
 * Send a system notification to the configured system endpoint.
 */
export async function sendSystemNotification(
  notification: SystemNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  const { log, config } = deps

  if (!isAppriseEnabled(deps)) {
    return false
  }

  try {
    const systemUrl = config.systemAppriseUrl
    if (!systemUrl) {
      log.debug(
        'System Apprise URL not configured, skipping system notification',
      )
      return false
    }

    // Determine notification type
    let type: AppriseMessageType = 'info'

    const hasSafetyField = notification.embedFields.some(
      (field) => field.name === 'Safety Reason',
    )
    const isSafetyTriggered = notification.title.includes('Safety Triggered')
    const hasTriggeredProperty =
      'safetyTriggered' in notification && notification.safetyTriggered === true

    if (hasSafetyField || isSafetyTriggered || hasTriggeredProperty) {
      type = 'failure'
    }

    const { htmlBody, textBody } = createSystemNotificationHtml(notification)

    const appriseNotification: AppriseNotification = {
      title: notification.title,
      body: textBody,
      type,
      format: 'text',
      tag: 'system',
      body_html: htmlBody,
      attach_url: PULSARR_ICON_URL,
    }

    if (notification.posterUrl) {
      appriseNotification.image = notification.posterUrl
    }

    return await sendAppriseNotification(systemUrl, appriseNotification, deps)
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      'Error sending system notification',
    )
    return false
  }
}

/**
 * Send a delete sync result notification to the admin.
 */
export async function sendDeleteSyncNotification(
  results: DeleteSyncResult,
  dryRun: boolean,
  deps: AppriseDeps,
): Promise<boolean> {
  const { log, config } = deps

  if (!isAppriseEnabled(deps)) {
    return false
  }

  try {
    const systemUrl = config.systemAppriseUrl
    if (!systemUrl) {
      log.debug(
        'System Apprise URL not configured, skipping delete sync notification',
      )
      return false
    }

    let type: AppriseMessageType = 'success'
    if (results.safetyTriggered) {
      type = 'failure'
    } else if (dryRun) {
      type = 'info'
    }

    const { htmlBody, textBody, title } = createDeleteSyncNotificationHtml(
      results,
      dryRun,
    )

    const appriseNotification: AppriseNotification = {
      title,
      body: textBody,
      type,
      format: 'text',
      tag: 'delete-sync',
      body_html: htmlBody,
      attach_url: PULSARR_ICON_URL,
    }

    return await sendAppriseNotification(systemUrl, appriseNotification, deps)
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      'Error sending delete sync notification',
    )
    return false
  }
}

/**
 * Send a watchlist addition notification.
 */
export async function sendWatchlistAdditionNotification(
  item: {
    title: string
    type: string
    addedBy: {
      name: string
      alias?: string | null
    }
    posterUrl?: string
  },
  deps: AppriseDeps,
): Promise<boolean> {
  const { log, config } = deps

  if (!isAppriseEnabled(deps)) {
    return false
  }

  try {
    const systemUrl = config.systemAppriseUrl
    if (!systemUrl) {
      log.debug(
        'System Apprise URL not configured, skipping watchlist addition notification',
      )
      return false
    }

    // User display name logic
    let displayName = item.addedBy.name
    if (item.addedBy.alias) {
      displayName = item.addedBy.alias
    } else if (deps.lookupUserAlias) {
      try {
        const alias = await deps.lookupUserAlias(item.addedBy.name)
        if (alias) {
          displayName = alias
          log.debug(
            `Using alias "${displayName}" instead of username "${item.addedBy.name}" for Apprise notification`,
          )
        }
      } catch (error) {
        log.error(
          { error: error instanceof Error ? error : new Error(String(error)) },
          'Error looking up user alias for Apprise notification',
        )
      }
    }

    const { htmlBody, textBody, title } = createWatchlistAdditionHtml({
      ...item,
      displayName,
    })

    const appriseNotification: AppriseNotification = {
      title: title || 'New Media Added',
      body: textBody,
      type: 'info',
      format: 'text',
      tag: 'watchlist-add',
      body_html: htmlBody,
      attach_url: PULSARR_ICON_URL,
    }

    if (item.posterUrl) {
      appriseNotification.image = item.posterUrl
    }

    return await sendAppriseNotification(systemUrl, appriseNotification, deps)
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      'Error sending watchlist addition notification',
    )
    return false
  }
}

/**
 * Send a test notification to verify Apprise configuration.
 */
export async function sendTestNotification(
  targetUrl: string,
  deps: AppriseDeps,
): Promise<boolean> {
  const { log } = deps

  try {
    const { htmlBody, textBody, title } = createTestNotificationHtml()

    const notification: AppriseNotification = {
      title,
      body: textBody,
      type: 'info',
      format: 'text',
      tag: 'test',
      body_html: htmlBody,
      attach_url: PULSARR_ICON_URL,
    }

    return await sendAppriseNotification(targetUrl, notification, deps)
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      'Error sending test notification',
    )
    return false
  }
}

/**
 * Checks whether the Apprise server at the given URL is reachable.
 *
 * Attempts an HTTP GET to the server root and returns true if the response has a successful status.
 * If `url` is empty/whitespace, the request times out (5 seconds), or any network/error occurs, returns false.
 *
 * @param url - The Apprise server base URL to ping
 * @returns True if the server responds with a successful HTTP status; otherwise false
 */
export async function pingAppriseServer(url: string): Promise<boolean> {
  if (!url || url.trim() === '') {
    return false
  }
  try {
    const pingUrl = new URL('/', url).toString()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    try {
      const response = await fetch(pingUrl, {
        method: 'GET',
        signal: controller.signal,
      })
      return response.ok
    } catch {
      return false
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    return false
  }
}
