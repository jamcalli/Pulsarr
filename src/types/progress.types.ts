export interface ProgressEvent {
  operationId: string
  type: 'self-watchlist' | 'others-watchlist' | 'rss-feed'
  phase: string
  progress: number
  message: string
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
