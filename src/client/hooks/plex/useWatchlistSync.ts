import { skipToken, useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { withMinDuration } from '@/hooks/useMinLoading'
import { useOperation } from '@/hooks/useOperation'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { useWatchlistSyncEvents } from '@/hooks/useWatchlistSyncEvents'
import { OPERATION_RESULT_TTL } from '@/lib/constants'
import { invalidateDashboard } from '@/lib/dashboard-invalidation'
import { formatCount } from '@/lib/format'
import { NAV_PAGES, type NavPage } from '@/lib/navigation'
import {
  fetchHasPlexPass,
  generateFeeds,
  invalidateAccount,
  syncWatchlist,
  verifyToken,
} from '@/lib/plex/plex-requests'
import {
  isRunning,
  runSyncSteps,
  type StepActions,
  type SyncKind,
  type SyncRun,
  serverSyncRun,
} from '@/lib/plex/sync-run'
import { plexConnectionKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { mutationErrorMessage } from '@/lib/tanstackApi'

const STEP_FALLBACK = 'Plex did not answer. Try again.'

const STEP_ACTIONS: StepActions = {
  verify: async () => {
    await verifyToken()
    return { status: 'done', detail: null }
  },
  self: async () => {
    const { total } = await syncWatchlist('self-watchlist')
    return { status: 'done', detail: formatCount(total ?? 0, 'item') }
  },
  friends: async () => {
    const { total, friends } = await syncWatchlist('others-watchlist')
    return {
      status: 'done',
      detail: `${formatCount(friends ?? 0, 'friend')}, ${formatCount(total ?? 0, 'item')}`,
    }
  },
  feeds: async () => {
    if (!(await fetchHasPlexPass())) {
      return {
        status: 'skipped',
        reason: 'Needs Plex Pass. Pulsarr polls Plex instead.',
      }
    }
    await generateFeeds()
    return { status: 'done', detail: 'Both feed URLs saved' }
  },
}

function writeRun(run: SyncRun) {
  queryClient.setQueryData<SyncRun>(plexConnectionKeys.syncRun, run)
}

export function clearSyncRun() {
  queryClient.removeQueries({ queryKey: plexConnectionKeys.syncRun })
}

export function useWatchlistSync(options?: { page?: NavPage }) {
  const { data: run = null } = useQuery<SyncRun>({
    queryKey: plexConnectionKeys.syncRun,
    queryFn: skipToken,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: OPERATION_RESULT_TTL,
  })
  const operation = useOperation<SyncKind, SyncRun>({
    key: ['plex-connection', 'sync'],
    mutationFn: async (kind) => {
      const finished = await runSyncSteps({
        kind,
        actions: STEP_ACTIONS,
        report: writeRun,
        errorMessage: (error) => mutationErrorMessage(error, STEP_FALLBACK),
        wait: withMinDuration,
      })
      if (finished.error) throw finished.error
      return finished
    },
    meta: {
      label: 'Watchlist sync',
      page: options?.page ?? NAV_PAGES.plexConnection,
    },
    errorFallback: STEP_FALLBACK,
    onSettled: () => {
      void invalidateAccount()
      void invalidateDashboard()
    },
  })
  const serverRun = serverSyncRun(useWatchlistSyncEvents())
  const serverRunning = serverRun !== null
  const wasServerRunning = useRef(serverRunning)

  useEffect(() => {
    if (wasServerRunning.current && !serverRunning) void invalidateAccount()
    wasServerRunning.current = serverRunning
  }, [serverRunning])

  const starting = useSyncStatus().state === 'starting'
  const localRunning = operation.running || isRunning(run)
  const otherRunning = serverRunning && !localRunning
  const blockedReason = localRunning
    ? null
    : serverRunning
      ? 'A watchlist sync is already running.'
      : starting
        ? 'Pulsarr is starting up. Sync opens once the startup sync finishes.'
        : null

  return {
    run: otherRunning ? serverRun : run,
    running: localRunning || serverRunning || starting,
    /** Why Sync is unavailable when something other than this page holds it, null otherwise. */
    blockedReason,
    start: operation.run,
  }
}
