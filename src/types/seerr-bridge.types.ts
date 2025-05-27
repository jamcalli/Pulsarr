// SeerrBridge Integration Types

export interface SeerrBridgeConfig {
  enabled: boolean
  baseUrl: string
  webhookUrl: string
  apiKey?: string
  timeoutMs?: number
}

// Outgoing webhook payload (Pulsarr → SeerrBridge)
export interface SeerrBridgeWebhookPayload {
  notification_type: 'media.requested' | 'test'
  event: 'media.requested' | 'test'
  subject: string
  media: {
    media_type: 'movie' | 'tv'
    tmdbId: number
    status: string
  }
  request: {
    request_id: string
  }
  metadata?: {
    userId?: number
    userName?: string
    title?: string
    year?: number
  }
}

// Expected response from SeerrBridge
export interface SeerrBridgeWebhookResponse {
  status: 'success' | 'error'
  message: string
  media?: {
    title: string
    year: number
    imdb_id: string
  }
}

// Incoming webhook payload (SeerrBridge → Pulsarr)
export interface SeerrBridgeCompletionPayload {
  id: number | string
  media: {
    id: number
    tmdbId: number
  }
  status: 'available' | 'partially_available' | 'failed'
  mediaType: 'movie' | 'tv'
  title?: string
  year?: number
  imdbId?: string
  error?: string
}

// Request tracking for matching completions to users
export interface SeerrBridgeRequest {
  id: string
  requestId: string
  userId: number
  userName: string
  tmdbId: number
  mediaType: 'movie' | 'tv'
  title: string
  year?: number
  requestedAt: Date
  status: 'pending' | 'processing' | 'completed' | 'failed'
  completedAt?: Date
  error?: string
}

// Service response types
export interface SeerrBridgeResponse {
  success: boolean
  message: string
  requestId?: string
  error?: string
}
