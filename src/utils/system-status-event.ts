import type {
  ProgressEvent,
  ProgressMetadata,
} from '@root/types/progress.types.js'

type StatusMetadata = Extract<ProgressMetadata, { status: string }>

export function systemStatusEvent(
  operationId: string,
  label: string,
  metadata: StatusMetadata,
): ProgressEvent {
  return {
    operationId,
    type: 'system',
    phase: 'info',
    progress: 100,
    message: `${label}: ${metadata.status}`,
    metadata,
  }
}
