/**
 * Apprise Format Cache
 *
 * Fetches and caches schema format information from the Apprise /details endpoint.
 * Used to determine whether to send HTML or text body to each notification target.
 */

import type {
  AppriseDetailsResponse,
  AppriseNotificationBatch,
  AppriseNotifyFormat,
  AppriseSchemaFormatMap,
  AppriseUrlFormatInfo,
} from '@root/types/apprise.types.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Fetches schema format map from Apprise /details endpoint.
 * Maps each protocol (e.g., 'pover', 'tgram', 'slack') to its native format.
 */
export async function fetchSchemaFormats(
  appriseUrl: string,
  log: FastifyBaseLogger,
): Promise<AppriseSchemaFormatMap> {
  const formatMap: AppriseSchemaFormatMap = new Map()

  try {
    const url = new URL('/details/', appriseUrl)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    let response: Response
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      log.warn(
        { status: response.status },
        'Failed to fetch Apprise schema details, will use text fallback for unknown schemas',
      )
      return formatMap
    }

    const details = (await response.json()) as AppriseDetailsResponse

    for (const schema of details.schemas) {
      const format: AppriseNotifyFormat =
        schema.details?.args?.format?.default ?? 'text'

      // Map both protocols and secure_protocols to format
      for (const protocol of schema.protocols ?? []) {
        formatMap.set(protocol.toLowerCase(), format)
      }
      for (const protocol of schema.secure_protocols ?? []) {
        formatMap.set(protocol.toLowerCase(), format)
      }
    }

    log.info(
      { schemaCount: formatMap.size },
      'Cached Apprise schema formats from /details endpoint',
    )
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Error fetching Apprise schema details, will use text fallback for unknown schemas',
    )
  }

  return formatMap
}

/**
 * Schema format overrides for services that report incorrect native formats.
 *
 * Telegram reports as HTML-native via Apprise /details, but only supports a tiny
 * subset of HTML tags (<b>, <i>, <a>, <code>, <pre>). Full HTML with <div>, <p>,
 * <hr>, etc. causes Telegram API errors. Force text format for these schemas.
 *
 * Add entries here if other services exhibit similar format misreporting issues.
 * The override takes precedence over the format reported by Apprise /details.
 */
const SCHEMA_FORMAT_OVERRIDES: Record<string, 'text' | 'html' | 'markdown'> = {
  tgram: 'text',
}

/**
 * Schemas that deliver notifications via email.
 *
 * Email services already render images via <img> tags in the HTML body.
 * Sending attachments to these services results in redundant file attachments
 * rather than inline images. We exclude the attachment field for these schemas.
 */
const EMAIL_SCHEMAS = new Set([
  // SMTP direct
  'mailto',
  'mailtos',
  // Email API services
  'brevo',
  'mailgun',
  'sendgrid',
  'sendpulse',
  'ses',
  'smtp2go',
  'sparkpost',
])

/**
 * Extracts schema from Apprise URL using same logic as Apprise's parse_url().
 * Regex matches: one or more characters that are NOT colon or whitespace, before ://
 *
 * @see https://github.com/caronc/apprise/blob/master/apprise/utils/parse.py
 */
export function extractSchema(url: string): string | null {
  const match = url.match(/^([^:\s]+):\/\//)
  return match ? match[1].toLowerCase().trim() : null
}

/**
 * Analyzes Apprise URLs and determines their native format and attachment support.
 * Handles comma-separated URLs.
 */
export function analyzeAppriseUrls(
  urlString: string,
  formatCache: AppriseSchemaFormatMap,
): AppriseUrlFormatInfo[] {
  return urlString
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => {
      const schema = extractSchema(url)
      // Check for schema overrides first (e.g., tgram → text)
      const override = schema ? SCHEMA_FORMAT_OVERRIDES[schema] : undefined
      // Email services render images via <img> tags, attachments are redundant
      const supportsInlineAttachment = !schema || !EMAIL_SCHEMAS.has(schema)
      return {
        url,
        schema: schema ?? 'unknown',
        format:
          override ?? (schema ? (formatCache.get(schema) ?? 'text') : 'text'),
        supportsInlineAttachment,
      }
    })
}

/**
 * Groups URLs by format and attachment support, creating batches for sending.
 * Returns up to 4 batches based on format (text/html) and attachment support.
 */
export function createNotificationBatches(
  urls: AppriseUrlFormatInfo[],
  htmlBody: string,
  textBody: string,
): AppriseNotificationBatch[] {
  // Group URLs by format and attachment support
  // Markdown targets get text (Apprise handles conversion)
  const textWithAttachment = urls.filter(
    (u) =>
      (u.format === 'text' || u.format === 'markdown') &&
      u.supportsInlineAttachment,
  )
  const textNoAttachment = urls.filter(
    (u) =>
      (u.format === 'text' || u.format === 'markdown') &&
      !u.supportsInlineAttachment,
  )
  const htmlWithAttachment = urls.filter(
    (u) => u.format === 'html' && u.supportsInlineAttachment,
  )
  const htmlNoAttachment = urls.filter(
    (u) => u.format === 'html' && !u.supportsInlineAttachment,
  )

  const batches: AppriseNotificationBatch[] = []

  if (textWithAttachment.length > 0) {
    batches.push({
      urls: textWithAttachment.map((u) => u.url),
      body: textBody,
      format: 'text',
      includeAttachment: true,
    })
  }

  if (textNoAttachment.length > 0) {
    batches.push({
      urls: textNoAttachment.map((u) => u.url),
      body: textBody,
      format: 'text',
      includeAttachment: false,
    })
  }

  if (htmlWithAttachment.length > 0) {
    batches.push({
      urls: htmlWithAttachment.map((u) => u.url),
      body: htmlBody,
      format: 'html',
      includeAttachment: true,
    })
  }

  if (htmlNoAttachment.length > 0) {
    batches.push({
      urls: htmlNoAttachment.map((u) => u.url),
      body: htmlBody,
      format: 'html',
      includeAttachment: false,
    })
  }

  return batches
}
