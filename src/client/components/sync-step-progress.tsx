import type { WatchlistSyncType } from '@root/types/progress.types'
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress'
import { useWatchlistSyncEvents } from '@/hooks/useWatchlistSyncEvents'
import { formatSyncProgress } from '@/lib/sync-progress'
import { isSyncActive } from '@/lib/watchlist-sync'

export function SyncStepProgress({ type }: { type: WatchlistSyncType }) {
  const cached = useWatchlistSyncEvents()[type]
  const event = isSyncActive(cached) ? cached : undefined
  const progress = event?.progress ?? 0
  const valueText = formatSyncProgress(progress, event?.metadata)

  return (
    <Progress
      value={progress}
      getAriaValueText={() => valueText}
      className="gap-x-3 gap-y-1 text-xs"
    >
      <ProgressLabel className="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground">
        {event?.message || 'Starting'}
      </ProgressLabel>
      <ProgressValue className="text-xs">{() => valueText}</ProgressValue>
    </Progress>
  )
}
