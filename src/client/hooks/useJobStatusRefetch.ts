import type { ProgressEvent } from '@root/types/progress.types'
import { useEffect } from 'react'
import {
  isSettledJobEvent,
  type JobEventFilter,
  progressStream,
} from '@/lib/background-job'

/** Refetches a background job's status after each of its settled events and each stream reconnect, so arguments must be referentially stable. */
export function useJobStatusRefetch(
  eventType: ProgressEvent['type'],
  refetch: () => unknown,
  isJobEvent?: JobEventFilter,
): void {
  useEffect(() => {
    const unsubscribers = [
      progressStream.onEvent(eventType, (event) => {
        if (isSettledJobEvent(event, isJobEvent)) void refetch()
      }),
      progressStream.onReconnect(() => void refetch()),
    ]
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [eventType, refetch, isJobEvent])
}
