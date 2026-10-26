import { formatCount, pluralize } from '@/lib/format'
import type { SyncState } from '@/lib/sync-status'

const SYNC_SENTENCES: Record<SyncState, string> = {
  running: 'Watchlist sync is running.',
  starting: 'Watchlist sync is starting.',
  stopping: 'Watchlist sync is stopping.',
  stopped: 'Watchlist sync is stopped.',
}

export function statusLine(
  syncState: SyncState | null,
  pendingCount: number,
): string {
  const sync = syncState
    ? SYNC_SENTENCES[syncState]
    : 'Checking watchlist sync.'
  const approvals =
    pendingCount === 0
      ? 'Nothing is waiting on you.'
      : `${formatCount(pendingCount, 'request')} ${pluralize(pendingCount, 'needs', 'need')} your approval.`
  return `${sync} ${approvals}`
}
