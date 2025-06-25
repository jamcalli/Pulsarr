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
    | 'approval'
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
