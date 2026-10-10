import {
  cleanupLabelResultRows,
  removeLabelResultRows,
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
import { apiFetch } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

export type LabelActionId = 'cleanup' | 'remove'

const PROGRESS_TARGET = 'Plex'

function operation(label: string): OperationMeta {
  return { label, page: NAV_PAGES.plexLabels }
}

export function useLabelActions(
  saved: components['schemas']['PlexLabelSyncConfig'],
) {
  const cleanup = useOperation({
    key: ['labels', 'cleanup'],
    mutationFn: async () => {
      const { data, error } = await withMinDuration(
        apiFetch.POST('/v1/labels/cleanup'),
      )
      if (error) throw error
      return data
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
      return data
    },
    meta: operation('Label removal'),
    errorFallback: 'Labels were not removed. Try again.',
  })

  const removalProgress = useProgress('plex-label-removal')

  const labelingReason = saved.enabled
    ? null
    : 'Turn on Label content in Plex and save first.'
  const cleanupReason =
    labelingReason ??
    (saved.cleanupOrphanedLabels
      ? null
      : 'Turn on Clean up orphaned labels on sync and save first.')

  const actions: Record<LabelActionId, ActionState> = {
    cleanup: {
      running: cleanup.running,
      unavailableReason: cleanupReason,
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
    anyRunning: cleanup.running || remove.running,
    removedSinceSync:
      remove.result?.data.success && remove.result.data.results.failed === 0,
    run: (id: Exclude<LabelActionId, 'remove'>) => ({ cleanup })[id].run(),
    runRemove: () => remove.run(),
  }
}
