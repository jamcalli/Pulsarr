import { createHash } from 'node:crypto'
import { isDiscordWebhookUrl } from '@root/schemas/common/discord-webhook-url.schema.js'
import type { DiscordWebhookPayload } from '@root/types/discord.types.js'
import type {
  DeliveryResult,
  NotificationTestOutcome,
} from '@root/types/notification.types.js'
import { errorMessage } from '@utils/error-message.js'
import { splitUrlList } from '@utils/url.js'
import type { FastifyBaseLogger } from 'fastify'
import { createTestWebhookPayload } from '../templates/discord-embeds.js'
import { postJson } from './http.js'

export interface DiscordWebhookDeps {
  logger: FastifyBaseLogger
}

const WEBHOOK_TIMEOUT_MS = 10_000

const MAX_VALIDATED_WEBHOOKS = 20

/** Hashes the URL so logs never carry the webhook token. */
function endpointFingerprint(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 8)
}

/** `target` is a comma-separated list of webhook URLs. Delivered when any endpoint accepted the payload. */
export async function sendNotification(
  target: string | null | undefined,
  payload: DiscordWebhookPayload,
  deps: DiscordWebhookDeps,
  retry = true,
): Promise<DeliveryResult> {
  const urls = [...new Set(splitUrlList(target))]
  if (urls.length === 0) {
    return { ok: false, reason: 'no Discord webhook URL configured' }
  }

  const results = await Promise.all(
    urls.map(async (url) => ({
      endpoint: endpointFingerprint(url),
      result: await postJson(url, payload, {
        timeoutMs: WEBHOOK_TIMEOUT_MS,
        retry,
      }),
    })),
  )
  const failures = results.flatMap(({ endpoint, result }) =>
    result.ok ? [] : [{ endpoint, reason: result.reason }],
  )

  if (failures.length === 0) {
    deps.logger.debug(
      { endpointCount: urls.length },
      'Discord webhook notification sent',
    )
    return { ok: true }
  }

  const partial = failures.length < urls.length
  deps.logger[partial ? 'warn' : 'debug'](
    { endpointCount: urls.length, failures },
    'Discord webhook notification failed',
  )
  return partial
    ? { ok: true }
    : {
        ok: false,
        reason: failures.map((failure) => failure.reason).join('; '),
      }
}

export async function testNotification(
  url: string,
  deps: DiscordWebhookDeps,
): Promise<NotificationTestOutcome> {
  const result = await sendNotification(
    url,
    createTestWebhookPayload(),
    deps,
    false,
  )
  return result.ok
    ? { success: true }
    : {
        success: false,
        error:
          'Discord did not accept the test message. Check that the webhook URL is correct and still exists.',
      }
}

async function validateWebhook(
  url: string,
  log: FastifyBaseLogger,
): Promise<{ valid: boolean; error?: string }> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  if (!isDiscordWebhookUrl(url)) {
    return { valid: false, error: 'Invalid Discord webhook URL format' }
  }

  if (parsedUrl.port && parsedUrl.port !== '443') {
    return { valid: false, error: 'Invalid port for Discord webhook' }
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })

    if (!response.ok) {
      return {
        valid: false,
        error: `Request failed with status ${response.status}: ${response.statusText}`,
      }
    }

    return { valid: true }
  } catch (error) {
    log.warn(
      { error, endpoint: endpointFingerprint(url) },
      'Error validating Discord webhook',
    )
    return { valid: false, error: errorMessage(error) }
  }
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export interface WebhookValidationResult {
  success: true
  valid: boolean
  urls: Array<{ url: string; valid: boolean; error?: string }>
  duplicateCount?: number
  message: string
}

export type WebhookValidationOutcome =
  | { status: 'validated'; result: WebhookValidationResult }
  | { status: 'invalid_input'; message: string }

/** `input` is the comma-separated list a user typed. Each unique URL is fetched once. */
export async function validateWebhooks(
  input: string,
  deps: DiscordWebhookDeps,
): Promise<WebhookValidationOutcome> {
  if (input.trim().length === 0) {
    return { status: 'invalid_input', message: 'No webhook URLs provided' }
  }

  const allUrls = splitUrlList(input)
  const uniqueUrls = [...new Set(allUrls)]
  const duplicateCount = allUrls.length - uniqueUrls.length

  if (uniqueUrls.length === 0) {
    return {
      status: 'invalid_input',
      message: 'No valid webhook URLs provided',
    }
  }
  if (uniqueUrls.length > MAX_VALIDATED_WEBHOOKS) {
    return {
      status: 'invalid_input',
      message: `Too many webhook URLs. Maximum allowed is ${MAX_VALIDATED_WEBHOOKS}`,
    }
  }

  const urls = await Promise.all(
    uniqueUrls.map(async (url) => ({
      url,
      ...(await validateWebhook(url, deps.logger)),
    })),
  )
  const valid = urls.every((result) => result.valid)
  const duplicateNote =
    duplicateCount > 0
      ? ` (${plural(duplicateCount, 'duplicate URL')} removed)`
      : ''

  return {
    status: 'validated',
    result: {
      success: true,
      valid,
      urls,
      duplicateCount: duplicateCount > 0 ? duplicateCount : undefined,
      message: valid
        ? `Successfully validated ${plural(urls.length, 'webhook')}${duplicateNote}`
        : 'One or more webhooks failed validation',
    },
  }
}
