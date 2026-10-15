import type {
  ProgressEvent,
  WatchlistSyncMetadata,
} from '@root/types/progress.types'
import { formatCount, formatNumber } from '@/lib/format'

type SyncCountUnit = NonNullable<WatchlistSyncMetadata['count']>['unit']

const SYNC_COUNT_UNITS: Record<SyncCountUnit, [string, string]> = {
  pages: ['page', 'pages'],
  friends: ['friend', 'friends'],
  items: ['item', 'items'],
}

/** Reads "3 of 7 pages" when the event carries a count, else the percent. */
export function formatSyncProgress(
  progress: number,
  metadata: ProgressEvent['metadata'],
): string {
  const count = metadata && 'stage' in metadata ? metadata.count : null
  if (!count) return `${progress}%`
  const [singular, plural] = SYNC_COUNT_UNITS[count.unit]
  return `${formatNumber(count.done)} of ${formatCount(count.total, singular, plural)}`
}
