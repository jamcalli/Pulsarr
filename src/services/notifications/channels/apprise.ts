import type {
  AppriseMessageType,
  AppriseNotification,
  AppriseSchemaFormatMap,
} from '@root/types/apprise.types.js'
import type { NotificationUser } from '@root/types/config.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  MediaNotification,
  SystemNotification,
  UpdateAvailableRelease,
  WatchlistAdditionNotification,
  WatchlistCapNotification,
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
  createUpdateAvailableNotificationHtml,
  createWatchlistAdditionHtml,
  createWatchlistCapNotificationHtml,
} from '../templates/apprise-html.js'
import { isSafetyNotification } from '../templates/system-notification.js'
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

export function isAppriseEnabled(deps: AppriseDeps): boolean {
  return Boolean(deps.config.enableApprise)
}

async function sendAppriseNotificationBatch(
  targetUrls: string,
  body: string,
  format: 'text' | 'html',
  notification: Omit<AppriseNotification, 'body' | 'body_html' | 'format'>,
  deps: AppriseDeps,
  includeAttachment: boolean,
): Promise<boolean> {
  const { log, config } = deps

  try {
    const appriseBaseUrl = config.appriseUrl || ''
    if (!appriseBaseUrl) {
      log.debug('Apprise base URL not configured; skipping notification')
      return false
    }

    // Email services render the poster from the HTML body, so their batches drop the attachment
    const { attachment, ...notificationWithoutAttachment } = notification
    const notificationFields = includeAttachment
      ? notification
      : notificationWithoutAttachment

    const payload = {
      urls: targetUrls,
      ...notificationFields,
      body,
      format,
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

    const {
      body: _,
      body_html: __,
      format: ___,
      ...commonFields
    } = notification

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
        true,
      )
    }

    const urlInfos = analyzeAppriseUrls(targetUrl, schemaFormatCache)
    const batches = createNotificationBatches(urlInfos, htmlBody, textBody)

    if (batches.length === 0) {
      log.debug('No notification batches to send')
      return false
    }

    const results = await Promise.all(
      batches.map((batch) =>
        sendAppriseNotificationBatch(
          batch.urls.join(','),
          batch.body,
          batch.format,
          commonFields,
          deps,
          batch.includeAttachment,
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

// A plain email target resolves against the admin email sender URL with ?to=
async function deliver(
  rawTarget: string | undefined,
  label: string,
  build: () => AppriseNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  const { log, config } = deps

  if (!isAppriseEnabled(deps)) {
    return false
  }

  try {
    const targetUrl = resolveAppriseUrls(
      rawTarget || '',
      config.appriseEmailSender,
    )
    if (!targetUrl) {
      log.debug(
        `Apprise URL not configured or could not be resolved, skipping ${label}`,
      )
      return false
    }

    return await sendAppriseNotification(targetUrl, build(), deps)
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      `Error sending ${label}`,
    )
    return false
  }
}

export async function sendPublicNotification(
  notification: MediaNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  const { log } = deps
  const publicConfig = deps.config.publicContentNotifications
  if (!publicConfig?.enabled) return false

  const appriseUrls = getPublicContentUrls(
    publicConfig,
    notification.type,
    'apprise',
  )

  if (appriseUrls.length === 0) {
    const configuredUrls =
      notification.type === 'movie'
        ? (publicConfig.appriseUrlsMovies ?? publicConfig.appriseUrls)
        : (publicConfig.appriseUrlsShows ?? publicConfig.appriseUrls)

    if (configuredUrls) {
      log.warn(
        {
          contentType: notification.type,
          configuredUrls,
        },
        'Public content Apprise URLs configured but none were valid. URLs must be Apprise-style (scheme://) or plain email addresses.',
      )
    }
    return false
  }

  const publicNotificationUser: NotificationUser = {
    id: -1,
    name: 'Public Content',
    apprise: appriseUrls.join(','),
    alias: null,
    discord_id: null,
    notify_apprise: true,
    notify_discord: false,
    notify_discord_mention: false,
    notify_plex_mobile: false,
    can_sync: false,
  }

  return await sendMediaNotification(publicNotificationUser, notification, deps)
}

export async function sendMediaNotification(
  user: NotificationUser,
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

  const success = await deliver(
    user.apprise,
    `media notification to user ${user.name}`,
    () => {
      const { htmlBody, textBody, title } =
        createMediaNotificationHtml(notification)
      return {
        title,
        body: textBody,
        type: 'info',
        format: 'text',
        body_html: htmlBody,
        ...(notification.posterUrl
          ? { attachment: notification.posterUrl }
          : {}),
      }
    },
    deps,
  )

  if (success) {
    log.info(
      `Apprise notification sent successfully to ${user.alias || user.name} for "${notification.title}"`,
    )
  }

  return success
}

export async function sendSystemNotification(
  notification: SystemNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  return deliver(
    deps.config.systemAppriseUrl,
    'system notification',
    () => {
      const { htmlBody, textBody } = createSystemNotificationHtml(notification)
      return {
        title: notification.title,
        body: textBody,
        type: isSafetyNotification(notification) ? 'failure' : 'info',
        format: 'text',
        body_html: htmlBody,
        ...(notification.posterUrl
          ? { attachment: notification.posterUrl }
          : {}),
      }
    },
    deps,
  )
}

export async function sendUpdateAvailableNotification(
  release: UpdateAvailableRelease,
  deps: AppriseDeps,
): Promise<boolean> {
  return deliver(
    deps.config.systemAppriseUrl,
    'update-available notification',
    () => {
      const { htmlBody, textBody, title } =
        createUpdateAvailableNotificationHtml(release)
      return {
        title,
        body: textBody,
        type: 'info',
        format: 'text',
        body_html: htmlBody,
      }
    },
    deps,
  )
}

export async function sendDeleteSyncNotification(
  results: DeleteSyncResult,
  dryRun: boolean,
  deps: AppriseDeps,
): Promise<boolean> {
  return deliver(
    deps.config.systemAppriseUrl,
    'delete sync notification',
    () => {
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
      return {
        title,
        body: textBody,
        type,
        format: 'text',
        body_html: htmlBody,
      }
    },
    deps,
  )
}

export async function sendWatchlistCapNotification(
  event: WatchlistCapNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  return deliver(
    deps.config.systemAppriseUrl,
    'watchlist cap notification',
    () => {
      const { htmlBody, textBody } = createWatchlistCapNotificationHtml(event)
      return {
        title: 'Watchlist Cap Reached',
        body: textBody,
        type: 'warning',
        format: 'text',
        body_html: htmlBody,
      }
    },
    deps,
  )
}

export async function sendUserWatchlistCapNotification(
  user: NotificationUser,
  event: WatchlistCapNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  const { log } = deps

  if (!isAppriseEnabled(deps) || !user.apprise) {
    return false
  }

  if (user.notify_apprise === false) {
    log.debug(
      `User ${user.name} has Apprise notifications disabled, skipping watchlist cap notification`,
    )
    return false
  }

  const success = await deliver(
    user.apprise,
    `watchlist cap notification to user ${user.name}`,
    () => {
      const { htmlBody, textBody } = createWatchlistCapNotificationHtml(event)
      return {
        title: 'Watchlist Cap Reached',
        body: textBody,
        type: 'warning',
        format: 'text',
        body_html: htmlBody,
      }
    },
    deps,
  )

  if (success) {
    log.info(
      `Watchlist cap Apprise notification sent to ${user.alias || user.name}`,
    )
  }

  return success
}

async function resolveAddedByName(
  addedBy: WatchlistAdditionNotification['addedBy'],
  deps: AppriseDeps,
): Promise<string> {
  if (addedBy.alias) return addedBy.alias
  if (!deps.lookupUserAlias) return addedBy.name

  try {
    const alias = await deps.lookupUserAlias(addedBy.name)
    if (alias) {
      deps.log.debug(
        `Using alias "${alias}" instead of username "${addedBy.name}" for Apprise notification`,
      )
      return alias
    }
  } catch (error) {
    deps.log.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      'Error looking up user alias for Apprise notification',
    )
  }

  return addedBy.name
}

export async function sendWatchlistAdditionNotification(
  item: WatchlistAdditionNotification,
  deps: AppriseDeps,
): Promise<boolean> {
  if (!isAppriseEnabled(deps)) {
    return false
  }

  const displayName = await resolveAddedByName(item.addedBy, deps)

  return deliver(
    deps.config.systemAppriseUrl,
    'watchlist addition notification',
    () => {
      const { htmlBody, textBody, title } = createWatchlistAdditionHtml({
        ...item,
        displayName,
      })
      return {
        title: title || 'New Media Added',
        body: textBody,
        type: 'info',
        format: 'text',
        body_html: htmlBody,
        ...(item.posterUrl ? { attachment: item.posterUrl } : {}),
      }
    },
    deps,
  )
}

export async function sendTestNotification(
  targetUrl: string,
  deps: AppriseDeps,
): Promise<boolean> {
  return deliver(
    targetUrl,
    'test notification',
    () => {
      const { htmlBody, textBody, title } = createTestNotificationHtml()
      return {
        title,
        body: textBody,
        type: 'info',
        format: 'text',
        body_html: htmlBody,
      }
    },
    deps,
  )
}

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
