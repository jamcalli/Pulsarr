import type { WatchlistMetadata } from '@root/types/progress.types.js'
import type { FastifyInstance } from 'fastify'

export function emitWatchlistChange(
  progress: FastifyInstance['progress'],
  action: WatchlistMetadata['action'],
  userIds: Iterable<number>,
): void {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return
  progress.emit({
    operationId: `watchlist-${action}`,
    type: 'watchlist',
    phase: action,
    progress: 100,
    message: 'Watchlist changed',
    metadata: { action, userIds: ids },
  })
}
