import type { WatchlistSyncType } from '@root/types/progress.types'
import { SeparatedList, SeparatedListRow } from '@/components/separated-list'
import { SyncStepProgress } from '@/components/sync-step-progress'
import { ItemContent, ItemTitle } from '@/components/ui/item'
import { useWatchlistSyncEvents } from '@/hooks/useWatchlistSyncEvents'
import { WATCHLIST_SYNC_LABELS } from '@/lib/sync-progress'
import { isSyncActive } from '@/lib/watchlist-sync'

const SYNC_TYPES = [
  'self-watchlist',
  'others-watchlist',
] as const satisfies readonly WatchlistSyncType[]

/** A progress row for each watchlist sync running on the server, nothing while none is. */
export function WatchlistSyncSteps() {
  const events = useWatchlistSyncEvents()
  const active = SYNC_TYPES.filter((type) => isSyncActive(events[type]))

  if (active.length === 0) return null
  return (
    <SeparatedList label="Watchlist syncs">
      {active.map((type) => (
        <SeparatedListRow key={type}>
          <ItemContent>
            <ItemTitle>{WATCHLIST_SYNC_LABELS[type]}</ItemTitle>
            <SyncStepProgress type={type} />
          </ItemContent>
        </SeparatedListRow>
      ))}
    </SeparatedList>
  )
}
