import { useMutation } from '@tanstack/react-query'
import { updateConfig, useConfig } from '@/hooks/useConfig'
import { useMinLoadingMutation } from '@/hooks/useMinLoading'
import type { SyncAction } from '@/lib/sync-status'
import { $api, mutationErrorMessage } from '@/lib/tanstackApi'

export type SyncControls = ReturnType<typeof useSyncControls>

export function useSyncControls() {
  const { config } = useConfig()
  const start = useMinLoadingMutation(
    $api.useMutation('post', '/v1/watchlist-workflow/start'),
  )
  const stop = useMinLoadingMutation(
    $api.useMutation('post', '/v1/watchlist-workflow/stop'),
  )
  const autoStart = useMinLoadingMutation(
    useMutation({
      mutationFn: (enabled: boolean) => updateConfig({ _isReady: enabled }),
    }),
  )

  const run = (action: SyncAction) => {
    start.reset()
    stop.reset()
    if (action === 'start') start.mutate({ body: {} })
    else stop.mutate({})
  }

  const isToggling = start.isPending || stop.isPending
  const toggleErrorMessage = isToggling
    ? null
    : start.error
      ? mutationErrorMessage(start.error, 'Sync failed to start. Try again.')
      : stop.error
        ? mutationErrorMessage(stop.error, 'Sync failed to stop. Try again.')
        : null
  const autoStartErrorMessage =
    autoStart.isPending || !autoStart.error
      ? null
      : mutationErrorMessage(
          autoStart.error,
          'Auto-start was not saved. Try again.',
        )

  return {
    run,
    isToggling,
    toggleErrorMessage,
    autoStartEnabled: autoStart.isPending
      ? (autoStart.variables ?? false)
      : (config?._isReady ?? false),
    autoStartReady: config !== null,
    setAutoStart: (enabled: boolean) => autoStart.mutate(enabled),
    isSavingAutoStart: autoStart.isPending,
    autoStartErrorMessage,
  }
}
