import type {
  AppriseNotificationBatch,
  AppriseSchemaFormatMap,
} from '@root/types/apprise.types.js'
import type {
  AppriseMessage,
  DeliveryResult,
  NotificationTestOutcome,
} from '@root/types/notification.types.js'
import { resolveAppriseUrls } from '@root/utils/notifications/apprise-email.js'
import type { FastifyBaseLogger } from 'fastify'
import { createTestAppriseMessage } from '../templates/apprise-html.js'
import {
  analyzeAppriseUrls,
  appriseEndpoint,
  createNotificationBatches,
} from './apprise-format-cache.js'
import { postJson } from './http.js'

export interface AppriseDeps {
  logger: FastifyBaseLogger
  config: {
    appriseUrl?: string
    enableApprise?: boolean
    appriseEmailSender?: string
  }
  schemaFormatCache?: AppriseSchemaFormatMap
}

const APPRISE_TIMEOUT_MS = 10_000

function toBatches(
  urls: string,
  message: AppriseMessage,
  schemaFormatCache: AppriseSchemaFormatMap | undefined,
): AppriseNotificationBatch[] {
  if (!schemaFormatCache || schemaFormatCache.size === 0) {
    return [
      {
        urls: [urls],
        body: message.bodyHtml,
        format: 'html',
        includeAttachment: true,
      },
    ]
  }

  return createNotificationBatches(
    analyzeAppriseUrls(urls, schemaFormatCache),
    message.bodyHtml,
    message.body,
  )
}

interface AppriseErrorBody {
  details?: Array<[string, string, string]>
}

const REPORTED_DETAIL_LEVELS = new Set(['WARNING', 'ERROR'])

async function appriseFailureReason(response: Response): Promise<string> {
  const body = (await response
    .json()
    .catch(() => null)) as AppriseErrorBody | null
  const details = body?.details
  const messages = Array.isArray(details)
    ? details
        .filter(([level]) => REPORTED_DETAIL_LEVELS.has(level))
        .map(([, , message]) => message)
    : []
  return messages.length > 0
    ? `${response.status} ${messages.join('; ')}`
    : `${response.status} ${response.statusText}`
}

function postBatch(
  appriseUrl: string,
  batch: AppriseNotificationBatch,
  message: AppriseMessage,
  retry: boolean,
): Promise<DeliveryResult> {
  // Email services render the poster from the HTML body, so their batches drop the attachment
  const attachment = batch.includeAttachment ? message.attachment : undefined
  return postJson(
    appriseEndpoint(appriseUrl, 'notify'),
    {
      urls: batch.urls.join(','),
      title: message.title,
      type: message.type,
      attachment,
      body: batch.body,
      format: batch.format,
    },
    {
      timeoutMs: APPRISE_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
      retry,
      failureReason: appriseFailureReason,
    },
  )
}

/** `target` is a comma-separated list of Apprise URLs or plain emails. Delivered when any batch was. */
export async function sendNotification(
  target: string | null | undefined,
  message: AppriseMessage,
  deps: AppriseDeps,
  retry = true,
): Promise<DeliveryResult> {
  const { logger, config } = deps
  if (!config.appriseUrl) {
    return { ok: false, reason: 'Apprise server URL not configured' }
  }
  if (!config.enableApprise) return { ok: false, reason: 'Apprise disabled' }

  const urls = resolveAppriseUrls(target ?? '', config.appriseEmailSender)
  if (!urls) return { ok: false, reason: 'no Apprise URL' }

  const batches = toBatches(urls, message, deps.schemaFormatCache)
  const appriseUrl = config.appriseUrl
  const results = await Promise.all(
    batches.map((batch) => postBatch(appriseUrl, batch, message, retry)),
  )
  const reasons = results.flatMap((result) =>
    result.ok ? [] : [result.reason],
  )

  if (reasons.length === 0) {
    logger.debug(
      { batchCount: batches.length },
      `Apprise notification "${message.title}" sent`,
    )
    return { ok: true }
  }

  const partial = reasons.length < batches.length
  logger[partial ? 'warn' : 'debug'](
    { batchCount: batches.length, reasons },
    `Apprise notification "${message.title}" failed`,
  )
  return partial ? { ok: true } : { ok: false, reason: reasons.join('; ') }
}

export async function testNotification(
  targetUrl: string,
  deps: AppriseDeps,
): Promise<NotificationTestOutcome> {
  const { config } = deps
  if (!config.appriseUrl) {
    return {
      success: false,
      error: 'Apprise is not set up. Add the Apprise server URL first.',
    }
  }
  if (!config.enableApprise) {
    return {
      success: false,
      error:
        'Apprise is not enabled because Pulsarr could not reach the Apprise server.',
    }
  }
  if (!resolveAppriseUrls(targetUrl, config.appriseEmailSender)) {
    return {
      success: false,
      error:
        'This is not a valid Apprise URL. A plain email address needs an email sender set in the Apprise settings.',
    }
  }

  const result = await sendNotification(
    targetUrl,
    createTestAppriseMessage(),
    deps,
    false,
  )
  return result.ok
    ? { success: true }
    : {
        success: false,
        error:
          'Apprise did not deliver the test notification. Check the URL and the Apprise server logs.',
      }
}

export async function pingAppriseServer(url: string): Promise<boolean> {
  if (!url || url.trim() === '') {
    return false
  }
  try {
    const response = await fetch(appriseEndpoint(url, ''), {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}
