import type { ProgressEvent } from '@root/types/progress.types.js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { useProgressEvents } from '@/hooks/useProgressEvents'
import { WATCHLIST_EVENT_COALESCE_MS } from '@/lib/constants'
import {
  dashboardStatsKeys,
  recentRequestsKeys,
  userStatsKeys,
  userWatchlistKeys,
} from '@/lib/query-keys'

/** Refetches the dashboard request queries once per burst of watchlist events, plus `userId`'s watchlist and stats when the burst names them. */
export function useWatchlistEvents(userId?: number): void {
  const queryClient = useQueryClient()
  const pendingUserIds = useRef(new Set<number>())
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const flush = useCallback(() => {
    timer.current = undefined
    const affected = userId !== undefined && pendingUserIds.current.has(userId)
    pendingUserIds.current.clear()
    const queryKeys = [
      recentRequestsKeys.all,
      dashboardStatsKeys.all,
      ...(affected
        ? [userWatchlistKeys.byUser(userId), userStatsKeys.byId(userId)]
        : []),
    ]
    return Promise.all(
      queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
  }, [queryClient, userId])

  useProgressEvents(
    'watchlist',
    useCallback(
      (event: ProgressEvent) => {
        if (event.metadata !== undefined && 'userIds' in event.metadata) {
          for (const id of event.metadata.userIds) {
            pendingUserIds.current.add(id)
          }
        }
        if (timer.current === undefined) {
          timer.current = setTimeout(flush, WATCHLIST_EVENT_COALESCE_MS)
        }
      },
      [flush],
    ),
  )
}
