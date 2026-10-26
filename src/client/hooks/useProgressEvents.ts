import type { ProgressEvent } from '@root/types/progress.types.js'
import { useEffect } from 'react'
import { useProgressStore } from '@/stores/progressStore'

/** Calls `onEvent` for every event of `type` on the progress stream, so it must be referentially stable. */
export function useProgressEvents(
  type: ProgressEvent['type'],
  onEvent: (event: ProgressEvent) => unknown,
): void {
  const subscribeToType = useProgressStore((state) => state.subscribeToType)

  useEffect(
    () => subscribeToType(type, (event) => void onEvent(event)),
    [subscribeToType, type, onEvent],
  )
}
