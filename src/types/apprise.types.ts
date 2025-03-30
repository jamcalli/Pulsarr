export type AppriseMessageType = 'info' | 'success' | 'warning' | 'failure'

export interface AppriseNotification {
  title: string
  body: string
  type?: AppriseMessageType
  tag?: string
  format?: 'text' | 'html' | 'markdown'
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
