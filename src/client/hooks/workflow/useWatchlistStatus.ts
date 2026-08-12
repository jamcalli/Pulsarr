import { useSystemStatusEvent } from '@/hooks/useSystemStatus'

/**
 * Tracks the watchlist workflow status from the progress stream.
 *
 * @returns An object containing `status`, `syncMode`, and `rssAvailable`.
 */
export function useWatchlistStatus() {
  const metadata = useSystemStatusEvent('watchlist-workflow-status')?.metadata

  const status = metadata && 'status' in metadata ? metadata.status : 'unknown'
  const syncMode =
    metadata && 'syncMode' in metadata ? metadata.syncMode : 'polling'
  const rssAvailable =
    metadata && 'rssAvailable' in metadata ? metadata.rssAvailable : false

  return { status, syncMode, rssAvailable }
}
