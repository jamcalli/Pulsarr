export type WorkflowMetadata = {
  syncMode: 'manual' | 'rss'
  rssAvailable: boolean
}

export type ApprovalMetadata = {
  action: 'created' | 'updated' | 'approved' | 'rejected' | 'deleted'
  requestId: number
  userId: number
  userName: string
  contentTitle: string
  contentType: 'movie' | 'show'
  status: 'pending' | 'approved' | 'rejected' | 'expired'
}

export type LogMetadata = {
  module?: string
  requestId?: string
  userId?: number
  [key: string]: unknown
}

export type ProgressMetadata =
  | WorkflowMetadata
  | ApprovalMetadata
  | Record<string, never>

export interface ProgressEvent {
  operationId: string
  type:
    | 'self-watchlist'
    | 'others-watchlist'
    | 'rss-feed'
    | 'system'
    | 'sync'
    | 'sonarr-tagging'
    | 'radarr-tagging'
    | 'sonarr-tag-removal'
    | 'radarr-tag-removal'
    | 'plex-label-sync'
    | 'plex-label-removal'
    | 'approval'
  phase: string
  progress: number
  message: string
  metadata?: ProgressMetadata
}

export interface LogEvent {
  timestamp: string
  level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' // Excludes 'silent' - not useful for streaming
  message: string
  metadata?: LogMetadata
}

export type StreamEvent =
  | ({ eventType: 'progress' } & ProgressEvent)
  | ({ eventType: 'log' } & LogEvent)

export interface EventStreamService {
  emitProgress(event: ProgressEvent): void
  emitLog(event: LogEvent): void
  hasActiveConnections(): boolean
}

// Legacy interface for backward compatibility
export interface ProgressService {
  emit(event: ProgressEvent): void
  hasActiveConnections(): boolean
}

export interface ProgressOptions {
  progress: ProgressService
  operationId: string
  /** must match one of the ProgressEvent.type values */
  type: ProgressEvent['type']
}
