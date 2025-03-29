export type AppriseMessageType = 'info' | 'success' | 'warning' | 'failure'

export interface AppriseNotification {
  title: string
  body: string
  type?: AppriseMessageType
  tag?: string
  format?: 'text' | 'html' | 'markdown'
  // Additional attributes for specific notification systems
  [key: string]: unknown
}
