import { useEffect } from 'react'
import { useProgressStore } from '@/stores/progressStore'

/** Calls `onEvent` for every approval event on the progress stream, so it must be referentially stable. */
export function useApprovalEvents(onEvent: () => unknown): void {
  const subscribeToType = useProgressStore((state) => state.subscribeToType)

  useEffect(
    () => subscribeToType('approval', () => void onEvent()),
    [subscribeToType, onEvent],
  )
}
