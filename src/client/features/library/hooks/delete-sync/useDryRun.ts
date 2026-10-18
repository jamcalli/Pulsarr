import { withMinDuration } from '@/hooks/useMinLoading'
import { useOperation } from '@/hooks/useOperation'
import { NAV_PAGES } from '@/lib/navigation'
import { apiFetch } from '@/lib/tanstackApi'

interface DryRunContext {
  /** `dryRunKey` of the saved settings the run used. */
  key: string
  nothingSelected: boolean
  deleteFiles: boolean
}

export function useDryRun() {
  return useOperation({
    key: ['delete-sync', 'dry-run'],
    mutationFn: async (context: DryRunContext) => {
      const { data, error } = await withMinDuration(
        apiFetch.POST('/v1/scheduler/schedules/delete-sync/dry-run'),
      )
      if (error) throw error
      return { ...data, ...context }
    },
    meta: { label: 'Delete sync dry run', page: NAV_PAGES.deleteSync },
    errorFallback: 'The dry run did not finish. Try again.',
  })
}
