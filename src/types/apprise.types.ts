export type AppriseMessageType = 'info' | 'success' | 'warning' | 'failure'

export type AppriseNotifyFormat = 'text' | 'html' | 'markdown'

export type AppriseSchemaFormatMap = Map<string, AppriseNotifyFormat>

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

export interface AppriseUrlFormatInfo {
  url: string
  schema: string
  format: AppriseNotifyFormat
  /** Whether this service displays attachments inline (false for email services) */
  supportsInlineAttachment: boolean
}

export interface AppriseNotificationBatch {
  urls: string[]
  body: string
  format: 'text' | 'html'
  includeAttachment: boolean
}
