import type { ActionResultRow } from '@/components/settings/action-results'
import type { ActionProgress } from '@/components/settings/action-row'
import { invalidateTagStatus } from '@/features/users/hooks/user-tags/useTagStatus'
import {
  cleanupResultRows,
  createResultRows,
  removeResultRows,
  syncResultRows,
} from '@/features/users/lib/tag-results'
import { withMinDuration } from '@/hooks/useMinLoading'
import { useOperation } from '@/hooks/useOperation'
import { useProgress } from '@/hooks/useProgress'
import { ARR_TYPE_LABELS } from '@/lib/arr-labels'
import { NAV_PAGES } from '@/lib/navigation'
import type { OperationMeta } from '@/lib/operation-toasts'
import { apiFetch } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

export type TagActionId = 'sync' | 'create' | 'cleanup' | 'remove'

type SavedTagging = Pick<
  components['schemas']['Config'],
  'tagUsersInSonarr' | 'tagUsersInRadarr' | 'cleanupOrphanedTags'
>

interface TagActionState {
  running: boolean
  available: boolean
  errorMessage: string | null
  result: { ranAt: number; rows: ActionResultRow[] } | null
  progress?: ActionProgress[]
}

function toActionProgress(
  name: string,
  { progress, message }: ReturnType<typeof useProgress>,
): ActionProgress {
  return { name, percent: Math.round(progress), message: message || undefined }
}

function resultRows<T>(
  result: { ranAt: number; data: T } | null,
  toRows: (data: T) => ActionResultRow[],
): TagActionState['result'] {
  return result && { ranAt: result.ranAt, rows: toRows(result.data) }
}

function operation(label: string): OperationMeta {
  return { label, page: NAV_PAGES.userTags }
}

export function useTagActions(saved: SavedTagging) {
  const create = useOperation({
    key: ['tags', 'create'],
    mutationFn: async () => {
      const { data, error } = await withMinDuration(
        apiFetch.POST('/v1/tags/create'),
      )
      if (error) throw error
      return data
    },
    onSettled: invalidateTagStatus,
    meta: operation('Tag creation'),
    errorFallback: 'Tags were not created. Try again.',
  })
  const sync = useOperation({
    key: ['tags', 'sync'],
    mutationFn: async () => {
      const { data, error } = await withMinDuration(
        apiFetch.POST('/v1/tags/sync'),
      )
      if (error) throw error
      return data
    },
    onSettled: invalidateTagStatus,
    meta: operation('Tag sync'),
    errorFallback: 'Sync failed. Try again.',
  })
  const cleanup = useOperation({
    key: ['tags', 'cleanup'],
    mutationFn: async () => {
      const { data, error } = await withMinDuration(
        apiFetch.POST('/v1/tags/cleanup'),
      )
      if (error) throw error
      return data
    },
    onSettled: invalidateTagStatus,
    meta: operation('Orphan cleanup'),
    errorFallback: 'Cleanup failed. Try again.',
  })
  const remove = useOperation({
    key: ['tags', 'remove'],
    mutationFn: async (deleteTagDefinitions: boolean) => {
      const { data, error } = await withMinDuration(
        apiFetch.POST('/v1/tags/remove', { body: { deleteTagDefinitions } }),
      )
      if (error) throw error
      return data
    },
    onSettled: invalidateTagStatus,
    meta: operation('Tag removal'),
    errorFallback: 'Tags were not removed. Try again.',
  })

  const sonarrTagging = useProgress('sonarr-tagging')
  const radarrTagging = useProgress('radarr-tagging')
  const sonarrRemoval = useProgress('sonarr-tag-removal')
  const radarrRemoval = useProgress('radarr-tag-removal')

  const targets = [
    {
      name: ARR_TYPE_LABELS.sonarr,
      enabled: saved.tagUsersInSonarr,
      tagging: sonarrTagging,
      removal: sonarrRemoval,
    },
    {
      name: ARR_TYPE_LABELS.radarr,
      enabled: saved.tagUsersInRadarr,
      tagging: radarrTagging,
      removal: radarrRemoval,
    },
  ].filter((target) => target.enabled)

  const taggingOn = saved.tagUsersInSonarr || saved.tagUsersInRadarr
  const anyRunning =
    create.running || sync.running || cleanup.running || remove.running

  const actions: Record<TagActionId, TagActionState> = {
    sync: {
      running: sync.running,
      available: taggingOn,
      errorMessage: sync.errorMessage,
      result: resultRows(sync.result, syncResultRows),
      progress: targets.map((target) =>
        toActionProgress(target.name, target.tagging),
      ),
    },
    create: {
      running: create.running,
      available: taggingOn,
      errorMessage: create.errorMessage,
      result: resultRows(create.result, createResultRows),
    },
    cleanup: {
      running: cleanup.running,
      available: saved.cleanupOrphanedTags,
      errorMessage: cleanup.errorMessage,
      result: resultRows(cleanup.result, cleanupResultRows),
    },
    remove: {
      running: remove.running,
      available: taggingOn,
      errorMessage: remove.errorMessage,
      result: resultRows(remove.result, removeResultRows),
      progress: targets.map((target) =>
        toActionProgress(target.name, target.removal),
      ),
    },
  }

  const run = (id: Exclude<TagActionId, 'remove'>) => {
    const action = { create, sync, cleanup }[id]
    action.run()
  }

  return {
    actions,
    anyRunning,
    run,
    runRemove: remove.run,
  }
}
