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
}

/**
 * Batch of URLs grouped by format for sending.
 */
export interface AppriseNotificationBatch {
  urls: string[]
  body: string
  format: 'text' | 'html'
}

export interface AppriseNotification {
  title: string
  body: string
  type?: AppriseMessageType
  tag?: string
  format?: AppriseNotifyFormat
  // HTML formatted body - used alongside text body for services that support HTML
  body_html?: string
  // Image URL for thumbnail/attachment
  image?: string
  // Attach the image to the notification (for email and services that support attachments)
  attach?: string
  // Application icon URL
  attach_url?: string
  // Additional attributes for specific notification systems
  [key: string]: unknown
}
