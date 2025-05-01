export type WorkflowMetadata = {
  syncMode: 'manual' | 'rss'
  rssAvailable: boolean
}

export type ProgressMetadata = WorkflowMetadata | Record<string, never>

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
  phase: string
  progress: number
  message: string
  metadata?: ProgressMetadata
}

export interface ProgressService {
  emit(event: ProgressEvent): void
  hasActiveConnections(): boolean
}

export interface ProgressOptions {
  progress: ProgressService
  operationId: string
  type: 'self-watchlist' | 'others-watchlist' | 'rss-feed'
}
