/**
 * Apprise Channel
 *
 * Pure functions for sending Apprise notifications.
 * No state, no class dependencies - just HTTP POST to Apprise container.
 */

import type {
  AppriseMessageType,
  AppriseNotification,
  AppriseSchemaFormatMap,
} from '@root/types/apprise.types.js'
import type { User } from '@root/types/config.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  MediaNotification,
  SystemNotification,
} from '@root/types/discord.types.js'
import {
  getPublicContentUrls,
  resolveAppriseUrls,
} from '@root/utils/notifications/index.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  createDeleteSyncNotificationHtml,
  createMediaNotificationHtml,
  createSystemNotificationHtml,
  createTestNotificationHtml,
  createWatchlistAdditionHtml,
  PULSARR_ICON_URL,
} from '../templates/apprise-html.js'
import {
  analyzeAppriseUrls,
  createNotificationBatches,
} from './apprise-format-cache.js'

export interface AppriseDeps {
  log: FastifyBaseLogger
  config: {
    appriseUrl?: string
    enableApprise?: boolean
    systemAppriseUrl?: string
    appriseEmailSender?: string
    publicContentNotifications?: {
      enabled: boolean
      appriseUrls?: string
      appriseUrlsMovies?: string
      appriseUrlsShows?: string
    }
  }
  schemaFormatCache?: AppriseSchemaFormatMap
  lookupUserAlias?: (username: string) => Promise<string | undefined>
}

/**
 * Checks if Apprise is enabled in configuration.
 */
export function isAppriseEnabled(deps: AppriseDeps): boolean {
  return Boolean(deps.config.enableApprise)
}

/**
 * Low-level function to send a single notification batch to Apprise.
 * Takes explicit body content and format - no format detection.
 */
async function sendAppriseNotificationBatch(
  targetUrls: string,
  body: string,
  format: 'text' | 'html',
  notification: Omit<AppriseNotification, 'body' | 'body_html' | 'format'>,
  deps: AppriseDeps,
): Promise<boolean> {
  const { log, config } = deps

  try {
    const appriseBaseUrl = config.appriseUrl || ''
    if (!appriseBaseUrl) {
      log.debug('Apprise base URL not configured; skipping notification')
      return false
    }

    const payload = {
      urls: targetUrls,
      ...notification,
      body,
      format,
      input: format,
    }

    log.debug(
      { format, urlCount: targetUrls.split(',').length },
      'Sending Apprise notification batch',
    )

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

    return true
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      'Error sending Apprise notification batch',
    )
    return false
  }
}

/**
 * Sends a notification through the Apprise container with format-aware batching.
 * Analyzes target URLs to determine native format, groups by format, and sends
 * appropriate body (HTML or text) to each group in parallel.
 */
export async function sendAppriseNotification(
  targetUrl: string,
  notification: AppriseNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  const { log, schemaFormatCache } = deps

  try {
    if (!targetUrl) {
      log.debug('Attempted to send notification without target URL')
      return false
    }

    if (!isAppriseEnabled(deps)) {
      log.debug('Apprise notifications are disabled, skipping')
      return false
    }

    const htmlBody = notification.body_html || notification.body
    const textBody = notification.body

    // Extract common notification fields (excluding body variants and format)
    const {
      body: _,
      body_html: __,
      format: ___,
      ...commonFields
    } = notification

    // If no format cache, fall back to legacy behavior (send HTML if available)
    if (!schemaFormatCache || schemaFormatCache.size === 0) {
      log.debug(
        'No schema format cache available, using legacy HTML-preferred behavior',
      )
      const format = notification.body_html ? 'html' : 'text'
      const body = notification.body_html || notification.body
      return sendAppriseNotificationBatch(
        targetUrl,
        body,
        format,
        commonFields,
        deps,
      )
    }

    // Analyze URLs and create format-appropriate batches
    const urlInfos = analyzeAppriseUrls(targetUrl, schemaFormatCache)
    const batches = createNotificationBatches(urlInfos, htmlBody, textBody)

    if (batches.length === 0) {
      log.debug('No notification batches to send')
      return false
    }

    // Send all batches in parallel
    const results = await Promise.all(
      batches.map((batch) =>
        sendAppriseNotificationBatch(
          batch.urls.join(','),
          batch.body,
          batch.format,
          commonFields,
          deps,
        ),
      ),
    )

    const allSucceeded = results.every(Boolean)
    const anySucceeded = results.some(Boolean)

    if (allSucceeded) {
      log.info(
        { batchCount: batches.length },
        'Apprise notification sent successfully',
      )
    } else if (anySucceeded) {
      log.warn(
        {
          batchCount: batches.length,
          successCount: results.filter(Boolean).length,
        },
        'Some Apprise notification batches failed',
      )
    }

    return anySucceeded
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
 *
 * Supports plain email addresses (e.g., user@example.com) when admin has
 * configured an email sender URL. Plain emails are resolved to full Apprise
 * URLs using the admin's sender with ?to= parameter.
 */
export async function sendMediaNotification(
  user: User,
  notification: MediaNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  const { log, config } = deps

  if (!isAppriseEnabled(deps) || !user.apprise) {
    return false
  }

  if (user.notify_apprise === false) {
    log.debug(
      `User ${user.name} has Apprise notifications disabled, skipping media notification`,
    )
    return false
  }

  // Resolve user's apprise value to full URL(s)
  // This handles plain email addresses by appending ?to= to admin's sender URL
  const targetUrl = resolveAppriseUrls(user.apprise, config.appriseEmailSender)
  if (!targetUrl) {
    log.debug(
      { userId: user.id, apprise: user.apprise },
      'Could not resolve apprise URL (plain email without admin sender configured?)',
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
      targetUrl,
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
    // Resolve system URL (handles plain email addresses)
    const systemUrl = resolveAppriseUrls(
      config.systemAppriseUrl || '',
      config.appriseEmailSender,
    )
    if (!systemUrl) {
      log.debug(
        'System Apprise URL not configured or could not be resolved, skipping system notification',
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
    // Resolve system URL (handles plain email addresses)
    const systemUrl = resolveAppriseUrls(
      config.systemAppriseUrl || '',
      config.appriseEmailSender,
    )
    if (!systemUrl) {
      log.debug(
        'System Apprise URL not configured or could not be resolved, skipping delete sync notification',
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
    tmdbUrl?: string
  },
  deps: AppriseDeps,
): Promise<boolean> {
  const { log, config } = deps

  if (!isAppriseEnabled(deps)) {
    return false
  }

  try {
    // Resolve system URL (handles plain email addresses)
    const systemUrl = resolveAppriseUrls(
      config.systemAppriseUrl || '',
      config.appriseEmailSender,
    )
    if (!systemUrl) {
      log.debug(
        'System Apprise URL not configured or could not be resolved, skipping watchlist addition notification',
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
  const { log, config } = deps

  try {
    // Resolve target URL (handles plain email addresses)
    const resolvedUrl = resolveAppriseUrls(targetUrl, config.appriseEmailSender)
    if (!resolvedUrl) {
      log.debug(
        { targetUrl },
        'Could not resolve test notification URL (plain email without admin sender configured?)',
      )
      return false
    }

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

    return await sendAppriseNotification(resolvedUrl, notification, deps)
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
