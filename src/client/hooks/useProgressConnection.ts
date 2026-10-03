import { useEffect } from 'react'
import { useProgressStore } from '@/stores/progressStore'

/** Opens the shared progress stream while the caller is mounted. */
export function useProgressConnection(): void {
  const initialize = useProgressStore((state) => state.initialize)
  const cleanup = useProgressStore((state) => state.cleanup)

  useEffect(() => {
    initialize()
    return cleanup
  }, [initialize, cleanup])
}
