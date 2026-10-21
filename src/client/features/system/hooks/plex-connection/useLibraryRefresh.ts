import { useState } from 'react'
import {
  type RefreshRow,
  refreshRows,
  setUpNames,
} from '@/features/system/lib/plex-connection/library-refresh'
import { withMinDuration } from '@/hooks/useMinLoading'
import { useOperation } from '@/hooks/useOperation'
import { NAV_PAGES } from '@/lib/navigation'
import { plexConnectionKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, apiFetch, latestErrorMessage } from '@/lib/tanstackApi'

async function setUp() {
  const { data, error } = await apiFetch.POST(
    '/v1/plex/configure-notifications',
    { body: {} },
  )
  if (error) throw error
  return data
}

async function remove() {
  const { data, error } = await apiFetch.DELETE('/v1/plex/remove-notifications')
  if (error) throw error
  return data
}

function invalidateStatus() {
  return queryClient.invalidateQueries({
    queryKey: plexConnectionKeys.notificationStatus,
  })
}

/** Set up sends no connection, so the server uses the saved Plex server and the linked token. */
export function useLibraryRefresh(configured: {
  radarr: Set<number>
  sonarr: Set<number>
}) {
  const hasInstances = configured.radarr.size + configured.sonarr.size > 0
  const status = $api.useQuery(
    'get',
    '/v1/plex/notification-status',
    undefined,
    { enabled: hasInstances },
  )
  const setup = useOperation({
    key: ['plex-connection', 'refresh-setup'],
    mutationFn: () => withMinDuration(setUp()),
    meta: { label: 'Library refresh setup', page: NAV_PAGES.plexConnection },
    errorFallback: 'Library refresh was not set up. Try again.',
    onSettled: () => void invalidateStatus(),
  })
  const removal = useOperation({
    key: ['plex-connection', 'refresh-remove'],
    mutationFn: () => withMinDuration(remove()),
    meta: { label: 'Library refresh removal', page: NAV_PAGES.plexConnection },
    errorFallback: 'Library refresh was not removed. Try again.',
    onSettled: () => void invalidateStatus(),
  })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const latest = [
    setup.result && { source: 'setup' as const, ...setup.result },
    removal.result && { source: 'remove' as const, ...removal.result },
  ]
    .filter((run) => run !== null)
    .sort((a, b) => b.ranAt - a.ranAt)[0]
  const rows: RefreshRow[] | null = latest
    ? refreshRows(latest.data.results, latest.source, configured)
    : status.data
      ? refreshRows(status.data.results, 'status', configured)
      : null

  return {
    setUp: () => setup.run(),
    hasInstances,
    rows,
    setUpNames: setUpNames(rows ?? []),
    ranAt: latest?.ranAt ?? null,
    statusError: latestErrorMessage(
      status,
      "Couldn't read which instances have it.",
    ),
    retryStatus: () => void status.refetch(),
    running: setup.running || removal.running,
    setupRunning: setup.running,
    removeRunning: removal.running,
    errorMessage: setup.errorMessage ?? removal.errorMessage,
    confirmOpen,
    setConfirmOpen,
    remove: () => {
      setConfirmOpen(false)
      removal.run()
    },
  }
}
