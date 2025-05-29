import type { User } from './config.types.js'

export interface TautulliConfig {
  url: string
  apiKey: string
  enabled: boolean
}

export interface TautulliMetadata {
  rating_key: string
  title: string
  year?: number
  summary?: string
  tagline?: string
  thumb?: string
  art?: string
  banner?: string
  media_type: 'movie' | 'show' | 'season' | 'episode'
  originally_available_at?: string
  added_at?: number
  updated_at?: number
  guid?: string
  guids?: Array<{ id: string }>
  grandparent_title?: string // For episodes
  parent_title?: string // For episodes (season)
}

export interface TautulliNotifier {
  id: number
  agent_id: string
  agent_name: string
  friendly_name: string
  config: Record<string, unknown>
}

export interface TautulliNotificationRequest {
  notifier_id: number
  subject: string
  body: string
  poster_url?: string
  rating_key?: string
  headers?: Record<string, string>
}

export interface TautulliApiResponse<T = unknown> {
  response: {
    result: 'success' | 'error'
    message?: string
    data?: T
  }
}

export interface TautulliNotificationHistory {
  id: number
  userId: number
  mediaType: string
  ratingKey: string
  title: string
  notificationType: string
  success: boolean
  errorMessage?: string
  notifiedAt: Date
}

export interface TautulliUser extends User {
  tautulliNotifierId?: number | null
  tautulliNotificationsEnabled?: boolean
}
