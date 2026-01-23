export type AppriseMessageType = 'info' | 'success' | 'warning' | 'failure'

export type AppriseNotifyFormat = 'text' | 'html' | 'markdown'

/**
 * Schema format map: maps Apprise URL schemas (e.g., 'pover', 'tgram') to their native format.
 */
export type AppriseSchemaFormatMap = Map<string, AppriseNotifyFormat>

/**
 * Response structure from Apprise /details endpoint.
 */
export interface AppriseDetailsResponse {
  schemas: Array<{
    service_name: string
    protocols?: string[]
    secure_protocols?: string[]
    details?: {
      args?: {
        format?: {
          name: string
          type: string
          values: string[]
          default: AppriseNotifyFormat
        }
      }
    }
  }>
}

/**
 * URL format info after parsing and lookup.
 */
export interface AppriseUrlFormatInfo {
  url: string
  schema: string
  format: AppriseNotifyFormat
  /** Whether this service displays attachments inline (false for email services) */
  supportsInlineAttachment: boolean
}

/**
 * Batch of URLs grouped by format and attachment support for sending.
 */
export interface AppriseNotificationBatch {
  urls: string[]
  body: string
  format: 'text' | 'html'
  /** Whether to include attachment field for this batch */
  includeAttachment: boolean
}

export interface AppriseNotification {
  title: string
  body: string
  type?: AppriseMessageType
  tag?: string
  format?: AppriseNotifyFormat
  // HTML formatted body - used alongside text body for services that support HTML
  body_html?: string
  // URL(s) to fetch and attach to the notification (e.g., poster images)
  // Apprise API will fetch the URL and send as attachment for services that support it
  attachment?: string | string[]
  // Application icon URL
  attach_url?: string
  // Additional attributes for specific notification systems
  [key: string]: unknown
}
