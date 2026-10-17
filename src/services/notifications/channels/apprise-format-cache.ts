import { splitUrlList } from '@root/schemas/common/url-list.js'
import type {
  AppriseDetailsResponse,
  AppriseNotificationBatch,
  AppriseNotifyFormat,
  AppriseSchemaFormatMap,
  AppriseUrlFormatInfo,
} from '@root/types/apprise.types.js'
import { errorMessage } from '@utils/error-message.js'
import type { FastifyBaseLogger } from 'fastify'

/** Joins path onto the Apprise base URL, keeping any subpath the server is mounted under. */
export function appriseEndpoint(baseUrl: string, path: string): string {
  const url = new URL(baseUrl)
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
  url.search = ''
  url.hash = ''
  return url.toString()
}

export async function fetchSchemaFormats(
  appriseUrl: string,
  log: FastifyBaseLogger,
): Promise<AppriseSchemaFormatMap> {
  const formatMap: AppriseSchemaFormatMap = new Map()

  try {
    const response = await fetch(appriseEndpoint(appriseUrl, 'details/'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

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
      { error: errorMessage(error) },
      'Error fetching Apprise schema details, will use text fallback for unknown schemas',
    )
  }

  return formatMap
}

/** Telegram reports HTML but rejects most tags, so these schemas get text whatever /details says. */
const SCHEMA_FORMAT_OVERRIDES: Record<string, 'text' | 'html' | 'markdown'> = {
  tgram: 'text',
}

const EMAIL_SCHEMAS = new Set([
  'mailto',
  'mailtos',
  'brevo',
  'mailgun',
  'sendgrid',
  'sendpulse',
  'ses',
  'smtp2go',
  'sparkpost',
])

// Matches the schema rule Apprise applies when it parses a notification URL
function extractSchema(url: string): string | null {
  const match = url.match(/^([^:\s]+):\/\//)
  return match ? match[1].toLowerCase().trim() : null
}

export function analyzeAppriseUrls(
  urlString: string,
  formatCache: AppriseSchemaFormatMap,
): AppriseUrlFormatInfo[] {
  return splitUrlList(urlString).map((url) => {
    const schema = extractSchema(url)
    const override = schema ? SCHEMA_FORMAT_OVERRIDES[schema] : undefined
    // Email services render the poster from the HTML body, so an attachment would duplicate it
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

export function createNotificationBatches(
  urls: AppriseUrlFormatInfo[],
  htmlBody: string,
  textBody: string,
): AppriseNotificationBatch[] {
  // Markdown targets get the text body because Apprise converts it
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
