import type { User } from '@root/types/config.types.js'

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

/**
 * DB-projected user shape (snake_case aligns with DB columns).
 * Prefer TautulliUser for camelCase domain usage.
 */
export interface TautulliEnabledUser {
  id: number
  username: string
  tautulli_notifier_id: number | null
}

export interface PendingNotification {
  guid: string
  mediaType: 'movie' | 'show' | 'episode'
  watchlistItemId: number
  watchlistItemKey?: string // Plex key used for matching movies/shows/episodes
  interestedUsers: Array<{
    userId: number
    username: string
    notifierId: number
  }>
  title: string
  seasonNumber?: number
  episodeNumber?: number
  addedAt: number // timestamp
  attempts: number
  maxAttempts: number
}

export interface RecentlyAddedItem {
  media_type: 'movie' | 'show' | 'season' | 'episode'
  rating_key: string
  parent_rating_key?: string
  grandparent_rating_key?: string
  title: string
  parent_title?: string
  grandparent_title?: string
  guid?: string // Single GUID from Tautulli
  guids: string[] // Array of GUIDs (often empty)
  section_id: number
  library_name: string
  added_at: string
  media_index?: string // Episode number as string
  parent_media_index?: string // Season number as string
  season?: number // Deprecated, use parent_media_index
  episode?: number // Deprecated, use media_index
}
