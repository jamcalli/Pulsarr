export interface ProgressEvent {
  operationId: string
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
}
