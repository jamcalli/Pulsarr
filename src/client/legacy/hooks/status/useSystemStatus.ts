import type { ProgressEvent } from '@root/types/progress.types.js'
import { useProgressStore } from '@/stores/progressStore'

export function useSystemStatusEvent(
  operationId: string,
): ProgressEvent | undefined {
  return useProgressStore((state) => state.systemStatusCache[operationId])
}

export function useSystemStatus(operationId: string): string {
  const event = useSystemStatusEvent(operationId)
  const metadata = event?.metadata
  return metadata && 'status' in metadata ? metadata.status : 'unknown'
}
