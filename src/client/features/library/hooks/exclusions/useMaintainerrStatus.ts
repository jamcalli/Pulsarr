import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { invalidateExclusionItems } from '@/features/library/hooks/exclusions/useExclusionItems'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { watchlistExclusionKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, apiFetch, mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

const RECONCILE_POLL_MS = 2000
// the reconcile runs in the background with no in-flight flag, and 20s covers its 15s fetch timeout
const RECONCILE_POLL_WINDOW_MS = 20_000

async function syncMaintainerr() {
  const { data, error } = await apiFetch.POST(
    '/v1/notifications/maintainerr/sync',
  )
  if (error) throw error
  return data
}

/** Polls the status for a while after the saved URL or switch changes and after Sync now. */
export function useMaintainerrStatus(config: Config) {
  const [pollUntil, setPollUntil] = useState<number | null>(null)
  const status = $api.useQuery(
    'get',
    '/v1/notifications/maintainerr/status',
    undefined,
    {
      refetchInterval: () =>
        pollUntil !== null && Date.now() < pollUntil
          ? RECONCILE_POLL_MS
          : false,
    },
  )

  const reconcileKey = `${config.maintainerrEnabled}#${config.maintainerrUrl ?? ''}`
  const lastKey = useRef(reconcileKey)
  useEffect(() => {
    if (lastKey.current === reconcileKey) return
    lastKey.current = reconcileKey
    setPollUntil(Date.now() + RECONCILE_POLL_WINDOW_MS)
    void queryClient.invalidateQueries({
      queryKey: watchlistExclusionKeys.maintainerrStatus,
    })
  }, [reconcileKey])

  const sync = useMinLoadingMutation(
    useMutation({
      mutationFn: () => withMinDuration(syncMaintainerr()),
      onSuccess: (data) => {
        queryClient.setQueryData(watchlistExclusionKeys.maintainerrStatus, data)
        setPollUntil(Date.now() + RECONCILE_POLL_WINDOW_MS)
        return invalidateExclusionItems()
      },
    }),
  )

  return {
    result: status.data?.result ?? null,
    sync: () => sync.mutate(),
    syncing: sync.isPending,
    syncError: sync.isError
      ? mutationErrorMessage(sync.error, 'Maintainerr did not sync. Try again.')
      : null,
  }
}
