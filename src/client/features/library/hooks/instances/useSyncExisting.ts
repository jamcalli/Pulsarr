import type { ArrType } from '@/features/library/lib/instances/instance-form'
import { withMinDuration } from '@/hooks/useMinLoading'
import { useOperation } from '@/hooks/useOperation'
import { useProgress } from '@/hooks/useProgress'
import { toActionProgress } from '@/lib/action-state'
import { NAV_PAGES } from '@/lib/navigation'
import { apiFetch } from '@/lib/tanstackApi'

export function useSyncExisting(
  type: ArrType,
  target: { id: number; name: string },
) {
  const operation = useOperation({
    key: ['instances', 'sync-existing', type, String(target.id)],
    mutationFn: async () => {
      const { data, error } = await withMinDuration(
        apiFetch.POST('/v1/sync/instance/{instanceId}', {
          params: { path: { instanceId: target.id }, query: { type } },
        }),
      )
      if (error) throw error
      return data
    },
    meta: { label: `Copy to ${target.name}`, page: NAV_PAGES[type] },
    errorFallback: 'The copy did not finish. Try again.',
  })
  const progress = useProgress('sync')

  return {
    running: operation.running,
    errorMessage: operation.errorMessage,
    result: operation.result,
    progress: [toActionProgress(target.name, progress)],
    run: () => operation.run(),
  }
}
