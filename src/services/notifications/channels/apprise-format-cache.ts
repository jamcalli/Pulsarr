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
 * Analyzes Apprise URLs and determines their native format.
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
      return {
        url,
        schema: schema ?? 'unknown',
        format: schema ? (formatCache.get(schema) ?? 'text') : 'text',
      }
    })
}

/**
 * Groups URLs by format and creates batches for sending.
 * Returns at most two batches: one for text-native targets, one for HTML-native targets.
 */
export function createNotificationBatches(
  urls: AppriseUrlFormatInfo[],
  htmlBody: string,
  textBody: string,
): AppriseNotificationBatch[] {
  // Group URLs by format - markdown targets get text (Apprise handles conversion)
  const textUrls = urls.filter(
    (u) => u.format === 'text' || u.format === 'markdown',
  )
  const htmlUrls = urls.filter((u) => u.format === 'html')

  const batches: AppriseNotificationBatch[] = []

  if (textUrls.length > 0) {
    batches.push({
      urls: textUrls.map((u) => u.url),
      body: textBody,
      format: 'text',
    })
  }

  if (htmlUrls.length > 0) {
    batches.push({
      urls: htmlUrls.map((u) => u.url),
      body: htmlBody,
      format: 'html',
    })
  }

  return batches
}
