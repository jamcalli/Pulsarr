import {
  cleanupLabelResultRows,
  removeLabelResultRows,
  syncLabelResultRows,
} from '@/features/users/lib/label-results'
import { withMinDuration } from '@/hooks/useMinLoading'
import { useOperation } from '@/hooks/useOperation'
import { useProgress } from '@/hooks/useProgress'
import {
  type ActionState,
  toActionProgress,
  toActionResult,
} from '@/lib/action-state'
import { NAV_PAGES } from '@/lib/navigation'
import type { OperationMeta } from '@/lib/operation-toasts'
import { apiFetch, requireSuccess } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

export type LabelActionId = 'cleanup' | 'remove'

const PROGRESS_TARGET = 'Plex'

function operation(label: string): OperationMeta {
  return { label, page: NAV_PAGES.plexLabels }
}

export function useLabelActions(
  saved: components['schemas']['PlexLabelSyncConfig'],
) {
  const sync = useOperation({
    key: ['labels', 'sync'],
    mutationFn: async () => {
      const { data, error } = await withMinDuration(
        apiFetch.POST('/v1/labels/sync'),
      )
      if (error) throw error
      return requireSuccess(data)
    },
    meta: operation('Label sync'),
    errorFallback: 'Sync failed. Try again.',
  })
  const cleanup = useOperation({
    key: ['labels', 'cleanup'],
    mutationFn: async () => {
      const { data, error } = await withMinDuration(
        apiFetch.POST('/v1/labels/cleanup'),
      )
      if (error) throw error
      return requireSuccess(data)
    },
    meta: operation('Label cleanup'),
    errorFallback: 'Cleanup failed. Try again.',
  })
  const remove = useOperation({
    key: ['labels', 'remove'],
    mutationFn: async () => {
      const { data, error } = await withMinDuration(
        apiFetch.DELETE('/v1/labels/remove'),
      )
      if (error) throw error
      return requireSuccess(data)
    },
    meta: operation('Label removal'),
    errorFallback: 'Labels were not removed. Try again.',
  })

  const removalProgress = useProgress('plex-label-removal')
  const syncProgress = useProgress('plex-label-sync')

  const labelingReason = saved.enabled
    ? null
    : 'Turn on Label content in Plex and save first.'

  const actions: Record<LabelActionId, ActionState> = {
    cleanup: {
      running: cleanup.running,
      unavailableReason: labelingReason,
      errorMessage: cleanup.errorMessage,
      result: toActionResult(cleanup.result, cleanupLabelResultRows),
    },
    remove: {
      running: remove.running,
      unavailableReason: labelingReason,
      errorMessage: remove.errorMessage,
      result: toActionResult(remove.result, removeLabelResultRows),
      progress: [toActionProgress(PROGRESS_TARGET, removalProgress)],
    },
  }

  return {
    actions,
    anyRunning: sync.running || cleanup.running || remove.running,
    removedSinceSync:
      remove.result !== null &&
      remove.result.data.results.failed === 0 &&
      remove.result.ranAt > (sync.result?.ranAt ?? 0),
    run: (id: Exclude<LabelActionId, 'remove'>) => ({ cleanup })[id].run(),
    runRemove: () => remove.run(),
    syncRun: {
      run: sync.run,
      running: sync.running,
      unavailableReason: labelingReason,
      errorMessage: sync.errorMessage,
      progress: [toActionProgress(PROGRESS_TARGET, syncProgress)],
      result: toActionResult(sync.result, syncLabelResultRows),
    },
  }
}
