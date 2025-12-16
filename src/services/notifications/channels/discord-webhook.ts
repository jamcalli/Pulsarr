/**
 * Discord Webhook Channel
 *
 * Pure functions for sending Discord webhook notifications.
 * No state, no bot client dependency - just HTTP POST to webhook URLs.
 */

import { createHash } from 'node:crypto'
import type {
  DiscordWebhookPayload,
  MediaNotification,
} from '@root/types/discord.types.js'
import { getPublicContentUrls } from '@root/utils/notifications/index.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  createMediaNotificationEmbed,
  createMediaWebhookPayload,
} from '../templates/discord-embeds.js'

export interface DiscordWebhookDeps {
  log: FastifyBaseLogger
  config: {
    discordWebhookUrl?: string
    publicContentNotifications?: {
      enabled: boolean
      discordMovieWebhookUrl?: string
      discordShowWebhookUrl?: string
    }
  }
  lookupUserAlias?: (username: string) => Promise<string | undefined>
}

/**
 * Generates a stable, anonymized fingerprint for a webhook endpoint URL.
 * Used for safe logging without exposing the actual webhook token.
 */
function endpointFingerprint(url: string): string {
  try {
    return createHash('sha256').update(url).digest('hex').slice(0, 8)
  } catch {
    return 'unknown'
  }
}

/**
 * Sends a webhook payload to one or more Discord webhook URLs.
 *
 * @param payload - The Discord webhook payload to send
 * @param deps - Dependencies (logger, config)
 * @param overrideUrls - Optional URLs to use instead of config URLs
 * @returns true if at least one webhook succeeded
 */
export async function sendWebhookNotification(
  payload: DiscordWebhookPayload,
  deps: DiscordWebhookDeps,
  overrideUrls?: string[],
): Promise<boolean> {
  const { log, config } = deps
  let webhookUrls: string[]

  if (overrideUrls) {
    webhookUrls = [
      ...new Set(overrideUrls.map((url) => url.trim()).filter(Boolean)),
    ]
    if (webhookUrls.length === 0) {
      log.debug('No valid override webhook URLs provided')
      return false
    }
  } else {
    if (!config.discordWebhookUrl) {
      log.debug('Attempted to send notification without webhook URL configured')
      return false
    }

    const trimmedInput = config.discordWebhookUrl?.trim() ?? ''
    if (trimmedInput.length === 0) {
      log.debug('Webhook URL is empty or contains only whitespace')
      return false
    }

    webhookUrls = [
      ...new Set(
        trimmedInput
          .split(',')
          .map((url) => url.trim())
          .filter((url) => url.length > 0),
      ),
    ]

    if (webhookUrls.length === 0) {
      log.debug('No valid webhook URLs found after parsing')
      return false
    }
  }

  try {
    const endpointWord = webhookUrls.length === 1 ? 'endpoint' : 'endpoints'
    log.debug(
      { webhookCount: webhookUrls.length, payload },
      `Sending Discord webhook notification to ${webhookUrls.length} ${endpointWord}`,
    )

    const results = await Promise.all(
      webhookUrls.map(async (webhookUrl, endpointIndex) => {
        const endpoint = endpointFingerprint(webhookUrl)
        const controller = new AbortController()
        const timeoutMs = 10000
        const timeout = setTimeout(() => controller.abort(), timeoutMs)
        const startedAt = Date.now()
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          })

          const durationMs = Date.now() - startedAt
          if (!response.ok) {
            log.warn(
              {
                endpointIndex: endpointIndex + 1,
                endpoint,
                status: response.status,
                statusText: response.statusText,
                durationMs,
              },
              'Discord webhook request failed for one endpoint',
            )
            return false
          }
          log.debug(
            {
              endpointIndex: endpointIndex + 1,
              endpoint,
              status: response.status,
              durationMs,
            },
            'Discord webhook request succeeded for one endpoint',
          )
          return true
        } catch (error) {
          const durationMs = Date.now() - startedAt
          log.warn(
            { endpointIndex: endpointIndex + 1, endpoint, error, durationMs },
            'Error sending to one Discord webhook endpoint',
          )
          return false
        } finally {
          clearTimeout(timeout)
        }
      }),
    )

    const successCount = results.filter(Boolean).length
    const totalEndpoints = webhookUrls.length
    const allSucceeded = successCount === totalEndpoints
    const someSucceeded = successCount > 0

    if (allSucceeded) {
      log.info(
        `Discord webhooks sent successfully to all ${totalEndpoints} endpoints`,
      )
      return true
    }

    if (someSucceeded) {
      log.warn(
        `Discord webhooks sent to ${successCount}/${totalEndpoints} endpoints`,
      )
      return true
    }

    log.error('All Discord webhook requests failed')
    return false
  } catch (error) {
    log.error({ error }, 'Error in Discord webhook processing')
    return false
  }
}

/**
 * Sends a public content notification with @ mentions.
 *
 * @param notification - Media notification details
 * @param userDiscordIds - Discord user IDs to mention
 * @param deps - Dependencies
 * @returns true if sent successfully
 */
export async function sendPublicNotification(
  notification: MediaNotification,
  userDiscordIds: string[] | undefined,
  deps: DiscordWebhookDeps,
): Promise<boolean> {
  const { config } = deps
  const publicConfig = config.publicContentNotifications
  if (!publicConfig?.enabled) return false

  const webhookUrls = getPublicContentUrls(
    publicConfig,
    notification.type,
    'discord',
  )

  if (webhookUrls.length === 0) return false

  const embed = createMediaNotificationEmbed(notification)

  let content = ''
  if (userDiscordIds && userDiscordIds.length > 0) {
    const mentions = userDiscordIds.map((id) => `<@${id}>`).join(' ')
    content = `${mentions} 👋`
  }

  const payload: DiscordWebhookPayload = {
    content,
    embeds: [embed],
    username: 'Pulsarr',
    avatar_url:
      'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
  }

  return await sendWebhookNotification(payload, deps, webhookUrls)
}

/**
 * Sends a media notification to admin webhook (user added X to watchlist).
 *
 * @param notification - Media notification with username
 * @param deps - Dependencies (including optional user alias lookup)
 * @returns true if sent successfully
 */
export async function sendMediaNotification(
  notification: MediaNotification,
  deps: DiscordWebhookDeps,
): Promise<boolean> {
  const { log } = deps

  log.debug({ notification }, 'Creating media notification')

  // Look up user alias if available
  let displayName = notification.username
  if (deps.lookupUserAlias) {
    try {
      const alias = await deps.lookupUserAlias(notification.username)
      if (alias) {
        displayName = alias
        log.debug(
          `Using alias "${displayName}" instead of username "${notification.username}" for webhook`,
        )
      }
    } catch (error) {
      log.error(
        {
          error: error instanceof Error ? error : new Error(String(error)),
          username: notification.username,
        },
        'Error looking up user alias for webhook',
      )
    }
  }

  const payload = createMediaWebhookPayload(notification, displayName)
  return sendWebhookNotification(payload, deps)
}

/** Valid Discord webhook hosts */
const VALID_WEBHOOK_HOSTS = [
  'discord.com',
  'discordapp.com',
  'canary.discord.com',
  'ptb.discord.com',
] as const

/**
 * Validates a Discord webhook URL.
 *
 * @param url - The webhook URL to validate
 * @param log - Logger instance
 * @returns Validation result with optional error message
 */
export async function validateWebhook(
  url: string,
  log: FastifyBaseLogger,
): Promise<{ valid: boolean; error?: string }> {
  try {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch (_e) {
      return { valid: false, error: 'Invalid URL format' }
    }

    if (
      parsedUrl.protocol !== 'https:' ||
      !VALID_WEBHOOK_HOSTS.some((host) => host === parsedUrl.hostname) ||
      !parsedUrl.pathname.startsWith('/api/webhooks/')
    ) {
      return { valid: false, error: 'Invalid Discord webhook URL format' }
    }

    if (parsedUrl.port && parsedUrl.port !== '443') {
      return { valid: false, error: 'Invalid port for Discord webhook' }
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      return {
        valid: false,
        error: `Request failed with status ${response.status}: ${response.statusText}`,
      }
    }

    return { valid: true }
  } catch (error) {
    let safeHost: string | undefined
    let webhookIdSuffix: string | undefined
    try {
      const u = new URL(url)
      safeHost = u.hostname
      const parts = u.pathname.split('/')
      webhookIdSuffix = parts.length >= 4 ? parts[3].slice(-6) : undefined
    } catch {
      // ignore parsing error
    }
    log.error(
      { error, host: safeHost, webhookIdSuffix },
      'Error validating webhook',
    )
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
