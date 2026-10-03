import { type SyncStatus, syncStatusFrom } from '@/lib/sync-status'
import { useProgressStore } from '@/stores/progressStore'

export function useSyncStatus(): SyncStatus {
  const event = useProgressStore(
    (state) => state.systemStatusCache['watchlist-workflow-status'],
  )
  return syncStatusFrom(event)
}
