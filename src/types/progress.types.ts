export type WorkflowMetadata = {
  status: string
  syncMode: 'polling' | 'rss'
  rssAvailable: boolean
}

export type SystemStatusMetadata = {
  status: string
}

export type ApprovalMetadata = {
  action: 'created' | 'updated' | 'approved' | 'rejected' | 'deleted'
  requestId: number
  userId: number
  userName: string
  contentTitle: string
  contentType: 'movie' | 'show'
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved'
}

export type UsersMetadata = {
  action: 'added' | 'removed'
  userId: number
  plexUuid: string | null
}

export type WatchlistMetadata = {
  action: 'added' | 'status'
  userIds: number[]
}

export type WatchlistSyncMetadata = {
  stage:
    | 'finding-friends'
    | 'reading'
    | 'processing'
    | 'rate-limited'
    | 'saving'
    | 'complete'
    | 'failed'
  count: {
    done: number
    total: number
    unit: 'pages' | 'friends' | 'items'
  } | null
}

export type ProgressMetadata =
  | WorkflowMetadata
  | WatchlistSyncMetadata
  | ApprovalMetadata
  | UsersMetadata
  | WatchlistMetadata
  | SystemStatusMetadata
  | Record<string, never>

export interface ProgressEvent {
  operationId: string
  type:
    | 'self-watchlist'
    | 'others-watchlist'
    | 'system'
    | 'sync'
    | 'sonarr-tagging'
    | 'radarr-tagging'
    | 'sonarr-tag-removal'
    | 'radarr-tag-removal'
    | 'plex-label-sync'
    | 'plex-label-removal'
    | 'approval'
    | 'users'
    | 'watchlist'
  phase: string
  progress: number
  message: string
  metadata?: ProgressMetadata
}

export type WatchlistSyncType = Extract<
  ProgressEvent['type'],
  'self-watchlist' | 'others-watchlist'
>

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
